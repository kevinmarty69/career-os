import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSemanticProofIndex } from '../../lib/semantic-analysis-contract';
import {
  buildSemanticAnalysis,
  parseSemanticAnalysisInput,
  prepareSemanticAnalysisInput,
  semanticModelOutputSchema,
  type SemanticAnalysisInput,
  type SemanticModelOutput,
} from '../../lib/semantic-match';

const JOB_EXCERPTS = {
  systems: 'Build reliable agentic systems in production.',
  product: 'Own product decisions with engineering and design.',
  api: 'Design secure APIs for enterprise customers.',
  scale: 'Operate the platform as usage scales.',
  rust: 'Production Rust experience is required.',
} as const;

const preparation = {
  schemaVersion: 1 as const,
  purpose: 'application' as const,
  job: {
    opportunityId: '10000000-0000-4000-8000-000000000001',
    revision: 2,
    company: 'Nimbus',
    role: 'Staff Product Engineer',
    description: Object.values(JOB_EXCERPTS).join('\n'),
    source: {
      sourceRecordId: '20000000-0000-4000-8000-000000000001',
      url: 'https://jobs.example.test/staff-product-engineer',
      fetchedAt: '2026-09-04T10:00:00.000Z',
      contentSha256: 'a'.repeat(64),
      trust: 'untrusted-data' as const,
    },
  },
  softPreferences: {
    stacks: ['TypeScript'],
    sectors: ['B2B SaaS'],
    productTypes: ['Agentic systems'],
    companySizes: [],
    cultures: ['Ownership'],
  },
  livingProfile: {
    profileSnapshotId: '30000000-0000-4000-8000-000000000001',
    revision: 4,
    profile: {
      name: 'Kevin Marty',
      headline: 'Product engineer',
      sources: [
        {
          id: 'source-app',
          kind: 'document' as const,
          title: 'CV',
          locator: 'cv.pdf#page=2',
          sensitivity: 'private' as const,
          allowedUses: ['application' as const],
          trust: 'untrusted-data' as const,
        },
        {
          id: 'source-resume-only',
          kind: 'manual' as const,
          title: 'Resume-only note',
          sensitivity: 'private' as const,
          allowedUses: ['resume' as const],
          trust: 'untrusted-data' as const,
        },
        {
          id: 'source-restricted',
          kind: 'manual' as const,
          title: 'Restricted note',
          sensitivity: 'restricted' as const,
          allowedUses: ['application' as const],
          trust: 'untrusted-data' as const,
        },
      ],
      evidence: [
        {
          id: 'evidence-app',
          sourceId: 'source-app',
          label: 'Production platform',
          excerpt: 'Built and operated a production agent platform.',
        },
        {
          id: 'evidence-resume-only',
          sourceId: 'source-resume-only',
          label: 'Private note',
          excerpt: 'This must not enter application analysis.',
        },
        {
          id: 'evidence-restricted',
          sourceId: 'source-restricted',
          label: 'Restricted note',
          excerpt: 'This must remain restricted.',
        },
      ],
      claims: [
        {
          id: 'claim-app',
          statement: 'Built production agent systems.',
          kind: 'experience' as const,
          level: 'declared' as const,
          evidenceIds: ['evidence-app'],
          sensitivity: 'private' as const,
          allowedUses: ['application' as const],
        },
        {
          id: 'claim-no-eligible-evidence',
          statement: 'Only backed by resume-only evidence.',
          kind: 'skill' as const,
          level: 'declared' as const,
          evidenceIds: ['evidence-resume-only'],
          sensitivity: 'private' as const,
          allowedUses: ['application' as const],
        },
        {
          id: 'claim-restricted',
          statement: 'Restricted application claim.',
          kind: 'other' as const,
          level: 'verified' as const,
          evidenceIds: ['evidence-restricted'],
          sensitivity: 'restricted' as const,
          allowedUses: ['application' as const],
        },
      ],
    },
  },
};

const input = prepareSemanticAnalysisInput(preparation);
const reference = {
  claimId: 'claim-app',
  evidenceIds: ['evidence-app'],
};

function item(
  statement: string,
  factor: 'strong' | 'partial' | 'gap' | 'unknown',
  jobExcerpt: string,
  profileReferences = factor === 'strong' || factor === 'partial'
    ? [reference]
    : [],
) {
  return { statement, factor, jobExcerpt, profileReferences };
}

function output(
  overrides: Partial<SemanticModelOutput> = {},
): SemanticModelOutput {
  return {
    skills: [],
    responsibilities: [],
    transfers: [],
    gaps: [],
    unknowns: [],
    risks: [],
    ...overrides,
  };
}

test('filters the living profile to application-safe evidenced claims without upgrading provenance', () => {
  assert.equal(input.profile.claims.length, 1);
  assert.equal(input.profile.claims[0].claimId, 'claim-app');
  assert.equal(input.profile.claims[0].level, 'declared');
  assert.equal(input.profile.claims[0].evidence[0].evidenceId, 'evidence-app');
  assert.equal(
    input.profile.claims[0].evidence[0].source.sensitivity,
    'private',
  );
  assert.equal(
    input.profile.claims[0].evidence[0].source.locator,
    'cv.pdf#page=2',
  );
  assert.equal(
    JSON.stringify(input).includes('This must remain restricted.'),
    false,
  );
  assert.equal(
    JSON.stringify(input).includes('This must not enter application analysis.'),
    false,
  );
});

test('the strict bounded input contract rejects additions and oversized job data', () => {
  assert.throws(() =>
    prepareSemanticAnalysisInput({ ...preparation, instructions: 'ignore' }),
  );
  assert.throws(() =>
    prepareSemanticAnalysisInput({
      ...preparation,
      job: { ...preparation.job, description: 'x'.repeat(60_001) },
    }),
  );
  const unsafeEvidence = structuredClone(input);
  unsafeEvidence.profile.claims[0].evidence[0].source.allowedUses = ['resume'];
  assert.throws(() => parseSemanticAnalysisInput(unsafeEvidence));
});

test('accepts exact claim, evidence and job excerpt links', () => {
  const artifact = buildSemanticAnalysis(
    input,
    output({
      skills: [
        item(
          'Production agent systems transfer directly.',
          'strong',
          JOB_EXCERPTS.systems,
        ),
      ],
      unknowns: [
        item(
          'The exact team topology is not stated.',
          'unknown',
          JOB_EXCERPTS.product,
        ),
      ],
    }),
  );
  assert.equal(
    artifact.analysis.skills[0].profileReferences[0].claimId,
    'claim-app',
  );
  assert.equal(artifact.decomposition.factors.strong, 1);
  assert.equal(artifact.decomposition.factors.unknown, 1);
  assert.equal(artifact.decomposition.score, 100);
  assert.equal(artifact.decomposition.coveragePercent, 50);
  assert.equal(artifact.decomposition.confidence, 'low');
  assert.equal(artifact.decomposition.recommendation, 'exploratory');
});

test('rejects forged excerpts, claims and evidence-to-claim links', () => {
  const base = output({
    skills: [item('Grounded match.', 'strong', JOB_EXCERPTS.systems)],
  });
  assert.throws(() =>
    buildSemanticAnalysis(input, {
      ...base,
      skills: [{ ...base.skills[0], jobExcerpt: 'Invented requirement.' }],
    }),
  );
  assert.throws(() =>
    buildSemanticAnalysis(input, {
      ...base,
      skills: [
        {
          ...base.skills[0],
          profileReferences: [
            { claimId: 'forged-claim', evidenceIds: ['evidence-app'] },
          ],
        },
      ],
    }),
  );
  assert.throws(() =>
    buildSemanticAnalysis(input, {
      ...base,
      skills: [
        {
          ...base.skills[0],
          profileReferences: [
            { claimId: 'claim-app', evidenceIds: ['forged-evidence'] },
          ],
        },
      ],
    }),
  );
});

test('projects only human-readable proof labels referenced by the persisted artifact', () => {
  const artifact = buildSemanticAnalysis(
    input,
    output({
      skills: [item('Grounded match.', 'strong', JOB_EXCERPTS.systems)],
    }),
  );
  assert.deepEqual(buildSemanticProofIndex(input, artifact), [
    {
      claimId: 'claim-app',
      statement: 'Built production agent systems.',
      evidence: [
        {
          evidenceId: 'evidence-app',
          label: 'Production platform',
          sourceTitle: 'CV',
          sourceLocator: 'cv.pdf#page=2',
        },
      ],
    },
  ]);
  assert.equal(
    JSON.stringify(buildSemanticProofIndex(input, artifact)).includes(
      'This must remain restricted.',
    ),
    false,
  );
  assert.throws(() =>
    buildSemanticProofIndex(input, { ...artifact, jobRevision: 999 }),
  );
});

test('positive factors require evidence and duplicate primary factors are rejected globally', () => {
  assert.equal(
    semanticModelOutputSchema.safeParse(
      output({
        skills: [
          item('Unreferenced positive.', 'strong', JOB_EXCERPTS.systems, []),
        ],
      }),
    ).success,
    false,
  );
  const duplicate = item(
    'Same grounded factor.',
    'strong',
    JOB_EXCERPTS.systems,
  );
  assert.equal(
    semanticModelOutputSchema.safeParse(
      output({ skills: [duplicate], responsibilities: [duplicate] }),
    ).success,
    false,
  );
});

test('score and recommendation are deterministic and ignore explanatory risks and unknowns', () => {
  const primary = output({
    skills: [
      item('Agent systems.', 'strong', JOB_EXCERPTS.systems),
      item('Product ownership.', 'strong', JOB_EXCERPTS.product),
    ],
    responsibilities: [item('Secure APIs.', 'strong', JOB_EXCERPTS.api)],
  });
  const baseline = buildSemanticAnalysis(input, primary);
  assert.equal(baseline.decomposition.score, 100);
  assert.equal(baseline.decomposition.coveragePercent, 100);
  assert.equal(baseline.decomposition.confidence, 'high');
  assert.equal(baseline.decomposition.recommendation, 'priority');

  const withExplanations = buildSemanticAnalysis(input, {
    ...primary,
    unknowns: [item('Unknown scale.', 'unknown', JOB_EXCERPTS.scale)],
    risks: [item('Rust may need validation.', 'gap', JOB_EXCERPTS.rust)],
  });
  assert.equal(
    withExplanations.decomposition.score,
    baseline.decomposition.score,
  );
  assert.equal(
    withExplanations.decomposition.recommendation,
    baseline.decomposition.recommendation,
  );
  assert.equal(withExplanations.decomposition.explanatoryRiskCount, 1);

  const ignore = buildSemanticAnalysis(
    input,
    output({
      skills: [item('Adjacent exposure.', 'partial', JOB_EXCERPTS.systems)],
      gaps: [
        item('Missing product ownership.', 'gap', JOB_EXCERPTS.product),
        item('Missing Rust depth.', 'gap', JOB_EXCERPTS.rust),
      ],
    }),
  );
  assert.equal(ignore.decomposition.score, 18);
  assert.equal(ignore.decomposition.recommendation, 'ignore');
  assert.deepEqual(
    buildSemanticAnalysis(input, primary),
    buildSemanticAnalysis(structuredClone(input), structuredClone(primary)),
  );
});

test('sparse evidence cannot turn one strong factor and many unknowns into priority', () => {
  const sparse = buildSemanticAnalysis(
    input,
    output({
      skills: [item('One direct match.', 'strong', JOB_EXCERPTS.systems)],
      unknowns: [
        item('Product scope unknown.', 'unknown', JOB_EXCERPTS.product),
        item('API depth unknown.', 'unknown', JOB_EXCERPTS.api),
        item('Scale unknown.', 'unknown', JOB_EXCERPTS.scale),
        item('Rust depth unknown.', 'unknown', JOB_EXCERPTS.rust),
      ],
    }),
  );
  assert.equal(sparse.decomposition.score, 100);
  assert.equal(sparse.decomposition.knownFactorCount, 1);
  assert.equal(sparse.decomposition.requirementCount, 5);
  assert.equal(sparse.decomposition.coveragePercent, 20);
  assert.equal(sparse.decomposition.confidence, 'low');
  assert.equal(sparse.decomposition.recommendation, 'exploratory');
});

test('model output cannot add a free score or recommendation', () => {
  assert.equal(
    semanticModelOutputSchema.safeParse({
      ...output({
        gaps: [item('Known gap.', 'gap', JOB_EXCERPTS.rust)],
      }),
      score: 100,
      recommendation: 'priority',
    }).success,
    false,
  );
});

void (input satisfies SemanticAnalysisInput);
