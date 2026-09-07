// Historical migrations remain immutable for existing checksum ledgers.
// Their former app-owned `auth` namespace must never touch Supabase's Auth schema.
export function migrationSql(name: string, sql: string) {
  if (Number(name.slice(0, 4)) > 49) return sql;
  return sql
    .replace(/\bauth\b/g, 'career_identity')
    .replace(
      'create extension if not exists pgcrypto;',
      'create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions;',
    )
    .replace(/\b(?:public\.)?digest\(/g, 'extensions.digest(')
    .replace(
      /alter role (career_[a-z_]+) (?:nologin|with) nosuperuser nocreatedb\s+nocreaterole\s+noinherit noreplication nobypassrls;/g,
      (_, role: string) => `do $$ begin
      if exists(select 1 from pg_roles where rolname = '${role}'
        and (rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls)) then
        raise exception 'Unsafe existing role: ${role}';
      end if;
    end $$;
    alter role ${role} nologin noinherit;`,
    );
}
