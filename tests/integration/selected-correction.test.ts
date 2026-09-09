import assert from 'node:assert/strict';
import test from 'node:test';
import postgres from 'postgres';
import { databaseTls } from '../../lib/database-tls';
import { composeApprovedStrategyPage } from '../../lib/page-composer';

test('Postgres and TypeScript agree on selected and historical corrections (read only)', async () => {
  if (!process.env.MIGRATION_DATABASE_URL)
    throw new Error(
      'MIGRATION_DATABASE_URL required for read-only function verification.',
    );
  const sql = postgres(process.env.MIGRATION_DATABASE_URL, {
    max: 1,
    ssl: databaseTls(),
  });
  const uuid = (n: number) =>
    `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const input = {
    schemaVersion: 1,
    purpose: 'application',
    profileSnapshotId: uuid(1),
    researchArtifactId: uuid(2),
    researchArtifactHash: 'a'.repeat(64),
    evidenceArchiveArtifactId: uuid(3),
    evidenceArchiveArtifactHash: 'b'.repeat(64),
    strategyArtifactId: uuid(4),
    strategyArtifactHash: 'c'.repeat(64),
    strategyApprovalId: uuid(5),
    candidateName: 'Synthetic candidate',
    company: { name: 'Synthetic company', role: 'Engineer', accent: '#000000' },
    lead: {
      signalId: 'signal-1',
      claimId: uuid(6),
      statement: 'Maintained the build pipeline.',
      provenance: 'declared',
      evidenceIds: [uuid(9)],
    },
    supports: [
      {
        signalId: 'signal-2',
        claimId: uuid(7),
        statement: 'Documented the incident process.',
        provenance: 'declared',
        evidenceIds: [uuid(10)],
      },
      {
        signalId: 'signal-3',
        claimId: uuid(8),
        statement: 'Led the deployment migration.',
        provenance: 'declared',
        evidenceIds: [uuid(11)],
      },
    ],
  };
  const correction = {
    decisionId: uuid(12),
    parentRunId: uuid(13),
    pageSpecId: uuid(14),
    pageSpecHash: 'd'.repeat(64),
    pageSpecArtifactId: uuid(15),
    pageSpecArtifactHash: 'e'.repeat(64),
    reviewId: uuid(16),
    issueIndex: 0,
    issue: {
      section: 'hero',
      message: 'Use another approved proof.',
      blocking: false,
      claimId: input.lead.claimId,
      evidenceIds: input.lead.evidenceIds,
    },
    pageSpec: composeApprovedStrategyPage(input),
  };
  try {
    await sql.begin('read only', async (tx) => {
      for (const replacementClaimId of [undefined, uuid(7), uuid(8)]) {
        const candidate = {
          ...input,
          schemaVersion: 2,
          correction: {
            ...correction,
            ...(replacementClaimId ? { replacementClaimId } : {}),
          },
        };
        const [row] =
          await tx`select app.materialize_page_composer_correction(${tx.json(candidate)}) as spec`;
        assert.deepEqual(row.spec, composeApprovedStrategyPage(candidate));
      }
      const bad = {
        ...input,
        schemaVersion: 2,
        correction: { ...correction, replacementClaimId: uuid(99) },
      };
      const [row] =
        await tx`select app.materialize_page_composer_correction(${tx.json(bad)}) as spec`;
      assert.equal(row.spec, null);
    });
  } finally {
    await sql.end();
  }
});
