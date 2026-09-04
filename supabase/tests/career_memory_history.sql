\set ON_ERROR_STOP on

begin;

insert into app.tenants (id, owner_id, name) values (
  'ee000000-0000-4000-8000-000000000001',
  'ee000000-0000-4000-8000-000000000002',
  'Career Memory test'
);
insert into app.profiles (
  id, tenant_id, name, headline, profile_kind, revision
) values (
  'ee000000-0000-4000-8000-000000000003',
  'ee000000-0000-4000-8000-000000000001',
  'Test User', 'Engineer', 'living', 1
);
insert into app.claims (
  id, tenant_id, profile_id, position, statement, kind, level,
  sensitivity, allowed_uses
) values (
  'ee000000-0000-4000-8000-000000000004',
  'ee000000-0000-4000-8000-000000000001',
  'ee000000-0000-4000-8000-000000000003', 0,
  'Aucune preuve ne soutient encore cette affirmation.',
  'result', 'unsupported', 'private', '{application}'
);
insert into app.profile_revisions (
  tenant_id, profile_id, revision, snapshot
) values (
  'ee000000-0000-4000-8000-000000000001',
  'ee000000-0000-4000-8000-000000000003', 1,
  '{"name":"Test User","claims":[]}'
);

do $$ begin
  begin
    update app.profile_revisions set snapshot = '{}' where tenant_id =
      'ee000000-0000-4000-8000-000000000001';
    raise exception 'revision history was mutable';
  exception when others then
    if sqlerrm = 'revision history was mutable' then raise; end if;
    if sqlerrm <> 'Career Memory revision history is immutable' then raise; end if;
  end;
end $$;

select 1 / ((select count(*) from app.profile_revisions where tenant_id =
  'ee000000-0000-4000-8000-000000000001') = 1)::integer;

rollback;
select 'Career Memory keeps unsupported claims and immutable revisions' as result;
