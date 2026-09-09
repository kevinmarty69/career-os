import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyInterview,
  readInterview,
  saveInterview,
  listInterviews,
} from '../../lib/guided-interview';
import { syntheticProfile } from '../../lib/fixture';
import { livingProfileInputSchema, type Profile } from '../../lib/schemas';

const ids = {
  source: 'interview-source',
  evidence: 'interview-evidence',
  claim: 'interview-claim',
};
test('guided drafts resume without creating claims; signed testimony stays private and declared', () => {
  const profile: Profile = {
    ...syntheticProfile,
    claims: syntheticProfile.claims.map((claim) => ({
      ...claim,
      level: 'declared',
    })),
  };
  const draft = {
    ...emptyInterview,
    step: 1,
    answers: ['Built a cache', '', '', '', ''],
    statement: 'Built a cache.',
  };
  const pending = saveInterview(profile, draft, ids);
  assert.deepEqual(readInterview(pending), draft);
  assert.equal(pending.claims.length, syntheticProfile.claims.length);
  const resumed = saveInterview(pending, { ...draft, step: 2 }, ids);
  assert.equal(resumed.sources.length, pending.sources.length);
  const signed = saveInterview(resumed, draft, ids, '2026-09-08T12:00:00.000Z');
  assert.doesNotThrow(() => livingProfileInputSchema.parse(signed));
  const claim = signed.claims.at(-1)!;
  assert.equal(claim.level, 'declared');
  assert.equal(claim.sensitivity, 'private');
  assert.deepEqual(claim.allowedUses, ['interview']);
  assert.equal(readInterview(signed).signedAt, '2026-09-08T12:00:00.000Z');
  assert.equal(
    saveInterview(signed, draft, ids, '2026-09-08T13:00:00.000Z'),
    signed,
  );
  assert.equal(saveInterview(signed, draft, ids), signed);
  assert.throws(() =>
    saveInterview(
      syntheticProfile,
      emptyInterview,
      ids,
      '2026-09-08T12:00:00.000Z',
    ),
  );
});

test('independent sessions repair only the selected wording; publication permission never exposes answers', () => {
  const sessionId = 'aabbeeff-1234-4123-8234-123456789abc';
  const original = syntheticProfile.claims[0];
  const input = {
    ...emptyInterview,
    sessionId,
    targetStatement: original.statement,
    answers: [
      'Built a cache',
      '2024',
      '11 minutes',
      '7 minutes',
      'Private colleague name',
    ],
    statement: 'Build time went from 11 to 7 minutes.',
    shareStatement: true,
  };
  const saved = saveInterview(
    syntheticProfile,
    input,
    ids,
    '2026-09-09T10:00:00.000Z',
  );
  assert.equal(saved.claims[0].level, 'unsupported');
  const testimony = saved.claims.at(-1)!;
  assert.equal(testimony.level, 'declared');
  assert.ok(testimony.allowedUses.includes('application'));
  const evidence = saved.evidence.find((item) =>
    testimony.evidenceIds.includes(item.id),
  )!;
  assert.equal(evidence.excerpt, input.statement);
  assert.ok(!evidence.excerpt.includes('Private colleague'));
  const transcript = saved.sources.find((source) =>
    source.locator?.includes(sessionId),
  )!;
  assert.deepEqual(transcript.allowedUses, ['interview']);
  assert.equal(
    readInterview(saved, sessionId).signedAt,
    '2026-09-09T10:00:00.000Z',
  );
  const nextSession = 'aabbeeff-1234-4123-8234-123456789abd';
  const second = saveInterview(
    saved,
    { ...emptyInterview, sessionId: nextSession },
    { source: 'next-source', evidence: 'next-evidence', claim: 'next-claim' },
  );
  assert.equal(listInterviews(second).length, 2);
  assert.equal(readInterview(second, nextSession).signedAt, undefined);
  assert.equal(second.claims.length, saved.claims.length);
});
