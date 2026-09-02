alter table app.reviews add unique (tenant_id, id);
alter table app.reviews add constraint reviews_verdict_issues_consistent check (
  jsonb_typeof(issues) = 'array'
  and (
    (verdict = 'pass' and jsonb_array_length(issues) = 0)
    or (verdict = 'changes_required' and jsonb_array_length(issues) > 0)
  )
);

create table app.review_issue_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  workflow_run_id uuid not null,
  page_spec_id uuid not null,
  review_id uuid not null,
  issue_index integer not null check (issue_index >= 0),
  issue_text text not null,
  decision text not null check (decision in ('keep', 'correct')),
  corrected_run_id uuid,
  decided_by uuid not null,
  idempotency_key uuid not null,
  input_hash text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, review_id, issue_index),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, workflow_run_id)
    references app.workflow_runs(tenant_id, id) on delete cascade,
  foreign key (tenant_id, page_spec_id)
    references app.page_specs(tenant_id, id) on delete cascade,
  foreign key (tenant_id, review_id)
    references app.reviews(tenant_id, id) on delete cascade,
  foreign key (tenant_id, corrected_run_id)
    references app.workflow_runs(tenant_id, id),
  check (
    (decision = 'keep' and corrected_run_id is null)
    or (decision = 'correct' and corrected_run_id is not null)
  ),
  check (corrected_run_id is null or corrected_run_id <> workflow_run_id)
);

alter table app.review_issue_decisions enable row level security;
alter table app.review_issue_decisions force row level security;
create policy review_issue_decision_tenant on app.review_issue_decisions
  using (app.active_tenant(tenant_id))
  with check (app.active_tenant(tenant_id));

create function app.validate_review_issue_decision() returns trigger
language plpgsql set search_path = app, pg_temp as $$
declare target_reviewer text; target_issue text; target_run uuid;
  source_profile uuid; source_opportunity uuid;
  corrected_profile uuid; corrected_opportunity uuid;
begin
  if new.decided_by is distinct from app.current_user_id() then
    raise exception 'review issue decision actor mismatch';
  end if;
  select r.reviewer,
    case jsonb_typeof(r.issues -> new.issue_index)
      when 'object' then r.issues -> new.issue_index ->> 'message'
    end,
    ps.workflow_run_id
  into target_reviewer, target_issue, target_run
  from reviews r join page_specs ps
    on ps.tenant_id = r.tenant_id and ps.id = r.page_spec_id
  where r.tenant_id = new.tenant_id and r.id = new.review_id
    and r.page_spec_id = new.page_spec_id;
  if target_issue is null or target_issue is distinct from new.issue_text then
    raise exception 'review issue decision does not match an immutable issue';
  end if;
  if target_run is distinct from new.workflow_run_id then
    raise exception 'review issue decision run mismatch';
  end if;
  if new.decision = 'keep' and target_reviewer = 'factuality' then
    raise exception 'factuality objections cannot be kept';
  end if;
  if new.decision = 'correct' then
    select source.profile_id, source.opportunity_id,
      corrected.profile_id, corrected.opportunity_id
    into source_profile, source_opportunity,
      corrected_profile, corrected_opportunity
    from workflow_runs source join workflow_runs corrected
      on corrected.tenant_id = source.tenant_id
        and corrected.id = new.corrected_run_id
    where source.tenant_id = new.tenant_id
      and source.id = new.workflow_run_id;
    if corrected_profile is null
      or corrected_profile is distinct from source_profile
      or corrected_opportunity is distinct from source_opportunity then
      raise exception 'corrected run must preserve profile and opportunity';
    end if;
  end if;
  return new;
end $$;

create trigger review_issue_decision_valid
before insert on app.review_issue_decisions
for each row execute function app.validate_review_issue_decision();
create trigger review_issue_decision_immutable
before update or delete on app.review_issue_decisions
for each row execute function app.immutable_gate_row();

create function app.page_spec_review_gate(
  target_tenant uuid, target_page_spec uuid, target_hash text
) returns boolean language sql stable security definer
set search_path = app, pg_temp as $$
  select target_tenant is not distinct from app.current_tenant_id()
  and app.active_tenant(target_tenant)
  and exists(
    select 1 from page_specs current_spec
    where current_spec.tenant_id = target_tenant
      and current_spec.id = target_page_spec
      and current_spec.spec_hash = target_hash
      and current_spec.invalidated_at is null
      and not exists(
        select 1 from page_specs newer
        where newer.tenant_id = current_spec.tenant_id
          and newer.workflow_run_id = current_spec.workflow_run_id
          and newer.invalidated_at is null
          and newer.version > current_spec.version
      )
  )
  and (select count(*) from reviews r
    where r.tenant_id = target_tenant and r.page_spec_id = target_page_spec) = 3
  and not exists(
    select 1 from reviews r
    where r.tenant_id = target_tenant and r.page_spec_id = target_page_spec
      and (
        r.page_spec_hash <> target_hash
        or (r.reviewer = 'factuality' and r.verdict <> 'pass')
        or (r.reviewer in ('recruiter', 'hiring_manager')
          and r.verdict <> 'pass' and (
            jsonb_array_length(case when jsonb_typeof(r.issues) = 'array'
              then r.issues else '[]'::jsonb end) = 0
            or exists(
              select 1 from jsonb_array_elements(
                case when jsonb_typeof(r.issues) = 'array'
                  then r.issues else '[]'::jsonb end
              ) with ordinality issue(value, position)
              where not exists(
                select 1 from review_issue_decisions d
                where d.tenant_id = r.tenant_id and d.review_id = r.id
                  and d.issue_index = issue.position - 1
                  and d.decision = 'keep'
              )
            )
          ))
      )
  )
$$;

create or replace function app.approve_page_spec(target_page_spec uuid) returns uuid
language plpgsql security definer set search_path = app, pg_temp as $$
declare approval_id uuid; target_tenant uuid; target_hash text;
begin
  select tenant_id, spec_hash into target_tenant, target_hash from page_specs
  where id = target_page_spec and invalidated_at is null;
  if target_tenant is null or not owns_tenant(target_tenant) then
    raise exception 'approval denied';
  end if;
  if not app.page_spec_review_gate(
    target_tenant, target_page_spec, target_hash
  ) then
    raise exception 'approval requires passing reviews or explicit non-factual keeps';
  end if;
  insert into approvals (tenant_id, page_spec_id, page_spec_hash, approved_by)
  values (target_tenant, target_page_spec, target_hash, current_user_id())
  returning id into approval_id;
  return approval_id;
end $$;

create or replace function app.check_publication() returns trigger
language plpgsql set search_path = app, pg_temp as $$
declare actual_hash text;
begin
  select spec_hash into actual_hash from page_specs
  where tenant_id = new.tenant_id and id = new.page_spec_id
    and invalidated_at is null;
  if actual_hash is null or new.page_spec_hash <> actual_hash then
    raise exception 'publication requires the current immutable PageSpec hash';
  end if;
  if not app.page_spec_review_gate(
    new.tenant_id, new.page_spec_id, actual_hash
  ) then
    raise exception 'publication review gate rejected this PageSpec';
  end if;
  if not exists(select 1 from approvals where tenant_id = new.tenant_id
    and page_spec_id = new.page_spec_id and page_spec_hash = actual_hash) then
    raise exception 'publication requires human approval for this hash';
  end if;
  if not exists(select 1 from page_spec_claims where tenant_id = new.tenant_id
      and page_spec_id = new.page_spec_id)
    or exists(
      select 1 from page_spec_claims psc
      left join claims c on c.tenant_id = psc.tenant_id and c.id = psc.claim_id
      where psc.tenant_id = new.tenant_id and psc.page_spec_id = new.page_spec_id
        and (c.id is null or c.sensitivity = 'restricted'
          or not ('application' = any(c.allowed_uses))
          or not exists(select 1 from claim_evidence ce
            join evidence e on e.tenant_id = ce.tenant_id
              and e.id = ce.evidence_id
            join sources s on s.tenant_id = e.tenant_id
              and s.id = e.source_id
            where ce.tenant_id = c.tenant_id and ce.claim_id = c.id
              and ce.relation = 'supports' and s.sensitivity <> 'restricted'
              and 'application' = any(s.allowed_uses))
          or exists(select 1 from claim_evidence ce
            join evidence e on e.tenant_id = ce.tenant_id
              and e.id = ce.evidence_id
            join sources s on s.tenant_id = e.tenant_id
              and s.id = e.source_id
            where ce.tenant_id = c.tenant_id and ce.claim_id = c.id
              and (s.sensitivity = 'restricted'
                or not ('application' = any(s.allowed_uses)))))
    ) then
    raise exception 'publication contains an unknown, restricted or unsupported claim';
  end if;
  if exists(
    (select claim_value.value from page_specs ps,
      jsonb_array_elements(ps.spec -> 'blocks') block,
      jsonb_array_elements_text(
        coalesce(block -> 'claimIds', '[]'::jsonb)
      ) claim_value(value)
      where ps.tenant_id = new.tenant_id and ps.id = new.page_spec_id
     except select claim_id::text from page_spec_claims
      where tenant_id = new.tenant_id and page_spec_id = new.page_spec_id)
    union
    (select claim_id::text from page_spec_claims
      where tenant_id = new.tenant_id and page_spec_id = new.page_spec_id
     except select claim_value.value from page_specs ps,
      jsonb_array_elements(ps.spec -> 'blocks') block,
      jsonb_array_elements_text(
        coalesce(block -> 'claimIds', '[]'::jsonb)
      ) claim_value(value)
      where ps.tenant_id = new.tenant_id and ps.id = new.page_spec_id)
  ) then raise exception 'PageSpec claim mapping mismatch'; end if;
  return new;
end $$;

grant select, insert on app.review_issue_decisions to career_app;
revoke update, delete on app.review_issue_decisions from career_app;
grant execute on function app.page_spec_review_gate(uuid, uuid, text)
  to career_app;
revoke execute on function app.page_spec_review_gate(uuid, uuid, text),
  app.validate_review_issue_decision() from public;
