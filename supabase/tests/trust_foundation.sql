\set ON_ERROR_STOP on

begin;

insert into app.tenants (id, owner_id, name) values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Trust A'),
  ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'Trust B');

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.tenant_id', 'a2000000-0000-4000-8000-000000000001', true);
set local role career_app;

insert into app.search_profiles (
  tenant_id, name, hard_constraints, soft_preferences
) values (
  'a2000000-0000-4000-8000-000000000001',
  'Senior product roles',
  '{"remote":"required"}',
  '{"stack":["TypeScript"]}'
);

select app.record_human_audit_event(
  'a2000000-0000-4000-8000-000000000001',
  'search_profile.created',
  'search_profile',
  null,
  '{"revision":1}'
);

do $$ begin
  if (select count(*) from app.search_profiles) <> 1
    or (select count(*) from app.audit_events) <> 1 then
    raise exception 'tenant-scoped foundation records are not readable';
  end if;
end $$;

do $$ begin
  begin
    perform app.record_human_audit_event(
      'a2000000-0000-4000-8000-000000000002',
      'forged', 'workspace', null, '{}'
    );
    raise exception 'cross-tenant audit event accepted';
  exception when others then
    if sqlerrm = 'cross-tenant audit event accepted' then raise; end if;
    if sqlerrm <> 'audit event rejected' then raise; end if;
  end;
end $$;

do $$ begin
  begin
    update app.audit_events set event_type = 'rewritten';
    raise exception 'audit event mutation accepted';
  exception when others then
    if sqlerrm = 'audit event mutation accepted' then raise; end if;
    if sqlerrm not in ('audit events are immutable', 'permission denied for table audit_events') then
      raise;
    end if;
  end;
end $$;

rollback;
select 'trust foundation schema and audit immutability ok' as result;
