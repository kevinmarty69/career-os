-- Reserve before dispatch. An uncertain call is not retried automatically.
-- No prompt, response transcript or source text is stored here.
create table app.interview_question_attempts (
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  session_id uuid not null,
  status text not null default 'pending' check (status in ('pending','completed','unknown')),
  question_id text check (question_id in ('change','context','before','after','source','ownership','scope','constraints','measurement','learning')),
  reserved_cost_micros bigint not null check (reserved_cost_micros >= 0),
  cost_micros bigint check (cost_micros >= 0 and cost_micros <= reserved_cost_micros),
  created_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, input_hash),
  check ((status = 'completed') = (question_id is not null and cost_micros is not null))
);
create index interview_question_daily on app.interview_question_attempts (tenant_id,created_at);
alter table app.interview_question_attempts enable row level security;
alter table app.interview_question_attempts force row level security;
create policy interview_question_tenant on app.interview_question_attempts
  using (app.active_tenant(tenant_id)) with check (app.active_tenant(tenant_id));
grant select,insert,update on app.interview_question_attempts to career_app;
