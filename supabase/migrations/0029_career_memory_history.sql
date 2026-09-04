alter type app.provenance_level add value if not exists 'unsupported';

alter table app.sources drop constraint sources_kind_check;
alter table app.sources add constraint sources_kind_check
  check (kind in ('document', 'web', 'manual', 'linkedin'));

alter table app.claims add column kind text not null default 'other'
  check (kind in (
    'summary', 'experience', 'project', 'skill', 'education',
    'result', 'preference', 'other'
  ));

create table app.profile_revisions (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  profile_id uuid not null,
  revision bigint not null check (revision > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, profile_id, revision),
  foreign key (tenant_id, profile_id)
    references app.profiles(tenant_id, id) on delete cascade
);

alter table app.profile_revisions enable row level security;
alter table app.profile_revisions force row level security;
create policy profile_revision_tenant on app.profile_revisions
  using (app.active_tenant(tenant_id))
  with check (app.active_tenant(tenant_id));
grant select, insert on app.profile_revisions to career_app;
grant usage, select on sequence app.profile_revisions_id_seq to career_app;

create function app.reject_profile_revision_mutation() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  raise exception 'Career Memory revision history is immutable';
end
$$;

create trigger profile_revision_immutable
before update or delete on app.profile_revisions
for each row execute function app.reject_profile_revision_mutation();

create function app.reject_unpublishable_claim_provenance() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if exists (
    select 1
    from app.page_spec_claims selected
    join app.claims claim
      on claim.tenant_id = selected.tenant_id
      and claim.id = selected.claim_id
    where selected.tenant_id = new.tenant_id
      and selected.page_spec_id = new.page_spec_id
      and claim.level::text in ('inferred', 'unsupported')
  ) then
    raise exception 'publication contains inferred or unsupported claims';
  end if;
  return new;
end
$$;

create trigger publication_provenance_gate
before insert or update of tenant_id, page_spec_id on app.publications
for each row execute function app.reject_unpublishable_claim_provenance();

revoke execute on function app.reject_profile_revision_mutation(),
  app.reject_unpublishable_claim_provenance()
from public;
