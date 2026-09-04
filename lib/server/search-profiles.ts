import 'server-only';
import postgres from 'postgres';
import { z } from 'zod';
import {
  deleteSearchProfileInputSchema,
  searchHardConstraintsSchema,
  searchProfileFieldsSchema,
  searchProfileSchema,
  searchSoftPreferencesSchema,
  updateSearchProfileInputSchema,
  type SearchProfile,
} from '../search-profile';
import type { PublicationSession } from './publications';

export class SearchProfileConflictError extends Error {}
export class SearchProfileNotFoundError extends Error {}

type SearchProfileRow = {
  id: string;
  name: string;
  hard_constraints: unknown;
  soft_preferences: unknown;
  active: boolean;
  revision: string;
  created_at: Date;
  updated_at: Date;
};

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required.');
  return postgres(url, { max: 5, idle_timeout: 5 });
}

export async function listSearchProfiles(session: PublicationSession) {
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session);
      const rows = await tx<SearchProfileRow[]>`
        select id, name, hard_constraints, soft_preferences, active, revision,
          created_at, updated_at
        from app.search_profiles
        where tenant_id = ${session.tenantId}
        order by active desc, updated_at desc, id desc
        limit 100`;
      return rows.map(projection);
    });
  } finally {
    await sql.end();
  }
}

export async function createSearchProfile(
  session: PublicationSession,
  rawInput: unknown,
) {
  const input = searchProfileFieldsSchema.parse(rawInput);
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      const [owner] = await tx<{ user_id: string }[]>`
        select "userId" as user_id from auth."member"
        where "organizationId" = ${session.tenantId} and role = 'owner'
        order by "createdAt" limit 1`;
      await authorize(tx, session);
      await tx`insert into app.tenants (id, owner_id, name)
        values (
          ${session.tenantId}, ${owner?.user_id ?? session.userId},
          ${session.tenantName ?? 'Workspace'}
        ) on conflict (id) do update set name = excluded.name`;
      try {
        const [created] = await tx<SearchProfileRow[]>`
          insert into app.search_profiles (
            tenant_id, name, hard_constraints, soft_preferences, active
          ) values (
            ${session.tenantId}, ${input.name}, ${tx.json(input.hardConstraints)},
            ${tx.json(input.softPreferences)}, ${input.active}
          ) returning id, name, hard_constraints, soft_preferences, active,
            revision, created_at, updated_at`;
        return projection(created);
      } catch (error) {
        if (postgresErrorCode(error) === '23505')
          throw new SearchProfileConflictError(
            'A search profile already uses this name.',
          );
        throw error;
      }
    });
  } finally {
    await sql.end();
  }
}

export async function readSearchProfile(
  session: PublicationSession,
  rawSearchProfileId: string,
) {
  const searchProfileId = z.string().uuid().parse(rawSearchProfileId);
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session);
      const [row] = await tx<SearchProfileRow[]>`
        select id, name, hard_constraints, soft_preferences, active, revision,
          created_at, updated_at
        from app.search_profiles
        where tenant_id = ${session.tenantId} and id = ${searchProfileId}`;
      return row ? projection(row) : undefined;
    });
  } finally {
    await sql.end();
  }
}

export async function updateSearchProfile(
  session: PublicationSession,
  rawSearchProfileId: string,
  rawInput: unknown,
) {
  const searchProfileId = z.string().uuid().parse(rawSearchProfileId);
  const input = updateSearchProfileInputSchema.parse(rawInput);
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session);
      const [existing] = await tx<SearchProfileRow[]>`
        select id, name, hard_constraints, soft_preferences, active, revision,
          created_at, updated_at
        from app.search_profiles
        where tenant_id = ${session.tenantId} and id = ${searchProfileId}
        for update`;
      if (!existing) throw new SearchProfileNotFoundError();
      if (Number(existing.revision) !== input.expectedRevision)
        throw new SearchProfileConflictError(
          'Search profile revision is stale.',
        );
      if (sameFields(existing, input)) return projection(existing);
      try {
        const [updated] = await tx<SearchProfileRow[]>`
          update app.search_profiles set
            name = ${input.name},
            hard_constraints = ${tx.json(input.hardConstraints)},
            soft_preferences = ${tx.json(input.softPreferences)},
            active = ${input.active},
            revision = revision + 1
          where tenant_id = ${session.tenantId} and id = ${searchProfileId}
          returning id, name, hard_constraints, soft_preferences, active,
            revision, created_at, updated_at`;
        return projection(updated);
      } catch (error) {
        if (postgresErrorCode(error) === '23505')
          throw new SearchProfileConflictError(
            'A search profile already uses this name.',
          );
        throw error;
      }
    });
  } finally {
    await sql.end();
  }
}

export async function deleteSearchProfile(
  session: PublicationSession,
  rawSearchProfileId: string,
  rawInput: unknown,
) {
  const searchProfileId = z.string().uuid().parse(rawSearchProfileId);
  const input = deleteSearchProfileInputSchema.parse(rawInput);
  const sql = database();
  try {
    await sql.begin(async (tx) => {
      await authorize(tx, session);
      const [existing] = await tx<{ revision: string }[]>`
        select revision from app.search_profiles
        where tenant_id = ${session.tenantId} and id = ${searchProfileId}
        for update`;
      if (!existing) throw new SearchProfileNotFoundError();
      if (Number(existing.revision) !== input.expectedRevision)
        throw new SearchProfileConflictError(
          'Search profile revision is stale.',
        );
      await tx`delete from app.search_profiles
        where tenant_id = ${session.tenantId} and id = ${searchProfileId}`;
    });
  } finally {
    await sql.end();
  }
}

function projection(row: SearchProfileRow): SearchProfile {
  return searchProfileSchema.parse({
    searchProfileId: row.id,
    name: row.name,
    hardConstraints: searchHardConstraintsSchema.parse(row.hard_constraints),
    softPreferences: searchSoftPreferencesSchema.parse(row.soft_preferences),
    active: row.active,
    revision: Number(row.revision),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function sameFields(
  row: SearchProfileRow,
  input: z.infer<typeof searchProfileFieldsSchema>,
) {
  return (
    row.name === input.name &&
    row.active === input.active &&
    JSON.stringify(searchHardConstraintsSchema.parse(row.hard_constraints)) ===
      JSON.stringify(input.hardConstraints) &&
    JSON.stringify(searchSoftPreferencesSchema.parse(row.soft_preferences)) ===
      JSON.stringify(input.softPreferences)
  );
}

async function authorize(
  tx: postgres.TransactionSql,
  session: PublicationSession,
) {
  await tx`select set_config('request.jwt.claim.sub', ${session.userId}, true),
    set_config('request.jwt.claim.tenant_id', ${session.tenantId}, true)`;
  await tx.unsafe('set local role career_app');
}

function postgresErrorCode(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error))
    return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}
