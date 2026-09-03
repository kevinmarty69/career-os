import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  createRunInputSchema,
  persistedRunSchema,
  reviewIssueDecisionInputSchema,
  reviewIssueDecisionResultSchema,
} from '../../lib/run-contract';
import { syntheticProfile } from '../../lib/fixture';

const applicationId = randomUUID();

test('run creation accepts only durable application and profile revisions', () => {
  assert.equal(
    createRunInputSchema.safeParse({
      applicationId,
      applicationRevision: 1,
      profileRevision: 1,
    }).success,
    true,
  );
  assert.equal(
    createRunInputSchema.safeParse({
      applicationId: 'not-a-uuid',
      applicationRevision: 1,
      profileRevision: 1,
    }).success,
    false,
  );
  assert.equal(
    createRunInputSchema.safeParse({
      applicationId,
      applicationRevision: 1,
      profileRevision: 0,
    }).success,
    false,
  );
  assert.equal(
    createRunInputSchema.safeParse({
      applicationId,
      applicationRevision: 1,
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
      steps: [
        {
          stage: 'company-researcher',
          status: 'completed',
          attempt: 1,
        },
      ],
      reviews: [
        {
          reviewId: randomUUID(),
          reviewer: 'recruiter',
          passed: false,
          findings: ['State the role-specific operating outcome.'],
          issues: [
            {
              section: 'hero.thesis',
              message: 'State the role-specific operating outcome.',
              blocking: false,
            },
          ],
        },
      ],
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

test('review decisions are strict and corrections require a real run', () => {
  const input = {
    reviewId: randomUUID(),
    issueIndex: 0,
    decision: 'keep' as const,
  };
  assert.deepEqual(reviewIssueDecisionInputSchema.parse(input), input);
  assert.equal(
    reviewIssueDecisionInputSchema.safeParse({ ...input, force: true }).success,
    false,
  );
  assert.equal(
    reviewIssueDecisionResultSchema.safeParse({
      decisionId: randomUUID(),
      runId: randomUUID(),
      reviewId: input.reviewId,
      issueIndex: 0,
      decision: 'correct',
      publicationEligible: false,
    }).success,
    false,
  );
});
