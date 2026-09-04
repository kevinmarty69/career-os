create or replace function app.valid_page_composer_publication_lineage(
  target_tenant uuid, target_page_spec uuid
) returns boolean language sql stable security definer set search_path = app, pg_temp as $$
  select exists (
    select 1 from page_specs page
    join workflow_steps composer on composer.tenant_id = page.tenant_id
      and composer.workflow_run_id = page.workflow_run_id
      and composer.stage = 'page-composer' and composer.status = 'completed'
      and composer.page_spec_id = page.id
    join artifacts output_artifact on output_artifact.tenant_id = composer.tenant_id
      and output_artifact.workflow_run_id = composer.workflow_run_id
      and output_artifact.id = composer.output_artifact_id
      and output_artifact.kind = 'page_spec' and output_artifact.version = 1
      and output_artifact.body = page.spec and output_artifact.id = page.source_artifact_id
    where page.tenant_id = target_tenant and page.id = target_page_spec
      and composer.input_hash = encode(
        public.digest(composer.input::text, 'sha256'), 'hex'
      ) and case composer.input -> 'schemaVersion'
        when '1'::jsonb then exists (
          select 1 from artifacts strategy
          join strategy_approvals approval on approval.tenant_id = strategy.tenant_id
            and approval.workflow_run_id = strategy.workflow_run_id
            and approval.strategy_artifact_id = strategy.id
          where strategy.tenant_id = page.tenant_id
            and strategy.workflow_run_id = page.workflow_run_id
            and strategy.id = (composer.input ->> 'strategyArtifactId')::uuid
            and strategy.kind = 'strategy' and strategy.version = 1
            and approval.id = (composer.input ->> 'strategyApprovalId')::uuid
            and composer.input ->> 'strategyArtifactId' = strategy.id::text
            and encode(public.digest(strategy.body::text, 'sha256'), 'hex') =
              composer.input ->> 'strategyArtifactHash'
            and approval.strategy_artifact_hash =
              composer.input ->> 'strategyArtifactHash'
        )
        when '2'::jsonb then
          app.valid_page_composer_correction_input(composer.input)
          and page.spec = app.materialize_page_composer_correction(composer.input)
          and exists (
            select 1 from review_issue_decisions decision
            join page_specs source_page on source_page.tenant_id = decision.tenant_id
              and source_page.id = decision.page_spec_id
              and source_page.id::text = composer.input #>> '{correction,pageSpecId}'
              and source_page.spec_hash = composer.input #>> '{correction,pageSpecHash}'
              and source_page.spec = composer.input #> '{correction,pageSpec}'
              and source_page.invalidated_at is not null
            join artifacts source_artifact on source_artifact.tenant_id = source_page.tenant_id
              and source_artifact.workflow_run_id = source_page.workflow_run_id
              and source_artifact.id = source_page.source_artifact_id
              and source_artifact.id::text = composer.input #>> '{correction,pageSpecArtifactId}'
              and source_artifact.kind = 'page_spec' and source_artifact.version = 1
              and source_artifact.body = source_page.spec
              and encode(public.digest(source_artifact.body::text, 'sha256'), 'hex') =
                composer.input #>> '{correction,pageSpecArtifactHash}'
            join workflow_steps source on source.tenant_id = source_page.tenant_id
              and source.workflow_run_id = source_page.workflow_run_id
              and source.stage = 'page-composer' and source.status = 'completed'
              and source.page_spec_id = source_page.id
              and source.output_artifact_id = source_artifact.id
            join reviews source_review on source_review.tenant_id = decision.tenant_id
              and source_review.id = decision.review_id
              and source_review.id::text = composer.input #>> '{correction,reviewId}'
              and source_review.page_spec_id = source_page.id
              and source_review.page_spec_hash = source_page.spec_hash
            join workflow_runs child on child.tenant_id = decision.tenant_id
              and child.id = decision.corrected_run_id
              and child.id = composer.workflow_run_id
              and child.parent_run_id = decision.workflow_run_id
            where decision.tenant_id = page.tenant_id
              and decision.id::text = composer.input #>> '{correction,decisionId}'
              and decision.decision = 'correct'
              and decision.issue_index =
                (composer.input #>> '{correction,issueIndex}')::integer
              and decision.issue_text = composer.input #>> '{correction,issue,message}'
              and source_review.issues -> decision.issue_index =
                composer.input #> '{correction,issue}'
              and jsonb_set(source.input - 'correction', '{schemaVersion}', '1'::jsonb) =
                jsonb_set(composer.input - 'correction', '{schemaVersion}', '1'::jsonb)
              and source.input_hash = encode(
                public.digest(source.input::text, 'sha256'), 'hex'
              )
              and case source.input -> 'schemaVersion'
                when '1'::jsonb then app.valid_page_composer_input(source.input)
                  and source_page.spec = app.materialize_page_composer_spec(source.input)
                when '2'::jsonb then app.valid_page_composer_correction_input(source.input)
                  and source_page.spec = app.materialize_page_composer_correction(source.input)
                else false
              end
          )
        else false
      end
  )
$$;

revoke execute on function app.valid_page_composer_publication_lineage(uuid, uuid)
from public, career_app, career_reader, career_publisher, career_company_researcher,
  career_evidence_archivist, career_recruiter_strategist, career_page_composer,
  career_recruiter_reviewer, career_hiring_manager_reviewer,
  career_factuality_reviewer;
