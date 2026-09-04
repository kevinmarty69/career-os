alter table app.applications
  add column logo_url text,
  add constraint applications_logo_url
    check (logo_url is null or (
      length(logo_url) <= 2048 and logo_url ~ '^https?://'
    ));

alter table app.opportunities
  add column logo_url text,
  add constraint opportunities_logo_url
    check (logo_url is null or (
      length(logo_url) <= 2048 and logo_url ~ '^https?://'
    ));

create or replace function app.build_publication_payload(target_page_spec uuid)
returns jsonb language sql stable security definer set search_path = app, pg_temp as $$
  select jsonb_build_object(
    'spec', ps.spec,
    'brand', jsonb_strip_nulls(jsonb_build_object(
      'logoUrl', opportunity.logo_url
    )),
    'profile', jsonb_build_object(
      'name', pr.name,
      'headline', pr.headline,
      'publicLinks', pr.public_links,
      'sources', coalesce((
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'id', source.id::text, 'kind', source.kind, 'title', source.title,
          'locator', source.locator, 'sensitivity', source.sensitivity::text,
          'allowedUses', to_jsonb(source.allowed_uses), 'trust', source.trust
        )) order by source.position, source.id)
        from sources source where source.profile_id = pr.id
          and source.sensitivity <> 'restricted'
          and 'application' = any(source.allowed_uses)
          and exists (
            select 1 from page_spec_evidence selected
            join evidence proof on proof.tenant_id = selected.tenant_id
              and proof.id = selected.evidence_id
            where selected.tenant_id = ps.tenant_id
              and selected.page_spec_id = ps.id and proof.source_id = source.id
          )
      ), '[]'::jsonb),
      'evidence', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', proof.id::text, 'sourceId', proof.source_id::text,
          'label', proof.label, 'excerpt', proof.excerpt
        ) order by selected.position, proof.id)
        from (
          select evidence_id, min(position) position
          from page_spec_evidence
          where tenant_id = ps.tenant_id and page_spec_id = ps.id
          group by evidence_id
        ) selected
        join evidence proof on proof.tenant_id = ps.tenant_id
          and proof.id = selected.evidence_id and proof.profile_id = pr.id
        join sources source on source.tenant_id = ps.tenant_id
          and source.id = proof.source_id and source.profile_id = pr.id
        where source.sensitivity <> 'restricted'
          and 'application' = any(source.allowed_uses)
      ), '[]'::jsonb),
      'claims', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', claim.id::text, 'statement', claim.statement,
          'kind', claim.kind, 'level', claim.level::text,
          'evidenceIds', coalesce((
            select jsonb_agg(selected.evidence_id::text order by selected.position)
            from page_spec_evidence selected
            where selected.tenant_id = claim.tenant_id
              and selected.page_spec_id = ps.id and selected.claim_id = claim.id
          ), '[]'::jsonb),
          'sensitivity', claim.sensitivity::text,
          'allowedUses', to_jsonb(claim.allowed_uses)
        ) order by claim.position, claim.id)
        from claims claim join page_spec_claims selected_claim
          on selected_claim.tenant_id = claim.tenant_id
          and selected_claim.claim_id = claim.id
        where selected_claim.page_spec_id = ps.id and claim.profile_id = pr.id
          and claim.sensitivity <> 'restricted'
          and 'application' = any(claim.allowed_uses)
      ), '[]'::jsonb)
    )
  ) from page_specs ps
  join workflow_runs run on run.tenant_id = ps.tenant_id
    and run.id = ps.workflow_run_id
  join profiles pr on pr.tenant_id = run.tenant_id and pr.id = run.profile_id
  join opportunities opportunity on opportunity.tenant_id = run.tenant_id
    and opportunity.id = run.opportunity_id
  where ps.id = target_page_spec and ps.invalidated_at is null
$$;
