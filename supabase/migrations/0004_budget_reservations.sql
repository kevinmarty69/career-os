create function app.current_worker_id() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.worker_id', true), '')::uuid
$$;

create table app.run_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  workflow_run_id uuid not null,
  idempotency_key text not null check (length(idempotency_key) between 1 and 200),
  owner_id uuid not null,
  requested_tokens integer not null check (requested_tokens >= 0),
  requested_cost_micros bigint not null check (requested_cost_micros >= 0),
  lease_expires_at timestamptz not null,
  status text not null default 'reserved' check (status in ('reserved', 'settled', 'released')),
  actual_tokens integer check (actual_tokens >= 0 and actual_tokens <= requested_tokens),
  actual_cost_micros bigint check (actual_cost_micros >= 0 and actual_cost_micros <= requested_cost_micros),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (tenant_id, workflow_run_id, idempotency_key),
  foreign key (tenant_id, workflow_run_id)
    references app.workflow_runs(tenant_id, id) on delete cascade,
  check (requested_tokens > 0 or requested_cost_micros > 0),
  check (
    (status = 'reserved' and actual_tokens is null and actual_cost_micros is null and finished_at is null)
    or (status = 'settled' and actual_tokens is not null and actual_cost_micros is not null and finished_at is not null)
    or (status = 'released' and actual_tokens is null and actual_cost_micros is null and finished_at is not null)
  )
);

alter table app.run_budget_reservations enable row level security;
alter table app.run_budget_reservations force row level security;

-- Legacy aggregate-only reservations cannot be assigned safely to an owner.
update app.workflow_runs set reserved_tokens = 0, reserved_cost_micros = 0
where reserved_tokens <> 0 or reserved_cost_micros <> 0;

drop function app.reserve_run_budget(uuid, uuid, integer, bigint);
drop function app.settle_run_budget(uuid, uuid, integer, bigint, integer, bigint);

create function app.reserve_run_budget(
  run_tenant uuid, run_id uuid, reservation_key text,
  reserve_tokens integer, reserve_cost bigint, lease_seconds integer
) returns uuid language plpgsql security definer set search_path = app, pg_temp as $$
declare
  worker_id uuid := app.current_worker_id();
  existing app.run_budget_reservations%rowtype;
  expired_tokens bigint;
  expired_cost bigint;
  reservation_id uuid;
  reclaim_before timestamptz;
begin
  if run_tenant is null or run_id is null or worker_id is null
    or reservation_key is null or length(reservation_key) not between 1 and 200
    or reserve_tokens is null or reserve_cost is null
    or reserve_tokens < 0 or reserve_cost < 0 or (reserve_tokens = 0 and reserve_cost = 0)
    or lease_seconds is null or lease_seconds not between 1 and 3600 then
    raise exception 'invalid budget reservation';
  end if;
  if run_tenant is distinct from app.current_tenant_id() then
    raise exception 'tenant context mismatch';
  end if;

  perform 1 from app.workflow_runs
  where tenant_id = run_tenant and id = run_id for update;
  if not found then raise exception 'budget run not found'; end if;

  reclaim_before := clock_timestamp();
  select coalesce(sum(requested_tokens), 0), coalesce(sum(requested_cost_micros), 0)
  into expired_tokens, expired_cost
  from app.run_budget_reservations
  where tenant_id = run_tenant and workflow_run_id = run_id
    and status = 'reserved' and lease_expires_at <= reclaim_before;
  if expired_tokens > 0 or expired_cost > 0 then
    update app.workflow_runs
    set reserved_tokens = reserved_tokens - expired_tokens,
        reserved_cost_micros = reserved_cost_micros - expired_cost
    where tenant_id = run_tenant and id = run_id
      and reserved_tokens >= expired_tokens and reserved_cost_micros >= expired_cost;
    if not found then raise exception 'budget reservation aggregate corrupted'; end if;
    update app.run_budget_reservations
    set status = 'released', finished_at = clock_timestamp()
    where tenant_id = run_tenant and workflow_run_id = run_id
      and status = 'reserved' and lease_expires_at <= reclaim_before;
  end if;

  select * into existing from app.run_budget_reservations
  where tenant_id = run_tenant and workflow_run_id = run_id
    and idempotency_key = reservation_key;
  if found then
    if existing.owner_id is distinct from worker_id
      or existing.requested_tokens <> reserve_tokens
      or existing.requested_cost_micros <> reserve_cost then
      raise exception 'budget idempotency key conflict';
    end if;
    if existing.status <> 'reserved' then
      raise exception 'budget idempotency key already finalized';
    end if;
    return existing.id;
  end if;

  update app.workflow_runs
  set reserved_tokens = reserved_tokens + reserve_tokens,
      reserved_cost_micros = reserved_cost_micros + reserve_cost
  where tenant_id = run_tenant and id = run_id and status = 'running'
    and deadline_at > clock_timestamp()
    and used_tokens + reserved_tokens + reserve_tokens <= token_budget
    and used_cost_micros + reserved_cost_micros + reserve_cost <= cost_budget_micros;
  if not found then raise exception 'budget reservation rejected'; end if;

  insert into app.run_budget_reservations (
    tenant_id, workflow_run_id, idempotency_key, owner_id,
    requested_tokens, requested_cost_micros, lease_expires_at
  ) values (
    run_tenant, run_id, reservation_key, worker_id,
    reserve_tokens, reserve_cost, clock_timestamp() + make_interval(secs => lease_seconds)
  ) returning id into reservation_id;
  return reservation_id;
end $$;

create function app.settle_run_budget(
  reservation_id uuid, actual_tokens integer, actual_cost bigint
) returns void language plpgsql security definer set search_path = app, pg_temp as $$
declare
  worker_id uuid := app.current_worker_id();
  reservation app.run_budget_reservations%rowtype;
  reservation_tenant uuid;
  reservation_run uuid;
begin
  if reservation_id is null or worker_id is null
    or actual_tokens is null or actual_cost is null
    or actual_tokens < 0 or actual_cost < 0 then
    raise exception 'invalid budget settlement';
  end if;
  select tenant_id, workflow_run_id into reservation_tenant, reservation_run
  from app.run_budget_reservations where id = reservation_id;
  if not found or reservation_tenant is distinct from app.current_tenant_id() then
    raise exception 'budget reservation not found';
  end if;

  perform 1 from app.workflow_runs
  where tenant_id = reservation_tenant and id = reservation_run for update;
  select * into reservation from app.run_budget_reservations
  where id = reservation_id for update;
  if reservation.owner_id is distinct from worker_id then
    raise exception 'budget reservation owner mismatch';
  end if;
  if reservation.status <> 'reserved' then
    raise exception 'budget reservation already finalized';
  end if;
  if reservation.lease_expires_at <= clock_timestamp() then
    raise exception 'budget reservation lease expired';
  end if;
  if actual_tokens > reservation.requested_tokens
    or actual_cost > reservation.requested_cost_micros then
    raise exception 'usage exceeds reservation';
  end if;

  update app.workflow_runs
  set reserved_tokens = reserved_tokens - reservation.requested_tokens,
      reserved_cost_micros = reserved_cost_micros - reservation.requested_cost_micros,
      used_tokens = used_tokens + actual_tokens,
      used_cost_micros = used_cost_micros + actual_cost
  where tenant_id = reservation.tenant_id and id = reservation.workflow_run_id
    and reserved_tokens >= reservation.requested_tokens
    and reserved_cost_micros >= reservation.requested_cost_micros;
  if not found then raise exception 'budget reservation aggregate corrupted'; end if;
  update app.run_budget_reservations
  set status = 'settled', actual_tokens = settle_run_budget.actual_tokens,
      actual_cost_micros = settle_run_budget.actual_cost, finished_at = clock_timestamp()
  where id = reservation_id;
end $$;

create function app.release_run_budget(reservation_id uuid) returns void
language plpgsql security definer set search_path = app, pg_temp as $$
declare
  worker_id uuid := app.current_worker_id();
  reservation app.run_budget_reservations%rowtype;
  reservation_tenant uuid;
  reservation_run uuid;
begin
  if reservation_id is null or worker_id is null then
    raise exception 'invalid budget release';
  end if;
  select tenant_id, workflow_run_id into reservation_tenant, reservation_run
  from app.run_budget_reservations where id = reservation_id;
  if not found or reservation_tenant is distinct from app.current_tenant_id() then
    raise exception 'budget reservation not found';
  end if;

  perform 1 from app.workflow_runs
  where tenant_id = reservation_tenant and id = reservation_run for update;
  select * into reservation from app.run_budget_reservations
  where id = reservation_id for update;
  if reservation.owner_id is distinct from worker_id then
    raise exception 'budget reservation owner mismatch';
  end if;
  if reservation.status <> 'reserved' then
    raise exception 'budget reservation already finalized';
  end if;

  update app.workflow_runs
  set reserved_tokens = reserved_tokens - reservation.requested_tokens,
      reserved_cost_micros = reserved_cost_micros - reservation.requested_cost_micros
  where tenant_id = reservation.tenant_id and id = reservation.workflow_run_id
    and reserved_tokens >= reservation.requested_tokens
    and reserved_cost_micros >= reservation.requested_cost_micros;
  if not found then raise exception 'budget reservation aggregate corrupted'; end if;
  update app.run_budget_reservations
  set status = 'released', finished_at = clock_timestamp()
  where id = reservation_id;
end $$;

grant execute on function app.reserve_run_budget(uuid, uuid, text, integer, bigint, integer),
  app.settle_run_budget(uuid, integer, bigint), app.release_run_budget(uuid) to career_worker;
revoke execute on function app.current_worker_id(),
  app.reserve_run_budget(uuid, uuid, text, integer, bigint, integer),
  app.settle_run_budget(uuid, integer, bigint), app.release_run_budget(uuid) from public;
