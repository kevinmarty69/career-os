\set ON_ERROR_STOP on

begin;

insert into app.tenants (id, owner_id, name) values
  ('d1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'Inventory tenant'),
  ('d1000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000002', 'Other inventory tenant');

insert into app.applications (
  id, tenant_id, company, role, raw_text, accent, create_idempotency_key,
  create_input_hash
) values
  ('c1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
    'Inventory Co', 'Engineer', 'Inventory test', '#21504b', gen_random_uuid(), repeat('a', 64)),
  ('c1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002',
    'Other Co', 'Engineer', 'Isolation test', '#21504b', gen_random_uuid(), repeat('b', 64));

insert into app.opportunities (
  id, tenant_id, application_id, application_revision, company, role,
  raw_text, extraction_status
)
select ('71000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'd1000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001', 1,
  'Inventory Co', 'Engineer', 'Inventory test', 'ready'
from generate_series(1, 101) n;

insert into app.opportunities (
  id, tenant_id, application_id, application_revision, company, role,
  raw_text, extraction_status
) values (
  '71000000-0000-4000-8000-999999999999',
  'd1000000-0000-4000-8000-000000000002',
  'c1000000-0000-4000-8000-000000000002', 1,
  'Other Co', 'Engineer', 'Isolation test', 'ready'
);

insert into app.workflow_runs (
  id, tenant_id, opportunity_id, state, status, token_budget,
  cost_budget_micros, deadline_at
)
select ('81000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'd1000000-0000-4000-8000-000000000001',
  ('71000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'publication_ready', 'completed', 1, 0, now() + interval '1 hour'
from generate_series(1, 101) n;

insert into app.workflow_runs (
  id, tenant_id, opportunity_id, state, status, token_budget,
  cost_budget_micros, deadline_at
) values (
  '81000000-0000-4000-8000-999999999999',
  'd1000000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-999999999999',
  'publication_ready', 'completed', 1, 0, now() + interval '1 hour'
);

insert into app.page_specs (id, tenant_id, workflow_run_id, version, spec)
select ('91000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'd1000000-0000-4000-8000-000000000001',
  ('81000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  1, '{"blocks":[]}'::jsonb
from generate_series(1, 101) n;

insert into app.page_specs (id, tenant_id, workflow_run_id, version, spec)
values (
  '91000000-0000-4000-8000-999999999999',
  'd1000000-0000-4000-8000-000000000002',
  '81000000-0000-4000-8000-999999999999', 1, '{"blocks":[]}'::jsonb
);

set local session_replication_role = replica;

insert into app.publications (
  id, tenant_id, page_spec_id, published_at, revoked_at
)
select ('a1000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'd1000000-0000-4000-8000-000000000001',
  ('91000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  clock_timestamp() - n * interval '1 minute',
  case when n = 2 then clock_timestamp() else null end
from generate_series(1, 101) n;

insert into app.share_links (
  id, tenant_id, publication_id, token_hash, expires_at, revoked_at
)
select ('b1000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'd1000000-0000-4000-8000-000000000001',
  ('a1000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  digest('inventory-' || n, 'sha256'),
  case when n = 1 then clock_timestamp() - interval '1 day'
    else clock_timestamp() + interval '1 day' end,
  case when n = 2 then clock_timestamp() else null end
from generate_series(1, 101) n;

insert into app.publications (id, tenant_id, page_spec_id, published_at)
values (
  'a1000000-0000-4000-8000-999999999999',
  'd1000000-0000-4000-8000-000000000002',
  '91000000-0000-4000-8000-999999999999', clock_timestamp()
);
insert into app.share_links (
  id, tenant_id, publication_id, token_hash, expires_at
) values (
  'b1000000-0000-4000-8000-999999999999',
  'd1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-999999999999',
  digest('other-inventory', 'sha256'), clock_timestamp() + interval '1 day'
);

set local session_replication_role = origin;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.tenant_id', 'd1000000-0000-4000-8000-000000000001', true);
set local role career_app;

create temp table inventory_page_1 on commit drop as
select * from app.list_publications(null, null, 51)
order by published_at desc, publication_id desc limit 50;

create temp table inventory_page_2 on commit drop as
select inventory.* from app.list_publications(
  (select published_at::timestamptz from inventory_page_1 order by published_at, publication_id limit 1),
  (select publication_id from inventory_page_1 order by published_at, publication_id limit 1),
  51
) inventory
order by published_at desc, publication_id desc limit 50;

create temp table inventory_page_3 on commit drop as
select inventory.* from app.list_publications(
  (select published_at::timestamptz from inventory_page_2 order by published_at, publication_id limit 1),
  (select publication_id from inventory_page_2 order by published_at, publication_id limit 1),
  51
) inventory;

do $$
declare inventory_count integer; active_count integer; expired_count integer;
  revoked_count integer; leaked_count integer; secret_keys integer;
begin
  select count(*), count(*) filter (where status = 'active'),
    count(*) filter (where status = 'expired'),
    count(*) filter (where status = 'revoked'),
    count(*) filter (where company = 'Other Co'),
    count(*) filter (where to_jsonb(p)::text ~ 'token|payload')
  into inventory_count, active_count, expired_count, revoked_count,
    leaked_count, secret_keys
  from (
    select * from inventory_page_1
    union all select * from inventory_page_2
    union all select * from inventory_page_3
  ) p;
  if inventory_count <> 101 or active_count <> 99
    or expired_count <> 1 or revoked_count <> 1 then
    raise exception 'publication inventory pagination or status failed';
  end if;
  if leaked_count <> 0 or secret_keys <> 0 then
    raise exception 'publication inventory leaked another tenant or capability data';
  end if;
end
$$;

rollback;
select 'publication inventory isolation, status and pagination ok' as result;
