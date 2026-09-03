import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFactualityReview,
  buildQualitativeReview,
  parseReviewerInput,
  REVIEW_INPUT_MAX_BYTES,
  reviewModelOutputSchema,
  reviewerInputSchema,
  reviewerOutputSchema,
  type ReviewerInput,
} from '../../lib/reviewer';

const claimId = '40000000-0000-4000-8000-000000000001';
const evidenceId = '50000000-0000-4000-8000-000000000001';
const input: ReviewerInput = {
  schemaVersion: 1,
  reviewer: 'recruiter',
  reviewStartId: '70000000-0000-4000-8000-000000000001',
  profileSnapshotId: '10000000-0000-4000-8000-000000000001',
  pageSpecId: '60000000-0000-4000-8000-000000000001',
  pageSpecHash: 'a'.repeat(64),
  pageSpecArtifactId: '80000000-0000-4000-8000-000000000001',
  pageSpecArtifactHash: 'b'.repeat(64),
  candidateName: 'Ada Lovelace',
  company: {
    name: 'Northstar Labs',
    role: 'Senior Product Engineer',
  },
  pageSpec: {
    version: 1,
    company: {
      name: 'Northstar Labs',
      role: 'Senior Product Engineer',
      accent: '#5847e8',
    },
    hero: {
      eyebrow: 'Private application',
      title: 'Ada Lovelace × Northstar Labs',
      thesis: 'Built and operated reliable production systems.',
    },
    blocks: [
      {
        type: 'fit',
        title: 'Relevant experience',
        claimIds: [claimId],
      },
    ],
  },
  proofs: [
    {
      claimId,
      statement: 'Built and operated reliable production systems.',
      provenance: 'verified',
      evidence: [
        {
          evidenceId,
          sourceId: '30000000-0000-4000-8000-000000000001',
          label: 'Production review',
          excerpt: 'Operated reliable production systems end to end.',
        },
      ],
    },
  ],
};

test('builds bounded qualitative output with immutable lineage', () => {
  const pass = buildQualitativeReview(input, 'recruiter', { issues: [] });
  assert.equal(pass.verdict, 'pass');
  assert.equal(pass.reviewer, 'recruiter');
  assert.equal(pass.purpose, 'page-spec-review');
  assert.equal(pass.pageSpecHash, input.pageSpecHash);

  const review = buildQualitativeReview(input, 'recruiter', {
    issues: [
      {
        section: 'hero',
        message: 'Make the ownership outcome easier to scan.',
        claimId,
        evidenceIds: [evidenceId],
      },
    ],
  });
  assert.equal(review.verdict, 'changes_required');
  assert.equal(review.issues[0].blocking, false);
});

test('rejects excessive issues, messages and forged proof references', () => {
  const issue = {
    section: 'hero',
    message: 'Shorten it.',
    claimId,
    evidenceIds: [evidenceId],
  } as const;
  assert.equal(
    reviewModelOutputSchema.safeParse({
      issues: Array.from({ length: 6 }, () => issue),
    }).success,
    false,
  );
  assert.equal(
    reviewModelOutputSchema.safeParse({
      issues: [{ ...issue, message: 'x'.repeat(401) }],
    }).success,
    false,
  );
  assert.throws(() =>
    buildQualitativeReview(input, 'recruiter', {
      issues: [{ ...issue, claimId: crypto.randomUUID() }],
    }),
  );
  assert.throws(() =>
    buildQualitativeReview(input, 'recruiter', {
      issues: [{ ...issue, evidenceIds: [crypto.randomUUID()] }],
    }),
  );
  assert.equal(
    reviewerOutputSchema.safeParse({
      ...buildQualitativeReview(input, 'recruiter', { issues: [] }),
      verdict: 'changes_required',
    }).success,
    false,
  );
});

test('requires exact authority, PageSpec claim mapping and company context', () => {
  assert.throws(() => parseReviewerInput(input, 'hiring-manager'));
  assert.equal(
    reviewerInputSchema.safeParse({
      ...input,
      proofs: [{ ...input.proofs[0], claimId: crypto.randomUUID() }],
    }).success,
    false,
  );
  assert.equal(
    reviewerInputSchema.safeParse({
      ...input,
      company: { ...input.company, role: 'Different role' },
    }).success,
    false,
  );
});

test('bounds reviewer input by UTF-8 bytes', () => {
  const unicode = (proofCount: number): ReviewerInput => {
    const proofs = Array.from({ length: proofCount }, () => {
      const nextClaimId = crypto.randomUUID();
      return {
        claimId: nextClaimId,
        statement: '🔥'.repeat(3_000),
        provenance: 'verified' as const,
        evidence: Array.from({ length: 2 }, () => ({
          evidenceId: crypto.randomUUID(),
          sourceId: crypto.randomUUID(),
          label: 'Production evidence',
          excerpt: '🔥'.repeat(1_500),
        })),
      };
    });
    return {
      ...input,
      pageSpec: {
        ...input.pageSpec,
        hero: { ...input.pageSpec.hero, thesis: '🔥'.repeat(3_000) },
        blocks: [
          {
            ...input.pageSpec.blocks[0],
            claimIds: proofs.map((proof) => proof.claimId),
          },
        ],
      },
      proofs,
    };
  };

  const accepted = unicode(1);
  assert.ok(
    new TextEncoder().encode(JSON.stringify(accepted)).byteLength <
      REVIEW_INPUT_MAX_BYTES,
  );
  assert.equal(parseReviewerInput(accepted).proofs.length, 1);
  const rejected = unicode(2);
  assert.ok(
    new TextEncoder().encode(JSON.stringify(rejected)).byteLength >
      REVIEW_INPUT_MAX_BYTES,
  );
  assert.throws(() => parseReviewerInput(rejected), /size limit/);
});

test('factuality is deterministic and never accepts a model verdict', () => {
  const factualityInput: ReviewerInput = {
    ...input,
    reviewer: 'factuality',
  };
  const result = buildFactualityReview(factualityInput);
  assert.equal(result.verdict, 'pass');
  assert.equal(result.reviewer, 'factuality');
  assert.deepEqual(result.issues, []);

  assert.throws(() =>
    buildFactualityReview({
      ...factualityInput,
      pageSpec: {
        ...factualityInput.pageSpec,
        hero: {
          ...factualityInput.pageSpec.hero,
          thesis: 'A statement that is absent from the durable proofs.',
        },
      },
    }),
  );
});
