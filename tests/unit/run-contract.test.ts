import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  createRunInputSchema,
  persistedRunSchema,
} from '../../lib/run-contract';
import { syntheticProfile } from '../../lib/fixture';

const opportunity = {
  company: 'Northstar Labs',
  role: 'Senior Product Engineer',
  description: 'Ship dependable product workflows.',
  accent: '#21504b',
};

test('run creation accepts only a bounded opportunity and saved revision', () => {
  assert.equal(
    createRunInputSchema.safeParse({ opportunity, profileRevision: 1 }).success,
    true,
  );
  assert.equal(
    createRunInputSchema.safeParse({
      opportunity: { ...opportunity, description: 'x'.repeat(20_001) },
      profileRevision: 1,
    }).success,
    false,
  );
  assert.equal(
    createRunInputSchema.safeParse({
      opportunity,
      profileRevision: 0,
    }).success,
    false,
  );
  assert.equal(
    createRunInputSchema.safeParse({
      opportunity,
      profileRevision: 1,
      provider: 'openai-compatible',
    }).success,
    false,
  );
});

test('persisted run contract exposes measured zero cost and durable UUIDs', () => {
  assert.equal(
    persistedRunSchema.safeParse({
      runId: randomUUID(),
      status: 'awaiting_approval',
      stage: 'human_approval',
      revision: 1,
      usedTokens: 42,
      usedCostMicros: 0,
      profile: syntheticProfile,
      reviews: [],
      events: [
        {
          actor: 'system',
          type: 'paused',
          summary: 'Human approval required.',
          artifactId: randomUUID(),
          costMicros: 0,
        },
      ],
    }).success,
    true,
  );
});
