import assert from 'node:assert/strict';
import test from 'node:test';
import {
  approveRun,
  configuredAgentProvider,
  FakeAgentProvider,
  latestPageSpec,
  resumeRun,
  runAgentTeam,
  serializeRun,
} from '../../lib/agent-runtime';
import { syntheticProfile } from '../../lib/fixture';

const input = {
  tenantId: 'tenant-a',
  runId: 'run-a',
  profile: syntheticProfile,
  opportunity: {
    company: 'Northstar Labs',
    role: 'Senior Product Engineer',
    description: 'Ship dependable product workflows.',
    accent: '#21504b',
  },
};

test('the fake team revises, reviews, pauses, resumes and keeps provenance', async () => {
  const state = await runAgentTeam(input);
  assert.equal(state.status, 'awaiting_approval');
  assert.equal(state.reviews.length, 3);
  assert.equal(
    state.reviews.every((review) => review.passed),
    true,
  );
  assert.equal(
    state.artifacts.filter((item) => item.kind === 'page_spec').length,
    2,
  );
  assert.match(latestPageSpec(state)!.hero.thesis, /Revision 2/);
  assert.equal(state.usage.reservedTokens, 0);
  assert.equal(
    state.events.every(
      (event) =>
        event.tenantId === input.tenantId && event.runId === input.runId,
    ),
    true,
  );

  const completed = approveRun(resumeRun(serializeRun(state)));
  assert.equal(completed.status, 'completed');
  assert.equal(completed.approved, true);
});

test('invalid output and blocking factuality fail closed', async () => {
  const invalid = await runAgentTeam({
    ...input,
    provider: new FakeAgentProvider({ invalidRole: 'page-composer' }),
  });
  assert.equal(invalid.status, 'failed');

  const blocked = await runAgentTeam({
    ...input,
    provider: new FakeAgentProvider({
      blockFactCheck: true,
      requireRevision: false,
    }),
  });
  assert.equal(blocked.status, 'blocked');
  assert.throws(() => approveRun(blocked), /not eligible/);
});

test('a correction constraint is applied before real reviews', async () => {
  const feedback = 'State the role-specific operating outcome.';
  const corrected = await runAgentTeam({
    ...input,
    runId: 'corrected-run',
    correction: {
      section: 'hero.thesis',
      intent: 'foreground_role_specific_operating_outcome',
      feedback,
    },
    provider: new FakeAgentProvider(),
  });
  assert.equal(corrected.status, 'awaiting_approval');
  assert.match(
    latestPageSpec(corrected)!.hero.thesis,
    /role-specific thesis foregrounds the operating outcome/i,
  );
  assert.doesNotMatch(latestPageSpec(corrected)!.hero.thesis, /State the/);
  assert.equal(corrected.reviews.length, 3);
  assert.ok(corrected.reviews.every((review) => review.passed));
});

test('budget and cancellation stop before the next provider call', async () => {
  const exhausted = await runAgentTeam({ ...input, tokenBudget: 59 });
  assert.equal(exhausted.status, 'budget_exhausted');
  assert.equal(exhausted.artifacts.length, 0);

  const controller = new AbortController();
  controller.abort();
  const cancelled = await runAgentTeam({ ...input, signal: controller.signal });
  assert.equal(cancelled.status, 'cancelled');
});

test('network providers require explicit activation and pricing', () => {
  assert.throws(
    () =>
      configuredAgentProvider({
        CAREER_OS_AGENT_PROVIDER: 'openai-compatible',
      }),
    /disabled by default/,
  );
  assert.throws(
    () =>
      configuredAgentProvider({
        CAREER_OS_AGENT_PROVIDER: 'openai-compatible',
        CAREER_OS_ALLOW_NETWORK_PROVIDER: 'true',
      }),
    /explicit pricing/,
  );
});
