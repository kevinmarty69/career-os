import assert from 'node:assert/strict';
import test from 'node:test';
import { memoryCoverage, mergeDuplicateClaims } from '../../lib/career-memory';
import { syntheticProfile } from '../../lib/fixture';

test('merges duplicate claims without expanding permissions or trust', () => {
  const first = syntheticProfile.claims[0];
  const profile = structuredClone(syntheticProfile);
  profile.claims.push({
    ...first,
    id: 'duplicate',
    statement:
      '  Reduced a fictional deployment workflow from 40 to 12 minutes! ',
    level: 'unsupported',
    evidenceIds: [],
    sensitivity: 'restricted',
    allowedUses: ['application'],
  });

  const merged = mergeDuplicateClaims(profile);

  assert.equal(merged.mergedCount, 1);
  assert.equal(merged.profile.claims.length, syntheticProfile.claims.length);
  assert.equal(merged.profile.claims[0].level, 'unsupported');
  assert.equal(merged.profile.claims[0].sensitivity, 'restricted');
  assert.deepEqual(merged.profile.claims[0].allowedUses, ['application']);
});

test('reports explainable category coverage instead of a synthetic score', () => {
  const coverage = memoryCoverage(syntheticProfile);

  assert.equal(coverage.presentCount, 1);
  assert.equal(coverage.totalCount, 5);
  assert.equal(
    coverage.items.find(({ kind }) => kind === 'result')?.present,
    true,
  );
  assert.equal(coverage.notPublishable, 0);
});
