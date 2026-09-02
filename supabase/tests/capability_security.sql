\set ON_ERROR_STOP on

begin;
set local role career_publisher;
do $$ begin
  begin
    insert into app.publications (tenant_id, page_spec_id, page_spec_hash)
    values (gen_random_uuid(), gen_random_uuid(), 'forged');
    raise exception 'publisher bypassed the mint function';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    insert into app.share_links (tenant_id, publication_id, token_hash, expires_at)
    values (gen_random_uuid(), gen_random_uuid(), digest('forged', 'sha256'), now() + interval '1 day');
    raise exception 'publisher wrote a raw share link';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
select 'capability writer separation ok' as result;
