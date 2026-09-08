import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyInterview,
  readInterview,
  saveInterview,
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
