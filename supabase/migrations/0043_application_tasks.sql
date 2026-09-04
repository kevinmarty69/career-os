create table app.application_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  application_id uuid not null,
  kind text not null check (kind in ('task', 'follow_up')),
  title text not null check (char_length(title) between 1 and 200),
  due_at timestamptz not null,
  completed_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  actor_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  foreign key (tenant_id, application_id)
    references app.applications(tenant_id, id) on delete cascade
);

create index application_tasks_due
  on app.application_tasks (
    tenant_id, application_id, completed_at, due_at, created_at
  );

alter table app.application_tasks enable row level security;
alter table app.application_tasks force row level security;
create policy application_task_tenant on app.application_tasks
  using (app.active_tenant(tenant_id))
  with check (app.active_tenant(tenant_id));

grant select, insert, update on app.application_tasks to career_app;

create function app.validate_application_task_update() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if new.id is distinct from old.id
    or new.tenant_id is distinct from old.tenant_id
    or new.application_id is distinct from old.application_id
    or new.kind is distinct from old.kind
    or new.title is distinct from old.title
    or new.due_at is distinct from old.due_at
    or new.actor_id is distinct from old.actor_id
    or new.created_at is distinct from old.created_at
    or new.revision <> old.revision + 1 then
    raise exception 'invalid application task update';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end
$$;

create trigger application_task_update_valid
before update on app.application_tasks
for each row execute function app.validate_application_task_update();

revoke execute on function app.validate_application_task_update()
from public;
