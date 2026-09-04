import 'server-only';
import postgres from 'postgres';
import {
  livingProfileInputSchema,
  profileSchema,
  type Profile,
} from '../schemas';

type ProfileSession = {
  userId: string;
  tenantId: string;
  tenantName: string;
};

export class ProfileConflictError extends Error {}

export type ProfileRevisionSummary = {
  revision: number;
  createdAt: string;
  sourceCount: number;
  claimCount: number;
};

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required.');
  return postgres(url, { max: 5, idle_timeout: 5 });
}

export async function readLivingProfile(session: ProfileSession) {
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session);
      const [profile] = await tx<
        {
          id: string;
          name: string;
          headline: string;
          public_links: unknown;
          revision: string;
        }[]
      >`select id, name, headline, public_links, revision from app.profiles
        where tenant_id = ${session.tenantId} and profile_kind = 'living'`;
      if (!profile) return null;

      const sources = await tx<
        Array<{
          id: string;
          kind: Profile['sources'][number]['kind'];
          title: string;
          locator: string | null;
          sensitivity: Profile['sources'][number]['sensitivity'];
          allowed_uses: Profile['sources'][number]['allowedUses'];
        }>
      >`select id, kind, title, locator, sensitivity, allowed_uses
        from app.sources where tenant_id = ${session.tenantId}
          and profile_id = ${profile.id} order by position, id`;
      const evidence = await tx<
        Array<{
          id: string;
          source_id: string;
          label: string;
          excerpt: string;
        }>
      >`select e.id, e.source_id, e.label, e.excerpt
        from app.evidence e join app.sources s
          on s.tenant_id = e.tenant_id and s.id = e.source_id
        where e.tenant_id = ${session.tenantId} and s.profile_id = ${profile.id}
        order by s.position, e.position, e.id`;
      const claims = await tx<
        Array<{
          id: string;
          statement: string;
          kind: Profile['claims'][number]['kind'];
          level: Profile['claims'][number]['level'];
          sensitivity: Profile['claims'][number]['sensitivity'];
          allowed_uses: Profile['claims'][number]['allowedUses'];
        }>
      >`select id, statement, kind, level, sensitivity, allowed_uses
        from app.claims where tenant_id = ${session.tenantId}
          and profile_id = ${profile.id} order by position, id`;
      const links = await tx<
        Array<{ claim_id: string; evidence_id: string }>
      >`select ce.claim_id, ce.evidence_id from app.claim_evidence ce
        join app.claims c on c.tenant_id = ce.tenant_id and c.id = ce.claim_id
        where ce.tenant_id = ${session.tenantId} and c.profile_id = ${profile.id}
        order by ce.claim_id, ce.position, ce.evidence_id`;

      return {
        profile: profileSchema.parse({
          name: profile.name,
          headline: profile.headline,
          publicLinks: profile.public_links,
          sources: sources.map((source) => ({
            id: source.id,
            kind: source.kind,
            title: source.title,
            ...(source.locator ? { locator: source.locator } : {}),
            sensitivity: source.sensitivity,
            allowedUses: source.allowed_uses,
            trust: 'untrusted-data' as const,
          })),
          evidence: evidence.map((item) => ({
            id: item.id,
            sourceId: item.source_id,
            label: item.label,
            excerpt: item.excerpt,
          })),
          claims: claims.map((claim) => ({
            id: claim.id,
            statement: claim.statement,
            kind: claim.kind,
            level: claim.level,
            evidenceIds: links
              .filter((link) => link.claim_id === claim.id)
              .map((link) => link.evidence_id),
            sensitivity: claim.sensitivity,
            allowedUses: claim.allowed_uses,
          })),
        }),
        revision: Number(profile.revision),
      };
    });
  } finally {
    await sql.end();
  }
}

export async function readLivingProfileHistory(session: ProfileSession) {
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session);
      const revisions = await tx<
        Array<{ revision: string; snapshot: unknown; created_at: Date }>
      >`select history.revision, history.snapshot, history.created_at
        from app.profile_revisions history
        join app.profiles profile
          on profile.tenant_id = history.tenant_id
          and profile.id = history.profile_id
        where history.tenant_id = ${session.tenantId}
          and profile.profile_kind = 'living'
        order by history.revision desc limit 50`;
      return revisions.map((item): ProfileRevisionSummary => {
        const profile = profileSchema.parse(item.snapshot);
        return {
          revision: Number(item.revision),
          createdAt: item.created_at.toISOString(),
          sourceCount: profile.sources.length,
          claimCount: profile.claims.length,
        };
      });
    });
  } finally {
    await sql.end();
  }
}

export async function saveLivingProfile(
  session: ProfileSession,
  input: unknown,
  expectedRevision: number,
) {
  const profile = livingProfileInputSchema.parse(input);
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      const [owner] = await tx<{ user_id: string }[]>`
        select "userId" as user_id from auth."member"
        where "organizationId" = ${session.tenantId} and role = 'owner'
        order by "createdAt" limit 1`;
      await authorize(tx, session);
      await tx`insert into app.tenants (id, owner_id, name)
        values (${session.tenantId}, ${owner?.user_id ?? session.userId}, ${session.tenantName})
        on conflict (id) do update set name = excluded.name`;
      await tx`select id from app.tenants where id = ${session.tenantId} for update`;
      const [existing] = await tx<{ id: string; revision: string }[]>`
        select id, revision from app.profiles
        where tenant_id = ${session.tenantId} and profile_kind = 'living'
        for update`;
      if (BigInt(existing?.revision ?? 0) !== BigInt(expectedRevision))
        throw new ProfileConflictError();
      const [storedProfile] = existing
        ? await tx<{ id: string; revision: string }[]>`
            update app.profiles set name = ${profile.name},
              headline = ${profile.headline},
              public_links = ${tx.json(profile.publicLinks ?? {})},
              revision = revision + 1,
              updated_at = now()
            where tenant_id = ${session.tenantId} and id = ${existing.id}
            returning id, revision`
        : await tx<{ id: string; revision: string }[]>`
            insert into app.profiles (
              tenant_id, name, headline, public_links, profile_kind, revision
            ) values (
              ${session.tenantId}, ${profile.name}, ${profile.headline},
              ${tx.json(profile.publicLinks ?? {})}, 'living', 1
            ) returning id, revision`;

      await tx`delete from app.claims where tenant_id = ${session.tenantId}
        and profile_id = ${storedProfile.id}`;
      await tx`delete from app.sources where tenant_id = ${session.tenantId}
        and profile_id = ${storedProfile.id}`;

      const sourceIds = new Map<string, string>();
      const storedSources: Profile['sources'] = [];
      for (const [position, source] of profile.sources.entries()) {
        const [stored] = await tx<{ id: string }[]>`
          insert into app.sources (
            tenant_id, profile_id, position, kind, title, locator,
            sensitivity, allowed_uses
          ) values (
            ${session.tenantId}, ${storedProfile.id}, ${position}, ${source.kind},
            ${source.title}, ${source.locator ?? null}, ${source.sensitivity},
            ${source.allowedUses}
          ) returning id`;
        sourceIds.set(source.id, stored.id);
        storedSources.push({ ...source, id: stored.id });
      }

      const evidenceIds = new Map<string, string>();
      const storedEvidence: Profile['evidence'] = [];
      for (const [position, evidence] of profile.evidence.entries()) {
        const [stored] = await tx<{ id: string }[]>`
          insert into app.evidence (
            tenant_id, profile_id, source_id, position, label, excerpt
          ) values (
            ${session.tenantId}, ${storedProfile.id},
            ${sourceIds.get(evidence.sourceId)!}, ${position}, ${evidence.label},
            ${evidence.excerpt}
          ) returning id`;
        evidenceIds.set(evidence.id, stored.id);
        storedEvidence.push({
          ...evidence,
          id: stored.id,
          sourceId: sourceIds.get(evidence.sourceId)!,
        });
      }

      const storedClaims: Profile['claims'] = [];
      for (const [position, claim] of profile.claims.entries()) {
        const [stored] = await tx<{ id: string }[]>`
          insert into app.claims (
            tenant_id, profile_id, position, statement, kind, level,
            sensitivity, allowed_uses
          ) values (
            ${session.tenantId}, ${storedProfile.id}, ${position},
            ${claim.statement}, ${claim.kind}, ${claim.level}, ${claim.sensitivity},
            ${claim.allowedUses}
          ) returning id`;
        const mappedEvidenceIds = claim.evidenceIds.map((evidenceId) =>
          evidenceIds.get(evidenceId)!,
        );
        for (const [
          evidencePosition,
          evidenceId,
        ] of mappedEvidenceIds.entries())
          await tx`insert into app.claim_evidence (
            tenant_id, profile_id, claim_id, evidence_id, position
          ) values (
            ${session.tenantId}, ${storedProfile.id}, ${stored.id},
            ${evidenceId}, ${evidencePosition}
          )`;
        storedClaims.push({
          ...claim,
          id: stored.id,
          evidenceIds: mappedEvidenceIds,
        });
      }

      const stored = profileSchema.parse({
        name: profile.name,
        headline: profile.headline,
        publicLinks: profile.publicLinks,
        sources: storedSources,
        evidence: storedEvidence,
        claims: storedClaims,
      });

      await tx`insert into app.profile_revisions (
        tenant_id, profile_id, revision, snapshot
      ) values (
        ${session.tenantId}, ${storedProfile.id}, ${storedProfile.revision},
        ${tx.json(stored)}
      )`;

      await tx`select app.record_human_audit_event(
        ${session.tenantId},
        ${existing ? 'career_memory.updated' : 'career_memory.created'},
        'profile',
        ${storedProfile.id},
        ${tx.json({
          revision: Number(storedProfile.revision),
          sourceCount: storedSources.length,
          evidenceCount: storedEvidence.length,
          claimCount: storedClaims.length,
        })}
      )`;

      return {
        profile: stored,
        revision: Number(storedProfile.revision),
      };
    });
  } finally {
    await sql.end();
  }
}

async function authorize(tx: postgres.TransactionSql, session: ProfileSession) {
  await tx`select set_config('request.jwt.claim.sub', ${session.userId}, true),
    set_config('request.jwt.claim.tenant_id', ${session.tenantId}, true)`;
  await tx.unsafe('set local role career_app');
}
