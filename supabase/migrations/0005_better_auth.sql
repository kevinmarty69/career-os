create schema auth;
set search_path = auth, public;

create table auth."user" (
  id uuid default pg_catalog.gen_random_uuid() primary key,
  name text not null,
  email text not null unique,
  "emailVerified" boolean not null,
  image text,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz default current_timestamp not null
);

create table auth."session" (
  id uuid default pg_catalog.gen_random_uuid() primary key,
  "expiresAt" timestamptz not null,
  token text not null unique,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" uuid not null references auth."user" (id) on delete cascade,
  "activeOrganizationId" text
);

create table auth.account (
  id uuid default pg_catalog.gen_random_uuid() primary key,
  issuer text not null,
  "accountId" text not null,
  "providerId" text not null,
  "userId" uuid not null references auth."user" (id) on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz not null
);

create table auth.verification (
  id uuid default pg_catalog.gen_random_uuid() primary key,
  identifier text not null,
  value text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz default current_timestamp not null
);

create table auth.organization (
  id uuid default pg_catalog.gen_random_uuid() primary key,
  name text not null,
  slug text not null unique,
  logo text,
  "createdAt" timestamptz not null,
  metadata text
);

create table auth."member" (
  id uuid default pg_catalog.gen_random_uuid() primary key,
  "organizationId" uuid not null references auth.organization (id) on delete cascade,
  "userId" uuid not null references auth."user" (id) on delete cascade,
  role text not null,
  "createdAt" timestamptz not null
);

create table auth.invitation (
  id uuid default pg_catalog.gen_random_uuid() primary key,
  "organizationId" uuid not null references auth.organization (id) on delete cascade,
  email text not null,
  role text,
  status text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz default current_timestamp not null,
  "inviterId" uuid not null references auth."user" (id) on delete cascade
);

create index "session_userId_idx" on auth."session" ("userId");
create unique index "account_issuer_accountId_uidx" on auth.account (issuer, "accountId");
create index "account_userId_idx" on auth.account ("userId");
create index "verification_identifier_idx" on auth.verification (identifier);
create index "member_organizationId_idx" on auth."member" ("organizationId");
create index "member_userId_idx" on auth."member" ("userId");
create unique index "member_organizationId_userId_uidx"
  on auth."member" ("organizationId", "userId");
create index "invitation_organizationId_idx" on auth.invitation ("organizationId");
create index "invitation_email_idx" on auth.invitation (email);

revoke all on schema auth from public;
revoke all on all tables in schema auth from public;
revoke all on schema auth from career_app, career_worker, career_reviewer, career_publisher, career_reader;
revoke all on all tables in schema auth from career_app, career_worker, career_reviewer, career_publisher, career_reader;

alter table app.tenants drop constraint tenants_owner_id_key;

create or replace function app.owns_tenant(candidate uuid) returns boolean
language sql stable security definer set search_path = app, auth, pg_temp as $$
  select exists(
    select 1 from auth."member" m
    where m."organizationId" = candidate and m."userId" = app.current_user_id()
  ) or exists(
    select 1 from app.tenants t
    where t.id = candidate and t.owner_id = app.current_user_id()
      and not exists(select 1 from auth.organization o where o.id = candidate)
  )
$$;

create function app.can_create_tenant(candidate uuid, candidate_owner uuid) returns boolean
language sql stable security definer set search_path = app, auth, pg_temp as $$
  select candidate_owner = app.current_user_id() and (
    exists(
      select 1 from auth."member" m
      where m."organizationId" = candidate and m."userId" = app.current_user_id()
    ) or not exists(select 1 from auth.organization o where o.id = candidate)
  )
$$;

drop policy tenant_owner on app.tenants;
create policy tenant_access on app.tenants
  using (app.owns_tenant(id))
  with check (app.owns_tenant(id) or app.can_create_tenant(id, owner_id));
grant execute on function app.can_create_tenant(uuid, uuid) to career_app;
revoke execute on function app.can_create_tenant(uuid, uuid) from public;

set search_path = public;
