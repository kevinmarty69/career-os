-- Keep previous correction inputs reproducible; explicit human selections are additive.
alter function app.valid_page_composer_correction_input(jsonb)
  rename to valid_page_composer_correction_input_legacy;

create function app.valid_page_composer_correction_input(candidate jsonb)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select app.valid_page_composer_correction_input_legacy(
    candidate #- '{correction,replacementClaimId}'
  ) and (
    not (candidate -> 'correction' ? 'replacementClaimId') or (
      candidate #>> '{correction,issue,section}' = 'hero'
      and exists (
        select 1 from jsonb_array_elements(candidate -> 'supports') proof
        where proof -> 'claimId' = candidate #> '{correction,replacementClaimId}'
          and proof ->> 'claimId' <> candidate #>> '{correction,issue,claimId}'
          and candidate #> '{correction,pageSpec,blocks,0,claimIds}' ? (proof ->> 'claimId')
      )
    )
  )
$$;

alter function app.materialize_page_composer_correction(jsonb)
  rename to materialize_page_composer_correction_legacy;

create function app.materialize_page_composer_correction(candidate jsonb)
returns jsonb language plpgsql immutable set search_path = pg_catalog as $$
declare replacement text;
begin
  if not app.valid_page_composer_correction_input(candidate) then return null; end if;
  if not (candidate -> 'correction' ? 'replacementClaimId') then
    return app.materialize_page_composer_correction_legacy(candidate);
  end if;
  select proof ->> 'statement' into replacement
    from jsonb_array_elements(candidate -> 'supports') proof
    where proof -> 'claimId' = candidate #> '{correction,replacementClaimId}' limit 1;
  if replacement is not distinct from candidate #>> '{correction,pageSpec,hero,thesis}' then return null; end if;
  return jsonb_set(candidate #> '{correction,pageSpec}', '{hero,thesis}', to_jsonb(replacement));
end $$;

create function app.start_page_spec_correction(
  run_tenant uuid, run_id uuid, target_page_spec uuid, target_review uuid,
  target_issue_index integer, decision_id uuid, decision_key uuid,
  decision_input_hash text, replacement_claim uuid
) returns uuid language plpgsql security definer set search_path = app, pg_temp as $$
declare child_id uuid; selected_input jsonb; selected_hash text;
begin
  child_id := app.start_page_spec_correction(
    run_tenant, run_id, target_page_spec, target_review, target_issue_index,
    decision_id, decision_key, decision_input_hash
  );
  if replacement_claim is null then return child_id; end if;
  select jsonb_set(input, '{correction,replacementClaimId}', to_jsonb(replacement_claim::text))
    into selected_input from app.workflow_steps
    where tenant_id = run_tenant and workflow_run_id = child_id and stage = 'page-composer';
  if not app.valid_page_composer_correction_input(selected_input)
    or app.materialize_page_composer_correction(selected_input) is null then
    raise exception 'page correction replacement rejected';
  end if;
  selected_hash := encode(extensions.digest(selected_input::text, 'sha256'), 'hex');
  -- Same transaction as creation: no worker can observe the unselected input.
  update app.workflow_steps set input = selected_input, input_hash = selected_hash
    where tenant_id = run_tenant and workflow_run_id = child_id and stage = 'page-composer';
  update app.workflow_runs set input_hash = selected_hash
    where tenant_id = run_tenant and id = child_id;
  return child_id;
end $$;

revoke all on function app.valid_page_composer_correction_input(jsonb),
  app.materialize_page_composer_correction(jsonb),
  app.start_page_spec_correction(uuid, uuid, uuid, uuid, integer, uuid, uuid, text, uuid)
from public;
grant execute on function app.start_page_spec_correction(uuid, uuid, uuid, uuid, integer, uuid, uuid, text, uuid)
to career_app;
