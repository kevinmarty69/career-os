alter table app.applications
  add column discovered_job_id uuid,
  add constraint application_discovered_job_fk
    foreign key (tenant_id, discovered_job_id)
    references app.discovered_jobs(tenant_id, id)
    on delete set null (discovered_job_id);

create unique index applications_active_discovered_job
  on app.applications (tenant_id, discovered_job_id)
  where discovered_job_id is not null and deleted_at is null;

create or replace function app.validate_application_update() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if pg_trigger_depth() > 1
    and old.discovered_job_id is not null
    and new.discovered_job_id is null then
    new.revision := old.revision + 1;
    new.updated_at := now();
    return new;
  end if;
  if old.deleted_at is not null then
    raise exception 'deleted applications are immutable';
  end if;
  if new.id is distinct from old.id
    or new.tenant_id is distinct from old.tenant_id
    or new.discovered_job_id is distinct from old.discovered_job_id
    or new.create_idempotency_key is distinct from old.create_idempotency_key
    or new.create_input_hash is distinct from old.create_input_hash
    or new.created_at is distinct from old.created_at
    or new.revision <> old.revision + 1 then
    raise exception 'invalid application update';
  end if;
  new.updated_at := now();
  return new;
end $$;
