-- Older self-hosted installs may have applied migration 0045 before its final
-- permission block was published. Reassert the intended least-privilege ACL.
revoke execute on function app.claim_scheduled_job_discovery(integer),
  app.complete_scheduled_job_discovery(uuid, uuid, text, jsonb, integer),
  app.active_job_discovery_lease(uuid) from public;

grant execute on function app.claim_scheduled_job_discovery(integer),
  app.complete_scheduled_job_discovery(uuid, uuid, text, jsonb, integer),
  app.active_job_discovery_lease(uuid) to career_job_discovery;
