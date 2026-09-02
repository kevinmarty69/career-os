import assert from 'node:assert/strict';
import test from 'node:test';
import { executeBakeoff } from './run.ts';

test('runs the same offline Career OS contract against every candidate', async () => {
  const result = await executeBakeoff();
  assert.equal(result.networkBlocked, true);
  assert.equal(result.unexpectedNetworkAttempts, 0);
  assert.equal(result.paidCalls, 0);
  assert.deepEqual(
    result.candidates.map((item) => item.package),
    ['career-os internal', '@openai/agents', '@mastra/core'],
  );
  for (const candidate of result.candidates) {
    assert.equal(candidate.checks.sameFixture.passed, true);
    assert.equal(candidate.checks.tools.passed, true);
    assert.equal(candidate.checks.parallelReviews.passed, true);
    assert.equal(candidate.checks.boundedRevision.passed, true);
    assert.equal(candidate.checks.cancellation.passed, true);
    assert.equal(candidate.checks.invalidStructuredOutput.passed, true);
  }
  assert.equal(
    result.candidates.find((item) => item.package === '@mastra/core')?.checks
      .nativePauseResume.passed,
    false,
  );
});
