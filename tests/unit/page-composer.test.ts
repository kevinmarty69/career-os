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
