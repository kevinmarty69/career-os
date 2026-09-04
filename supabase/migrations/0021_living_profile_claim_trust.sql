update app.claims claim
set level = 'declared'
from app.profiles profile
where profile.tenant_id = claim.tenant_id
  and profile.id = claim.profile_id
  and profile.profile_kind = 'living'
  and claim.level = 'verified';

create function app.reject_untrusted_living_claim() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if new.level = 'verified' and exists (
    select 1 from profiles profile
    where profile.tenant_id = new.tenant_id
      and profile.id = new.profile_id
      and profile.profile_kind = 'living'
  ) then
    raise exception 'living Career Memory claims cannot self-assert verified provenance';
  end if;
  return new;
end $$;

create trigger reject_untrusted_living_claim
before insert or update of tenant_id, profile_id, level on app.claims
for each row execute function app.reject_untrusted_living_claim();

create function app.reject_untrusted_living_profile() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if new.profile_kind = 'living' and exists (
    select 1 from claims claim
    where claim.tenant_id = new.tenant_id
      and claim.profile_id = new.id
      and claim.level = 'verified'
  ) then
    raise exception 'a profile with verified claims cannot become living Career Memory';
  end if;
  return new;
end $$;

create trigger reject_untrusted_living_profile
before insert or update of tenant_id, id, profile_kind on app.profiles
for each row execute function app.reject_untrusted_living_profile();

revoke execute on function app.reject_untrusted_living_claim(),
  app.reject_untrusted_living_profile()
from public;
