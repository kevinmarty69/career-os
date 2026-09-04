create table app.application_timeline_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  application_id uuid not null,
  kind text not null check (
    kind in ('contact', 'interview', 'response', 'outcome')
  ),
  title text not null check (char_length(title) between 1 and 200),
  note text check (note is null or char_length(note) <= 2000),
  occurred_at timestamptz not null,
  actor text not null default 'human' check (actor = 'human'),
  actor_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  foreign key (tenant_id, application_id)
    references app.applications(tenant_id, id) on delete cascade
);

create index application_timeline_recent
  on app.application_timeline_events (
    tenant_id, application_id, occurred_at desc, created_at desc
  );

alter table app.application_timeline_events enable row level security;
alter table app.application_timeline_events force row level security;
create policy application_timeline_tenant on app.application_timeline_events
  using (app.active_tenant(tenant_id))
  with check (app.active_tenant(tenant_id));

grant select, insert on app.application_timeline_events to career_app;
