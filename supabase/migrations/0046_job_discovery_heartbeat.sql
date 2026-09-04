alter table app.worker_heartbeats
  drop constraint worker_heartbeats_service_check,
  add constraint worker_heartbeats_service_check check (service in (
    'company-researcher',
    'evidence-archivist',
    'recruiter-strategist',
    'page-composer',
    'recruiter-reviewer',
    'hiring-manager-reviewer',
    'factuality-reviewer',
    'job-discovery'
  ));

create or replace function app.record_worker_heartbeat(target_service text)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  active_role text := nullif(current_setting('role', true), 'none');
  expected_role text;
  recorded_at timestamptz := clock_timestamp();
begin
  expected_role := case target_service
    when 'company-researcher' then 'career_company_researcher'
    when 'evidence-archivist' then 'career_evidence_archivist'
    when 'recruiter-strategist' then 'career_recruiter_strategist'
    when 'page-composer' then 'career_page_composer'
    when 'recruiter-reviewer' then 'career_recruiter_reviewer'
    when 'hiring-manager-reviewer' then 'career_hiring_manager_reviewer'
    when 'factuality-reviewer' then 'career_factuality_reviewer'
    when 'job-discovery' then 'career_job_discovery'
    else null
  end;

  if expected_role is null
    or active_role is distinct from expected_role
    or not pg_has_role(session_user, expected_role, 'member')
  then
    raise exception 'worker heartbeat denied' using errcode = '42501';
  end if;

  insert into app.worker_heartbeats (service, last_seen_at)
  values (target_service, recorded_at)
  on conflict (service) do update
  set last_seen_at = greatest(
    app.worker_heartbeats.last_seen_at,
    excluded.last_seen_at
  );
  return recorded_at;
end
$$;

create or replace function app.worker_service_status(target_service text)
returns table (service text, last_seen_at timestamptz, status text)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if target_service is null or target_service not in (
    'company-researcher',
    'evidence-archivist',
    'recruiter-strategist',
    'page-composer',
    'recruiter-reviewer',
    'hiring-manager-reviewer',
    'factuality-reviewer',
    'job-discovery'
  ) then
    raise exception 'unknown worker service' using errcode = '22023';
  end if;

  return query
  select target_service, heartbeat.last_seen_at,
    case
      when heartbeat.last_seen_at is null then 'missing'
      when heartbeat.last_seen_at >= clock_timestamp() - interval '15 seconds'
        then 'fresh'
      else 'stale'
    end
  from (values (true)) as singleton(present)
  left join app.worker_heartbeats heartbeat
    on heartbeat.service = target_service;
end
$$;

revoke all on app.worker_heartbeats from career_job_discovery;
revoke execute on function app.record_worker_heartbeat(text),
  app.worker_service_status(text) from public;
grant execute on function app.record_worker_heartbeat(text)
  to career_job_discovery;
