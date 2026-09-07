import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyRunPoll,
  type ApplicationRunState,
} from '../../components/applications/use-application-run';
import { syntheticProfile } from '../../lib/fixture';
import type { PersistedRun } from '../../lib/run-contract';

const run: PersistedRun = {
  runId: '988c0a00-0000-4000-8000-000000000010',
  status: 'running',
  stage: 'research',
  revision: 0,
  usedTokens: 0,
  usedCostMicros: 0,
  profile: syntheticProfile,
  steps: [],
  reviews: [],
  reviewDecisions: [],
  publicationEligible: false,
  events: [],
};

test('a delayed poll updates its original state but cannot undo a mutation or navigation', () => {
  const requested: ApplicationRunState = {
    applicationId: 'application-a',
    profileRevision: 1,
    run,
  };
  const response = { ...run, status: 'paused' as const };
  assert.equal(applyRunPoll(requested, requested, response)?.run, response);
  const published = {
    ...requested,
    run: { ...run, status: 'completed' as const, stage: 'publication_ready' },
  };
  assert.equal(applyRunPoll(published, requested, response), published);
  const navigated = { ...requested, applicationId: 'application-b' };
  assert.equal(applyRunPoll(navigated, requested, response), navigated);
  assert.equal(applyRunPoll(undefined, requested, response), undefined);
});
