import 'server-only';
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import postgres from 'postgres';
import { z } from 'zod';
import { pageSpecSchema, profileSchema } from '../schemas';
import { buildStrategy, runReviews } from '../workflow';

const opportunitySchema = z.object({
  company: z.string().min(1),
  role: z.string().min(1),
  description: z.string().min(1),
  url: z.string().url().optional(),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

const publicationInputSchema = z.object({
  profile: profileSchema,
  spec: pageSpecSchema,
  opportunity: opportunitySchema,
  approved: z.literal(true),
});
const sessionSchema = z.object({
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
});
export type PublicationSession = z.infer<typeof sessionSchema>;

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required.');
  return postgres(url, { max: 5, idle_timeout: 5 });
}

function sessionSecret() {
  const secret = process.env.CAREER_OS_SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error(
      'CAREER_OS_SESSION_SECRET must contain at least 32 characters.',
    );
  return secret;
}

export function createSession(): PublicationSession {
  return { userId: randomUUID(), tenantId: randomUUID() };
}

export function encodeSession(session: PublicationSession) {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${payload}.${createHmac('sha256', sessionSecret()).update(payload).digest('base64url')}`;
}

export function decodeSession(value?: string) {
  if (!value) return;
  const [payload, supplied] = value.split('.');
  if (!payload || !supplied) return;
  const expected = createHmac('sha256', sessionSecret())
    .update(payload)
    .digest();
  const candidate = Buffer.from(supplied, 'base64url');
  if (
    candidate.length !== expected.length ||
    !timingSafeEqual(candidate, expected)
  )
    return;
  return sessionSchema.parse(
    JSON.parse(Buffer.from(payload, 'base64url').toString()),
  );
}

export async function mintPublication(
  session: PublicationSession,
  rawInput: unknown,
) {
  const { profile, spec, opportunity } = publicationInputSchema.parse(rawInput);
  const strategy = buildStrategy(profile, opportunity);
  const publishedClaimIds = new Set(
    spec.blocks.flatMap((block) => ('claimIds' in block ? block.claimIds : [])),
  );
  if (
    spec.company.name !== opportunity.company ||
    spec.company.role !== opportunity.role ||
    strategy.selectedClaimIds.length !== publishedClaimIds.size ||
    strategy.selectedClaimIds.some((id) => !publishedClaimIds.has(id))
  )
    throw new Error('PageSpec does not match the server strategy.');
  const reviews = runReviews(profile, spec);
  if (reviews.length !== 3 || reviews.some((review) => !review.passed))
    throw new Error('Server review rejected publication.');

  const sql = database();
  let publicationId = '';
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(rawToken).digest();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  try {
    await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub', ${session.userId}, true), set_config('request.jwt.claim.tenant_id', ${session.tenantId}, true)`;
      await tx.unsafe('set local role career_app');
      await tx`insert into app.tenants (id, owner_id, name) values (${session.tenantId}, ${session.userId}, 'Private workspace') on conflict (id) do nothing`;
      const profileId = randomUUID();
      await tx`insert into app.profiles (id, tenant_id, name, headline) values (${profileId}, ${session.tenantId}, ${profile.name}, ${profile.headline})`;

      const sourceIds = new Map<string, string>();
      for (const source of profile.sources) {
        const id = randomUUID();
        sourceIds.set(source.id, id);
        await tx`insert into app.sources (id, tenant_id, kind, title, locator, sensitivity, allowed_uses) values (${id}, ${session.tenantId}, ${source.kind}, ${source.title}, ${source.locator ?? null}, ${source.sensitivity}, ${source.allowedUses})`;
      }
      const evidenceIds = new Map<string, string>();
      for (const evidence of profile.evidence) {
        const id = randomUUID();
        evidenceIds.set(evidence.id, id);
        await tx`insert into app.evidence (id, tenant_id, source_id, label, excerpt) values (${id}, ${session.tenantId}, ${sourceIds.get(evidence.sourceId)!}, ${evidence.label}, ${evidence.excerpt})`;
      }
      const claimIds = new Map<string, string>();
      for (const claim of profile.claims) {
        const id = randomUUID();
        claimIds.set(claim.id, id);
        await tx`insert into app.claims (id, tenant_id, statement, level, sensitivity, allowed_uses) values (${id}, ${session.tenantId}, ${claim.statement}, ${claim.level}, ${claim.sensitivity}, ${claim.allowedUses})`;
        for (const evidenceId of claim.evidenceIds)
          await tx`insert into app.claim_evidence (tenant_id, claim_id, evidence_id) values (${session.tenantId}, ${id}, ${evidenceIds.get(evidenceId)!})`;
      }

      const opportunityId = randomUUID();
      await tx`insert into app.opportunities (id, tenant_id, company, role, raw_text, url, extraction_status) values (${opportunityId}, ${session.tenantId}, ${opportunity.company}, ${opportunity.role}, ${opportunity.description}, ${opportunity.url ?? null}, 'ready')`;
      const runId = randomUUID();
      await tx`insert into app.workflow_runs (id, tenant_id, opportunity_id, profile_id, state, status, token_budget, cost_budget_micros, deadline_at, input_hash) values (${runId}, ${session.tenantId}, ${opportunityId}, ${profileId}, 'approved', 'completed', 10000, 0, now() + interval '1 hour', ${hashJson({ profile, opportunity })})`;

      const pageSpecId = randomUUID();
      const dbSpec = {
        ...spec,
        blocks: spec.blocks.map((block) =>
          'claimIds' in block
            ? {
                ...block,
                claimIds: block.claimIds.map((id) => claimIds.get(id)!),
              }
            : block,
        ),
      };
      await tx.unsafe('set local role career_worker');
      await tx`insert into app.page_specs (id, tenant_id, workflow_run_id, version, spec, input_hash) values (${pageSpecId}, ${session.tenantId}, ${runId}, 1, ${tx.json(dbSpec)}, ${hashJson({ profile, opportunity })})`;
      for (const claimId of new Set(
        spec.blocks.flatMap((block) =>
          'claimIds' in block ? block.claimIds : [],
        ),
      ))
        await tx`insert into app.page_spec_claims (tenant_id, page_spec_id, claim_id) values (${session.tenantId}, ${pageSpecId}, ${claimIds.get(claimId)!})`;
      const [pageSpec] = await tx<
        { spec_hash: string }[]
      >`select spec_hash from app.page_specs where id = ${pageSpecId}`;

      await tx.unsafe('set local role career_reviewer');
      for (const review of reviews)
        await tx`insert into app.reviews (tenant_id, page_spec_id, reviewer, verdict, issues, page_spec_hash) values (${session.tenantId}, ${pageSpecId}, ${review.reviewer === 'hiring-manager' ? 'hiring_manager' : review.reviewer}, 'pass', ${tx.json(review.findings)}, ${pageSpec.spec_hash})`;

      await tx.unsafe('set local role career_app');
      await tx`select app.approve_page_spec(${pageSpecId})`;
      await tx.unsafe('set local role career_publisher');
      const [publication] = await tx<{ id: string }[]>`
        select app.mint_publication(${pageSpecId}, ${tokenHash}, ${expiresAt}) as id
      `;
      publicationId = publication.id;
    });
  } finally {
    await sql.end();
  }
  return { publicationId, rawToken, expiresAt: expiresAt.toISOString() };
}

export async function readPublication(publicationId: string, rawToken: string) {
  const id = z.string().uuid().parse(publicationId);
  const token = z.string().min(32).max(128).parse(rawToken);
  const sql = database();
  try {
    const row = await sql.begin(async (tx) => {
      await tx.unsafe('set local role career_reader');
      const [result] = await tx<{ payload: unknown }[]>`
        select app.read_shared_publication(${id}, ${createHash('sha256').update(token).digest()}) as payload
      `;
      return result;
    });
    return row?.payload
      ? publicationInputSchema
          .pick({ profile: true, spec: true })
          .parse(row.payload)
      : undefined;
  } finally {
    await sql.end();
  }
}

export async function revokePublication(
  session: PublicationSession,
  publicationId: string,
) {
  const id = z.string().uuid().parse(publicationId);
  const sql = database();
  try {
    await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub', ${session.userId}, true), set_config('request.jwt.claim.tenant_id', ${session.tenantId}, true)`;
      await tx.unsafe('set local role career_app');
      await tx`select app.revoke_publication(${id})`;
    });
  } finally {
    await sql.end();
  }
}

function hashJson(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
