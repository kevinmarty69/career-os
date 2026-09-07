-- Permissions only. Login passwords are provisioned separately and never committed.
do $$ begin
  create role career_web nologin noinherit;
exception when duplicate_object then null;
end $$;
grant career_app, career_publisher, career_reader, career_job_discovery to career_web;
grant usage on schema career_identity to career_web;
grant select, insert, update on career_identity."user", career_identity.organization,
  career_identity.member to career_web;
grant execute on function career_identity.active_session(uuid, uuid),
  career_identity.user_sessions(uuid) to career_web;

grant usage on schema extensions to career_app, career_web, career_worker, career_reviewer,
  career_publisher, career_reader, career_company_researcher, career_evidence_archivist,
  career_recruiter_strategist, career_page_composer, career_recruiter_reviewer,
  career_hiring_manager_reviewer, career_factuality_reviewer, career_job_discovery;
grant execute on function extensions.digest(text, text), extensions.digest(bytea, text)
  to career_app, career_web, career_worker, career_reviewer, career_publisher, career_reader,
  career_company_researcher, career_evidence_archivist, career_recruiter_strategist,
  career_page_composer, career_recruiter_reviewer, career_hiring_manager_reviewer,
  career_factuality_reviewer, career_job_discovery;
