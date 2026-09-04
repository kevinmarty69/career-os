import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApplicationKit } from '../../lib/application-kit';

const claimId = '988c0a00-0000-4000-8000-000000000012';

test('builds a grounded application kit from the approved strategy', () => {
  const kit = buildApplicationKit({
    company: 'Signal Forge',
    role: 'Staff Platform Engineer',
    locale: 'en',
    profile: {
      name: 'Alex Morgan',
      headline: 'Product engineer',
      sources: [],
      evidence: [],
      claims: [
        {
          id: claimId,
          statement: 'Owned a production deployment platform end to end.',
          kind: 'experience',
          level: 'verified',
          evidenceIds: [],
          sensitivity: 'private',
          allowedUses: ['application'],
        },
      ],
    },
    research: {
      artifactId: '988c0a00-0000-4000-8000-000000000011',
      artifactHash: 'a'.repeat(64),
      company: 'Signal Forge',
      role: 'Staff Platform Engineer',
      source: { kind: 'job-posting', trust: 'untrusted-data' },
      signals: [
        {
          signalId: 'signal-1',
          statement: 'Own platform reliability end to end.',
          excerpt: 'Own the deployment platform.',
          category: 'responsibility',
          priority: 'high',
        },
        {
          signalId: 'signal-2',
          statement: 'Design the incident response model.',
          excerpt: 'Define incident response.',
          category: 'requirement',
          priority: 'high',
        },
      ],
    },
    strategy: {
      artifactId: '988c0a00-0000-4000-8000-000000000016',
      artifactHash: 'c'.repeat(64),
      schemaVersion: 1,
      purpose: 'application',
      profileSnapshotId: '988c0a00-0000-4000-8000-000000000015',
      researchArtifactId: '988c0a00-0000-4000-8000-000000000011',
      researchArtifactHash: 'a'.repeat(64),
      evidenceArchiveArtifactId: '988c0a00-0000-4000-8000-000000000014',
      evidenceArchiveArtifactHash: 'b'.repeat(64),
      copyPolicy: 'internal-editorial-direction',
      positioning: {
        message: 'Lead with verified platform ownership.',
        sourceSignalIds: ['signal-1'],
      },
      lead: {
        signalId: 'signal-1',
        claimId,
        evidenceIds: ['988c0a00-0000-4000-8000-000000000013'],
        rationale: 'Direct ownership evidence.',
      },
      supports: [],
      gaps: [
        {
          signalId: 'signal-2',
          treatment: 'interview_topic',
          rationale: 'Clarify in interview.',
        },
      ],
      omittedSignalIds: [],
    },
  });

  assert.equal(kit.questions.length, 2);
  assert.match(kit.questions[0].text, /incident response model/);
  assert.match(kit.messages[0].text, /Signal Forge/);
  assert.deepEqual(kit.messages[0].sourceClaimIds, [claimId]);
  assert.equal(kit.workSample?.sourceSignalId, 'signal-2');
  assert.match(kit.workSample?.brief ?? '', /Maximum two hours/);
});
