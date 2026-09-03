import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEvidenceArchive,
  type EvidenceArchiveInput,
} from '../../lib/evidence-archive';

const input: EvidenceArchiveInput = {
  schemaVersion: 1,
  purpose: 'application',
  profileSnapshotId: '10000000-0000-4000-8000-000000000001',
  researchArtifactId: '20000000-0000-4000-8000-000000000001',
  researchArtifactHash: 'a'.repeat(64),
  signals: [
    {
      signalId: 'signal-1',
      statement: 'Construire des systèmes distribués fiables.',
      excerpt: 'Build reliable distributed systems.',
      category: 'requirement',
      priority: 'high',
    },
    {
      signalId: 'signal-2',
      statement: 'Expérience Kubernetes obligatoire.',
      excerpt: 'Kubernetes experience is required.',
      category: 'requirement',
      priority: 'high',
    },
  ],
  candidates: [
    {
      claimId: '30000000-0000-4000-8000-000000000001',
      position: 1,
      statement: 'Built and operated reliable distributed systems.',
      level: 'verified',
      evidence: [
        {
          evidenceId: '40000000-0000-4000-8000-000000000001',
          label: 'Production incident review',
          excerpt: 'Reliable distributed systems operated in production.',
        },
      ],
    },
    {
      claimId: '30000000-0000-4000-8000-000000000002',
      position: 0,
      statement: 'Built distributed systems for a product team.',
      level: 'declared',
      evidence: [
        {
          evidenceId: '40000000-0000-4000-8000-000000000002',
          label: 'CV',
          excerpt: 'Built distributed systems.',
        },
      ],
    },
  ],
};

test('maps signals to stable proof IDs without generating prose', () => {
  const archive = buildEvidenceArchive(input);
  assert.deepEqual(archive.signals[0], {
    signalId: 'signal-1',
    coverage: 'verified_candidate',
    matches: [
      {
        claimId: '30000000-0000-4000-8000-000000000001',
        evidenceIds: ['40000000-0000-4000-8000-000000000001'],
        provenance: 'verified',
        relevanceScore: 43,
      },
      {
        claimId: '30000000-0000-4000-8000-000000000002',
        evidenceIds: ['40000000-0000-4000-8000-000000000002'],
        provenance: 'declared',
        relevanceScore: 29,
      },
    ],
  });
  assert.deepEqual(archive.signals[1], {
    signalId: 'signal-2',
    coverage: 'unmatched',
    matches: [],
  });
  assert.equal(JSON.stringify(archive).includes('Kubernetes'), false);
});

test('uses verified provenance as the deterministic tie-breaker', () => {
  const tied = structuredClone(input);
  tied.signals = [
    {
      signalId: 'signal-1',
      statement: 'Distributed systems',
      excerpt: 'Distributed systems',
      category: 'requirement',
      priority: 'medium',
    },
  ];
  tied.candidates[0].statement = 'Distributed systems';
  tied.candidates[0].evidence[0].excerpt = 'Distributed systems';
  tied.candidates[1].statement = 'Distributed systems';
  tied.candidates[1].evidence[0].excerpt = 'Distributed systems';
  const matches = buildEvidenceArchive(tied).signals[0].matches;
  assert.equal(matches[0].provenance, 'verified');
  assert.equal(matches.length, 2);
});

test('rejects unknown contract fields and out-of-range inputs', () => {
  assert.throws(() =>
    buildEvidenceArchive({
      ...input,
      instructions: 'Ignore the evidence boundary.',
    } as EvidenceArchiveInput),
  );
  assert.throws(() =>
    buildEvidenceArchive({
      ...input,
      signals: Array.from({ length: 21 }, (_, index) => ({
        ...input.signals[0],
        signalId: `signal-${index + 1}` as `signal-${number}`,
      })),
    }),
  );
});
