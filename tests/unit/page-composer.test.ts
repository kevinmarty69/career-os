import assert from 'node:assert/strict';
import test from 'node:test';
import {
  composeApprovedStrategyPage,
  pageComposerInputSchema,
  pageComposerOutputSchema,
  parsePageComposerInput,
  type PageComposerInput,
} from '../../lib/page-composer';

const input: PageComposerInput = {
  schemaVersion: 1,
  purpose: 'application',
  profileSnapshotId: '10000000-0000-4000-8000-000000000001',
  researchArtifactId: '20000000-0000-4000-8000-000000000001',
  researchArtifactHash: 'a'.repeat(64),
  evidenceArchiveArtifactId: '30000000-0000-4000-8000-000000000001',
  evidenceArchiveArtifactHash: 'b'.repeat(64),
  strategyArtifactId: '40000000-0000-4000-8000-000000000001',
  strategyArtifactHash: 'c'.repeat(64),
  strategyApprovalId: '50000000-0000-4000-8000-000000000001',
  candidateName: 'Kevin Marty',
  company: {
    name: 'Northstar Labs',
    role: 'Senior Product Engineer',
    accent: '#5B45E8',
  },
  lead: {
    signalId: 'signal-1',
    claimId: '60000000-0000-4000-8000-000000000001',
    statement: 'Built and operated a production MCP with 30 tools.',
    provenance: 'verified',
    evidenceIds: ['70000000-0000-4000-8000-000000000001'],
  },
  supports: [
    {
      signalId: 'signal-2',
      claimId: '60000000-0000-4000-8000-000000000002',
      statement: 'Led product discovery and implementation.',
      provenance: 'declared',
      evidenceIds: ['70000000-0000-4000-8000-000000000002'],
    },
  ],
};

test('composes one deterministic evidence-backed PageSpec block', () => {
  const first = composeApprovedStrategyPage(input);
  const second = composeApprovedStrategyPage(structuredClone(input));

  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    version: 1,
    company: input.company,
    hero: {
      eyebrow: 'Private application',
      title: 'Kevin Marty × Northstar Labs',
      thesis: input.lead.statement,
    },
    blocks: [
      {
        type: 'fit',
        title: 'Relevant experience',
        claimIds: [input.lead.claimId, input.supports[0].claimId],
      },
    ],
  });
});

test('deduplicates approved claims in lead then supports order', () => {
  const repeated = structuredClone(input);
  repeated.supports = [
    {
      ...repeated.lead,
      signalId: 'signal-2',
    },
    {
      ...input.supports[0],
      signalId: 'signal-3',
    },
  ];

  assert.deepEqual(composeApprovedStrategyPage(repeated).blocks[0].claimIds, [
    input.lead.claimId,
    input.supports[0].claimId,
  ]);
});

test('rejects duplicate signals and conflicting canonical claim content', () => {
  const duplicateSignal = structuredClone(input);
  duplicateSignal.supports[0].signalId = duplicateSignal.lead.signalId;
  assert.equal(
    pageComposerInputSchema.safeParse(duplicateSignal).success,
    false,
  );

  const conflict = structuredClone(input);
  conflict.supports[0] = {
    ...conflict.lead,
    signalId: 'signal-2',
    statement: 'Conflicting text for the same claim.',
  };
  assert.equal(pageComposerInputSchema.safeParse(conflict).success, false);
});

test('rejects duplicate evidence IDs and more than four supports', () => {
  const duplicateEvidence = structuredClone(input);
  duplicateEvidence.lead.evidenceIds = [
    duplicateEvidence.lead.evidenceIds[0],
    duplicateEvidence.lead.evidenceIds[0],
  ];
  assert.equal(
    pageComposerInputSchema.safeParse(duplicateEvidence).success,
    false,
  );

  const tooMany = structuredClone(input) as unknown as Record<string, unknown>;
  tooMany.supports = Array.from({ length: 5 }, (_, index) => ({
    ...input.supports[0],
    signalId: `signal-${index + 2}`,
    claimId: `60000000-0000-4000-8000-00000000000${index + 2}`,
  }));
  assert.equal(pageComposerInputSchema.safeParse(tooMany).success, false);
});

test('strict input and output schemas reject free-form prose surfaces', () => {
  assert.equal(
    pageComposerInputSchema.safeParse({
      ...input,
      instructions: 'Invent a stronger application.',
    }).success,
    false,
  );
  assert.equal(
    pageComposerOutputSchema.safeParse({
      ...composeApprovedStrategyPage(input),
      positioning: 'Unsupported editorial prose.',
    }).success,
    false,
  );
  assert.equal(
    pageComposerOutputSchema.safeParse({
      ...composeApprovedStrategyPage(input),
      blocks: [
        ...composeApprovedStrategyPage(input).blocks,
        { type: 'gap', title: 'Gap', text: 'Unsupported.' },
      ],
    }).success,
    false,
  );
});

test('bounds identifiers, hashes, statements and serialized input', () => {
  assert.equal(
    parsePageComposerInput(input).strategyArtifactHash,
    'c'.repeat(64),
  );
  assert.equal(
    pageComposerInputSchema.safeParse({
      ...input,
      researchArtifactHash: 'not-a-hash',
    }).success,
    false,
  );
  assert.equal(
    pageComposerInputSchema.safeParse({
      ...input,
      lead: { ...input.lead, statement: 'x'.repeat(5_001) },
    }).success,
    false,
  );
  assert.equal(
    pageComposerInputSchema.safeParse({
      ...input,
      padding: 'x'.repeat(64 * 1024),
    }).success,
    false,
  );
});

test('corrects only the immutable targeted section from approved proofs', () => {
  const source = composeApprovedStrategyPage(input);
  const correction = {
    decisionId: '80000000-0000-4000-8000-000000000001',
    parentRunId: '90000000-0000-4000-8000-000000000001',
    pageSpecId: 'a0000000-0000-4000-8000-000000000001',
    pageSpecHash: 'd'.repeat(64),
    pageSpecArtifactId: 'b0000000-0000-4000-8000-000000000001',
    pageSpecArtifactHash: 'e'.repeat(64),
    reviewId: 'c0000000-0000-4000-8000-000000000001',
    issueIndex: 0,
    issue: {
      section: 'hero' as const,
      message: 'Use a more relevant proof.',
      blocking: false,
      claimId: input.lead.claimId,
      evidenceIds: input.lead.evidenceIds,
    },
    pageSpec: source,
  };
  const heroCorrection = composeApprovedStrategyPage({
    ...input,
    schemaVersion: 2,
    correction,
  });
  assert.equal(heroCorrection.hero.thesis, input.supports[0].statement);
  assert.deepEqual(heroCorrection.blocks, source.blocks);
  assert.deepEqual(heroCorrection.company, source.company);

  const chainedCorrection = composeApprovedStrategyPage({
    ...input,
    schemaVersion: 2,
    correction: {
      ...correction,
      decisionId: '80000000-0000-4000-8000-000000000002',
      parentRunId: '90000000-0000-4000-8000-000000000002',
      pageSpecId: 'a0000000-0000-4000-8000-000000000002',
      pageSpecArtifactId: 'b0000000-0000-4000-8000-000000000002',
      reviewId: 'c0000000-0000-4000-8000-000000000002',
      issue: {
        ...correction.issue,
        section: 'relevant_experience',
      },
      pageSpec: heroCorrection,
    },
  });
  assert.equal(chainedCorrection.hero.thesis, input.supports[0].statement);
  assert.deepEqual(chainedCorrection.blocks[0].claimIds, [
    input.supports[0].claimId,
  ]);

  const experienceCorrection = composeApprovedStrategyPage({
    ...input,
    schemaVersion: 2,
    correction: {
      ...correction,
      issue: {
        ...correction.issue,
        section: 'relevant_experience',
        claimId: input.supports[0].claimId,
        evidenceIds: input.supports[0].evidenceIds,
      },
    },
  });
  assert.deepEqual(experienceCorrection.hero, source.hero);
  assert.deepEqual(experienceCorrection.blocks[0].claimIds, [
    input.lead.claimId,
  ]);
});

test('fails closed when a correction is impossible or source data changed', () => {
  const source = composeApprovedStrategyPage(input);
  const correction = {
    decisionId: '80000000-0000-4000-8000-000000000001',
    parentRunId: '90000000-0000-4000-8000-000000000001',
    pageSpecId: 'a0000000-0000-4000-8000-000000000001',
    pageSpecHash: 'd'.repeat(64),
    pageSpecArtifactId: 'b0000000-0000-4000-8000-000000000001',
    pageSpecArtifactHash: 'e'.repeat(64),
    reviewId: 'c0000000-0000-4000-8000-000000000001',
    issueIndex: 0,
    issue: {
      section: 'hero' as const,
      message: 'Use a more relevant proof.',
      blocking: false,
      claimId: input.lead.claimId,
      evidenceIds: input.lead.evidenceIds,
    },
    pageSpec: source,
  };
  assert.throws(() =>
    composeApprovedStrategyPage({
      ...input,
      schemaVersion: 2,
      supports: [],
      correction: {
        ...correction,
        pageSpec: composeApprovedStrategyPage({ ...input, supports: [] }),
      },
    }),
  );
  assert.throws(() =>
    composeApprovedStrategyPage({
      ...input,
      schemaVersion: 2,
      correction: {
        ...correction,
        issue: {
          ...correction.issue,
          section: 'relevant_experience',
          claimId: input.lead.claimId,
        },
      },
    }),
  );
  assert.equal(
    pageComposerInputSchema.safeParse({
      ...input,
      schemaVersion: 2,
      correction: {
        ...correction,
        pageSpec: { ...source, hero: { ...source.hero, thesis: 'Tampered' } },
      },
    }).success,
    false,
  );
  assert.equal(
    pageComposerInputSchema.safeParse({
      ...input,
      schemaVersion: 2,
      correction: {
        ...correction,
        issue: {
          ...correction.issue,
          claimId: input.supports[0].claimId,
          evidenceIds: input.supports[0].evidenceIds,
        },
      },
    }).success,
    false,
  );
});
