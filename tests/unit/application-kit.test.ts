import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApplicationKit } from '../../lib/application-kit';

const claimId = '988c0a00-0000-4000-8000-000000000012';

test('builds messages from the current sourced draft and propagates corrections', () => {
  const input: Parameters<typeof buildApplicationKit>[0] = {
    company: 'Signal Forge',
    role: 'Staff Platform Engineer',
    locale: 'en',
    profile: {
      name: 'Alex Morgan',
      headline: 'Product engineer',
      sources: [
        {
          id: 'source',
          kind: 'document',
          title: 'Evidence',
          sensitivity: 'private',
          allowedUses: ['application'],
          trust: 'untrusted-data',
        },
      ],
      evidence: [
        {
          id: 'proof',
          sourceId: 'source',
          label: 'Ownership',
          excerpt: 'Owned a production deployment platform end to end.',
        },
      ],
      claims: [
        {
          id: claimId,
          statement: 'Owned a production deployment platform end to end.',
          kind: 'experience',
          level: 'verified',
          evidenceIds: ['proof'],
          sensitivity: 'private',
          allowedUses: ['application'],
        },
      ],
    },
    spec: {
      version: 1,
      company: {
        name: 'Signal Forge',
        role: 'Staff Platform Engineer',
        accent: '#000000',
      },
      hero: {
        eyebrow: 'Private application',
        title: 'Application',
        thesis: 'Owned a production deployment platform end to end.',
      },
      blocks: [{ type: 'fit', title: 'Experience', claimIds: [claimId] }],
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
  };
  const kit = buildApplicationKit(input);

  assert.equal(kit.questions.length, 2);
  assert.match(kit.questions[0].text, /incident response model/);
  assert.match(kit.messages[0].text, /Signal Forge/);
  assert.deepEqual(kit.messages[0].sourceClaimIds, [claimId]);
  assert.equal(kit.workSample?.sourceSignalId, 'signal-2');
  assert.match(kit.workSample?.brief ?? '', /Maximum two hours/);
  assert.ok(
    kit.messages.every(({ text }) => !text.includes('Lead with verified')),
  );

  const corrected = structuredClone(input);
  const replacement = {
    ...corrected.profile.claims[0],
    id: 'replacement',
    statement: 'Led the incident response programme.',
  };
  corrected.profile.claims.push(replacement);
  corrected.spec!.hero.thesis = replacement.statement;
  corrected.spec!.blocks = [
    { type: 'fit', title: 'Experience', claimIds: [replacement.id] },
  ];
  const messages = buildApplicationKit(corrected).messages;
  assert.equal(messages.length, 2);
  for (const message of messages) {
    assert.deepEqual(message.sourceClaimIds, [replacement.id]);
    assert.ok(message.text.includes(replacement.statement.replace(/\.$/, '')));
    assert.ok(!message.text.includes(input.profile.claims[0].statement));
  }
  assert.equal(
    buildApplicationKit({ ...input, spec: undefined }).messages.length,
    0,
  );
  corrected.profile.claims[1].level = 'unsupported';
  assert.equal(buildApplicationKit(corrected).messages.length, 0);
});
