create table app.application_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  application_id uuid not null,
  rank smallint not null check (rank between 1 and 3),
  name text not null check (char_length(name) between 1 and 200),
  role text not null check (char_length(role) between 1 and 200),
  profile_url text not null check (char_length(profile_url) between 1 and 2048),
  relationship text not null check (relationship in (
    'hiring_manager', 'founder_or_technical_leader', 'internal_recruiter',
    'job_author', 'team_leader'
  )),
  rationale text not null check (char_length(rationale) between 1 and 1000),
  sources jsonb not null check (
    jsonb_typeof(sources) = 'array'
    and jsonb_array_length(sources) between 1 and 6
  ),
  confidence text not null check (confidence in ('verified', 'likely', 'uncertain')),
  connection_note text not null check (char_length(connection_note) between 1 and 500),
  accepted_message text not null check (char_length(accepted_message) between 1 and 2000),
  follow_up_message text check (char_length(follow_up_message) between 1 and 2000),
  status text not null default 'suggested' check (status in (
    'suggested', 'contacted', 'accepted', 'follow_up', 'replied', 'closed'
  )),
  follow_up_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  actor_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, application_id, rank),
  unique (tenant_id, application_id, profile_url),
  foreign key (tenant_id, application_id)
    references app.applications(tenant_id, id) on delete cascade,
  check (status <> 'follow_up' or follow_up_at is not null)
);

create index application_contacts_application
  on app.application_contacts (tenant_id, application_id, rank);

alter table app.application_contacts enable row level security;
alter table app.application_contacts force row level security;
create policy application_contact_tenant on app.application_contacts
  using (app.active_tenant(tenant_id))
  with check (app.active_tenant(tenant_id));

grant select, insert, update on app.application_contacts to career_app;

create function app.validate_application_contact_update() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if new.id is distinct from old.id
    or new.tenant_id is distinct from old.tenant_id
    or new.application_id is distinct from old.application_id
    or new.rank is distinct from old.rank
    or new.name is distinct from old.name
    or new.role is distinct from old.role
    or new.profile_url is distinct from old.profile_url
    or new.relationship is distinct from old.relationship
    or new.rationale is distinct from old.rationale
    or new.sources is distinct from old.sources
    or new.confidence is distinct from old.confidence
    or new.actor_id is distinct from old.actor_id
    or new.created_at is distinct from old.created_at
    or new.revision <> old.revision + 1 then
    raise exception 'invalid application contact update';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end
$$;

create trigger application_contact_update_valid
before update on app.application_contacts
for each row execute function app.validate_application_contact_update();

revoke execute on function app.validate_application_contact_update()
from public;
