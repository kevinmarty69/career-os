import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { z } from 'zod';
import {
  publicationInputSchema,
  publishedPayloadSchema,
} from './publication-input';

export type PublicationSession = {
  userId: string;
  tenantId: string;
  tenantName?: string;
};

export class PublicationRejectedError extends Error {}

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required.');
  return postgres(url, { max: 5, idle_timeout: 5 });
}

export async function mintPublication(
  session: PublicationSession,
  rawInput: unknown,
) {
  const { runId } = publicationInputSchema.parse(rawInput);
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(rawToken).digest();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const sql = database();
  try {
    const publicationId = await sql.begin(async (tx) => {
      await authorize(tx, session);
      const [run] = await tx<{ status: string }[]>`
        select status from app.workflow_runs
        where tenant_id = ${session.tenantId} and id = ${runId}
        for update`;
      if (!run || !['awaiting_approval', 'completed'].includes(run.status))
        throw new PublicationRejectedError(
          'Run is not waiting for human approval.',
        );
      const [pageSpec] = await tx<
        { id: string; spec_hash: string }[]
      >`select id, spec_hash from app.page_specs
        where tenant_id = ${session.tenantId} and workflow_run_id = ${runId}
          and invalidated_at is null
        order by version desc limit 1`;
      if (!pageSpec)
        throw new PublicationRejectedError('Run has no publishable PageSpec.');
      const [reviewGate] = await tx<{ passing_reviews: string }[]>`
        select count(*) filter (
          where verdict = 'pass' and page_spec_hash = ${pageSpec.spec_hash}
        ) as passing_reviews
        from app.reviews where tenant_id = ${session.tenantId}
          and page_spec_id = ${pageSpec.id}`;
      if (Number(reviewGate.passing_reviews) !== 3)
        throw new PublicationRejectedError(
          'Publication requires three passing current reviews.',
        );

      if (run.status === 'awaiting_approval')
        await tx`select app.approve_page_spec(${pageSpec.id})`;
      else {
        const [active] = await tx<{ id: string }[]>`
          select id from app.publications
          where tenant_id = ${session.tenantId} and page_spec_id = ${pageSpec.id}
            and revoked_at is null`;
        if (!active)
          throw new PublicationRejectedError(
            'Completed run has no active publication.',
          );
      }

      await tx.unsafe('set local role career_publisher');
      const [publication] = await tx<{ id: string }[]>`
        select app.mint_publication(
          ${pageSpec.id}, ${tokenHash}, ${expiresAt}
        ) as id`;
      await authorize(tx, session);
      await tx`update app.workflow_runs set status = 'completed',
        state = 'publication_ready'
        where tenant_id = ${session.tenantId} and id = ${runId}`;
      return publication.id;
    });
    return { publicationId, rawToken, expiresAt: expiresAt.toISOString() };
  } finally {
    await sql.end();
  }
}

export async function readPublication(publicationId: string, rawToken: string) {
  const id = z.string().uuid().parse(publicationId);
  const token = z.string().min(32).max(128).parse(rawToken);
  const sql = database();
  try {
    const row = await sql.begin(async (tx) => {
      await tx.unsafe('set local role career_reader');
      const [result] = await tx<{ payload: unknown }[]>`
        select app.read_shared_publication(
          ${id}, ${createHash('sha256').update(token).digest()}
        ) as payload`;
      return result;
    });
    return row?.payload ? publishedPayloadSchema.parse(row.payload) : undefined;
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
      await authorize(tx, session);
      await tx`select app.revoke_publication(${id})`;
    });
  } finally {
    await sql.end();
  }
}

async function authorize(
  tx: postgres.TransactionSql,
  session: PublicationSession,
) {
  await tx`select set_config('request.jwt.claim.sub', ${session.userId}, true),
    set_config('request.jwt.claim.tenant_id', ${session.tenantId}, true)`;
  await tx.unsafe('set local role career_app');
}
