import assert from 'node:assert/strict';
import test from 'node:test';
import { syntheticProfile } from '../../lib/fixture';
import {
  blockConflictedClaims,
  memoryConflicts,
  resolveMemoryConflict,
} from '../../lib/memory-conflicts';

test('numeric conflicts block both versions until a sourced human choice; no source or version is deleted', () => {
  const base = syntheticProfile.claims[0];
  const profile = {
    ...syntheticProfile,
    claims: [
      { ...base, id: 'a', statement: 'I led a team of 6 engineers.' },
      { ...base, id: 'b', statement: 'I led a team of 9 engineers.' },
    ],
  };
  assert.equal(memoryConflicts(profile).length, 1);
  assert.deepEqual(
    blockConflictedClaims(profile).claims.map((claim) => claim.level),
    ['unsupported', 'unsupported'],
  );
  const resolved = resolveMemoryConflict(
    profile,
    'a',
    { source: 'decision-source', evidence: 'decision-evidence' },
    '2026-09-09T12:00:00.000Z',
  );
  assert.equal(memoryConflicts(resolved).length, 0);
  assert.deepEqual(
    resolved.claims.map((claim) => claim.level),
    ['declared', 'unsupported'],
  );
  assert.equal(resolved.sources.length, profile.sources.length + 1);
  assert.deepEqual(resolved.sources.at(-1)?.allowedUses, ['interview']);
  const contextual = resolveMemoryConflict(
    profile,
    'a',
    { source: 'contexts', evidence: 'contexts-evidence' },
    '2026-09-09T12:00:00.000Z',
    { a: 'Direct reports in 2021', b: 'Wider delivery team in 2023' },
  );
  assert.equal(memoryConflicts(contextual).length, 0);
  assert.equal(contextual.claims.length, 4);
  assert.deepEqual(
    contextual.claims.map((claim) => claim.level),
    ['unsupported', 'unsupported', 'declared', 'declared'],
  );
  assert.match(contextual.claims[2].statement, /Direct reports in 2021$/);
  assert.deepEqual(
    contextual.claims[2].allowedUses,
    base.allowedUses.filter((use) =>
      syntheticProfile.sources.every((source) =>
        source.allowedUses.includes(use),
      ),
    ),
  );
  const restricted = resolveMemoryConflict(
    {
      ...profile,
      sources: profile.sources.map((source) => ({
        ...source,
        sensitivity: 'restricted' as const,
      })),
    },
    'a',
    { source: 'restricted', evidence: 'restricted-evidence' },
    '2026-09-09T12:00:00.000Z',
    { a: 'Direct reports in 2021', b: 'Wider delivery team in 2023' },
  );
  assert.equal(restricted.claims[2].sensitivity, 'restricted');
  assert.throws(() =>
    resolveMemoryConflict(
      profile,
      'a',
      { source: 'same', evidence: 'same-evidence' },
      '2026-09-09T12:00:00.000Z',
      { a: 'Same context', b: 'Same context' },
    ),
  );
  assert.equal(
    memoryConflicts({
      ...profile,
      claims: [
        profile.claims[0],
        {
          ...profile.claims[0],
          id: 'case-only',
          statement: profile.claims[0].statement.toUpperCase(),
        },
      ],
    }).length,
    0,
  );
  assert.throws(() =>
    resolveMemoryConflict(
      profile,
      'absent',
      { source: 's', evidence: 'e' },
      '2026-09-09T12:00:00.000Z',
    ),
  );
  assert.equal(
    memoryConflicts({
      ...profile,
      claims: [
        profile.claims[0],
        {
          ...profile.claims[1],
          statement: 'I built 9 services in a different company.',
        },
      ],
    }).length,
    0,
  );
});
