create or replace function app.mint_publication(
  target_page_spec uuid, candidate_hash bytea, expiry timestamptz
) returns uuid language plpgsql security definer set search_path = app, pg_temp as $$
declare target_publication_id uuid; target_tenant uuid; target_hash text;
  target_payload jsonb; active_hash bytea;
begin
  if octet_length(candidate_hash) <> 32 or expiry <= now()
    or expiry > now() + interval '30 days' then
    raise exception 'invalid capability parameters';
  end if;
  select tenant_id, spec_hash into target_tenant, target_hash from page_specs
  where id = target_page_spec and invalidated_at is null
  for update;
  if target_tenant is null or target_tenant is distinct from current_tenant_id() then
    raise exception 'publisher tenant mismatch';
  end if;

  select id into target_publication_id from publications
  where tenant_id = target_tenant and page_spec_id = target_page_spec
    and revoked_at is null
  for update;
  if target_publication_id is null then
    if exists(
      select 1 from publications
      where tenant_id = target_tenant and page_spec_id = target_page_spec
    ) then
      raise exception 'revoked publication cannot be republished';
    end if;
    select app.build_publication_payload(target_page_spec) into target_payload;
    if target_payload is null then
      raise exception 'publication payload unavailable';
    end if;
    target_publication_id := gen_random_uuid();
    insert into publications (
      id, tenant_id, page_spec_id, page_spec_hash, publication_payload
    ) values (
      target_publication_id, target_tenant, target_page_spec, target_hash,
      target_payload
    );
  end if;

  select token_hash into active_hash from share_links
  where tenant_id = target_tenant
    and publication_id = target_publication_id
    and revoked_at is null
  for update;
  if active_hash is not null then
    if active_hash = candidate_hash then return target_publication_id; end if;
    raise exception 'publication already has an active capability';
  end if;

  insert into share_links (tenant_id, publication_id, token_hash, expires_at)
  values (target_tenant, target_publication_id, candidate_hash, expiry);
  return target_publication_id;
end $$;

revoke execute on function app.mint_publication(uuid, bytea, timestamptz) from public;
grant execute on function app.mint_publication(uuid, bytea, timestamptz) to career_publisher;
