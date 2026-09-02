create table app.applications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  company text not null check (char_length(company) between 1 and 200),
  role text not null check (char_length(role) between 1 and 200),
  raw_text text not null check (char_length(raw_text) between 1 and 20000),
  url text check (url is null or char_length(url) <= 2048),
  accent text not null check (accent ~ '^#[0-9a-fA-F]{6}$'),
  stage text not null default 'draft'
    check (stage in ('draft', 'applied', 'interview', 'offer', 'closed')),
  revision bigint not null default 1 check (revision > 0),
  create_idempotency_key uuid not null,
  create_input_hash text not null check (create_input_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, id),
  unique (tenant_id, create_idempotency_key)
);

alter table app.applications enable row level security;
alter table app.applications force row level security;
create policy application_tenant on app.applications
  using (app.active_tenant(tenant_id))
  with check (app.active_tenant(tenant_id));

grant select, insert, update on app.applications to career_app;

create function app.validate_application_update() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if old.deleted_at is not null then
    raise exception 'deleted applications are immutable';
  end if;
  if new.id is distinct from old.id
    or new.tenant_id is distinct from old.tenant_id
    or new.create_idempotency_key is distinct from old.create_idempotency_key
    or new.create_input_hash is distinct from old.create_input_hash
    or new.created_at is distinct from old.created_at
    or new.revision <> old.revision + 1 then
    raise exception 'invalid application update';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger application_update_valid
before update on app.applications
for each row execute function app.validate_application_update();

alter table app.opportunities
  add column application_id uuid,
  add column application_revision bigint;

insert into app.applications (
  id, tenant_id, company, role, raw_text, url, accent, stage,
  create_idempotency_key, create_input_hash
)
select o.id, o.tenant_id,
  left(coalesce(nullif(btrim(o.company), ''), 'Unknown company'), 200),
  left(coalesce(nullif(btrim(o.role), ''), 'Unknown role'), 200),
  left(coalesce(
    nullif(btrim(o.raw_text), ''),
    concat(
      left(coalesce(nullif(btrim(o.company), ''), 'Unknown company'), 200),
      ' - ',
      left(coalesce(nullif(btrim(o.role), ''), 'Unknown role'), 200)
    )
  ), 20000),
  case
    when char_length(o.url) <= 2048
      and o.url ~* '^https?://[^[:space:]]+$' then o.url
    else null
  end,
  '#5847e8', 'draft', gen_random_uuid(),
  encode(digest(jsonb_build_object(
    'company', o.company, 'role', o.role, 'description', o.raw_text,
    'url', o.url
  )::text, 'sha256'), 'hex')
from app.opportunities o;

update app.opportunities
set application_id = id, application_revision = 1;

alter table app.opportunities
  alter column application_id set not null,
  alter column application_revision set not null,
  add constraint opportunity_application_revision_positive
    check (application_revision > 0),
  add constraint opportunity_application_fk
    foreign key (tenant_id, application_id)
    references app.applications(tenant_id, id);

create index opportunities_application
  on app.opportunities (tenant_id, application_id, application_revision);

create function app.reject_opportunity_snapshot_mutation() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception 'opportunity snapshots are immutable';
end $$;

create trigger opportunity_snapshot_immutable
before update or delete on app.opportunities
for each row execute function app.reject_opportunity_snapshot_mutation();

create function app.revoke_deleted_application() returns trigger
language plpgsql security definer set search_path = app, pg_temp as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update publications p set revoked_at = now()
    from page_specs ps
    join workflow_runs wr on wr.tenant_id = ps.tenant_id
      and wr.id = ps.workflow_run_id
    join opportunities o on o.tenant_id = wr.tenant_id
      and o.id = wr.opportunity_id
    where p.tenant_id = new.tenant_id and p.page_spec_id = ps.id
      and o.application_id = new.id and p.revoked_at is null;

    update share_links sl set revoked_at = now()
    from publications p
    join page_specs ps on ps.tenant_id = p.tenant_id
      and ps.id = p.page_spec_id
    join workflow_runs wr on wr.tenant_id = ps.tenant_id
      and wr.id = ps.workflow_run_id
    join opportunities o on o.tenant_id = wr.tenant_id
      and o.id = wr.opportunity_id
    where sl.tenant_id = new.tenant_id and sl.publication_id = p.id
      and o.application_id = new.id and sl.revoked_at is null;
  end if;
  return new;
end $$;

create trigger application_delete_revokes
after update of deleted_at on app.applications
for each row execute function app.revoke_deleted_application();

create function app.require_active_application_for_share_link() returns trigger
language plpgsql security definer set search_path = app, pg_temp as $$
begin
  perform 1 from applications a
  join opportunities o on o.tenant_id = a.tenant_id
    and o.application_id = a.id
  join workflow_runs wr on wr.tenant_id = o.tenant_id
    and wr.opportunity_id = o.id
  join page_specs ps on ps.tenant_id = wr.tenant_id
    and ps.workflow_run_id = wr.id
  join publications p on p.tenant_id = ps.tenant_id
    and p.page_spec_id = ps.id
  where p.tenant_id = new.tenant_id and p.id = new.publication_id
    and a.deleted_at is null
  for share of a;
  if not found then
    raise exception 'share link requires an active application';
  end if;
  return new;
end $$;

create trigger share_link_application_active
before insert on app.share_links
for each row execute function app.require_active_application_for_share_link();

revoke execute on function app.validate_application_update(),
  app.reject_opportunity_snapshot_mutation(),
  app.revoke_deleted_application(),
  app.require_active_application_for_share_link() from public;
