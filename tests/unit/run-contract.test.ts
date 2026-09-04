import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  instanceStatusSchema,
  createRunInputSchema,
  persistedRunSchema,
  reviewIssueDecisionInputSchema,
  reviewIssueDecisionResultSchema,
  reviewStartInputSchema,
  strategyApprovalInputSchema,
  strategyStartInputSchema,
  workerServices,
} from '../../lib/run-contract';
import { syntheticProfile } from '../../lib/fixture';
import { assertOpenSourceDeploymentMode } from '../../next.config';

const applicationId = randomUUID();

test('the public repository rejects managed deployment mode', () => {
  assert.doesNotThrow(() => assertOpenSourceDeploymentMode('self-hosted'));
  assert.throws(
    () => assertOpenSourceDeploymentMode('managed'),
    /separate cloud control plane/,
  );
});

test('instance status requires one coherent entry per worker', () => {
  const services = workerServices.map((service) => ({
    service,
    status: 'fresh' as const,
  }));
  assert.equal(
    instanceStatusSchema.safeParse({
      mode: 'self-hosted',
      services,
    }).success,
    true,
  );
  assert.equal(
    instanceStatusSchema.safeParse({
      mode: 'self-hosted',
      services: [...services.slice(0, -1), services[0]],
    }).success,
    false,
  );
});

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

test('strategy start is pinned to one exact evidence artifact', () => {
  const input = {
    evidenceArtifactId: randomUUID(),
    evidenceArtifactHash: 'a'.repeat(64),
  };
  assert.deepEqual(strategyStartInputSchema.parse(input), input);
  assert.equal(
    strategyStartInputSchema.safeParse({ ...input, evidenceArtifactHash: '' })
      .success,
    false,
  );
  assert.equal(
    strategyStartInputSchema.safeParse({ ...input, force: true }).success,
    false,
  );
});

test('strategy approval is pinned to one exact strategy artifact', () => {
  const input = {
    strategyArtifactId: randomUUID(),
    strategyArtifactHash: 'b'.repeat(64),
  };
  assert.deepEqual(strategyApprovalInputSchema.parse(input), input);
  assert.equal(
    strategyApprovalInputSchema.safeParse({ ...input, approveLatest: true })
      .success,
    false,
  );
});

test('review start accepts no client-controlled lineage', () => {
  assert.deepEqual(reviewStartInputSchema.parse({}), {});
  assert.equal(
    reviewStartInputSchema.safeParse({ pageSpecId: randomUUID() }).success,
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
      workerAvailability: {
        state: 'waiting',
        service: 'company-researcher',
      },
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
      reviewDecisions: [],
      publicationEligible: false,
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
  assert.equal(
    persistedRunSchema.safeParse({
      runId: randomUUID(),
      status: 'running',
      stage: 'research',
      revision: 0,
      usedTokens: 0,
      usedCostMicros: 0,
      profile: syntheticProfile,
      steps: [],
      workerAvailability: {
        state: 'offline',
        service: 'company-researcher',
      },
      reviews: [],
      reviewDecisions: [],
      publicationEligible: false,
      events: [],
    }).success,
    false,
  );
});

test('a persisted PageSpec requires its exact durable lineage', () => {
  const base = {
    runId: randomUUID(),
    status: 'paused',
    stage: 'page_spec_review',
    revision: 0,
    usedTokens: 0,
    usedCostMicros: 0,
    profile: syntheticProfile,
    steps: [],
    reviews: [],
    reviewDecisions: [],
    publicationEligible: false,
    events: [],
    spec: {
      version: 1,
      company: {
        name: 'Durable Labs',
        role: 'Product Engineer',
        accent: '#5b45e8',
      },
      hero: {
        eyebrow: 'Private application',
        title: 'Kévin Marty × Durable Labs',
        thesis: syntheticProfile.claims[0].statement,
      },
      blocks: [
        {
          type: 'fit',
          title: 'Relevant experience',
          claimIds: [syntheticProfile.claims[0].id],
        },
      ],
    },
  };
  assert.equal(persistedRunSchema.safeParse(base).success, false);
  assert.equal(
    persistedRunSchema.safeParse({
      ...base,
      pageSpecId: randomUUID(),
      pageSpecHash: 'd'.repeat(64),
      pageSpecArtifactId: randomUUID(),
      pageSpecArtifactHash: 'e'.repeat(64),
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
