import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeApplicationInsights } from '../../lib/application-insights';

test('reports descriptive response coverage and eight weekly buckets', () => {
  const insights = summarizeApplicationInsights(
    [
      { applicationId: 'draft', stage: 'draft' },
      { applicationId: 'sent', stage: 'applied' },
      { applicationId: 'interview', stage: 'interview' },
    ],
    [
      {
        applicationId: 'sent',
        kind: 'response',
        occurredAt: '2026-09-03T12:00:00.000Z',
      },
      {
        applicationId: 'interview',
        kind: 'interview',
        occurredAt: '2026-09-04T12:00:00.000Z',
      },
      {
        applicationId: 'draft',
        kind: 'response',
        occurredAt: '2026-09-04T12:00:00.000Z',
      },
    ],
    new Date('2026-09-04T12:00:00.000Z'),
  );

  assert.equal(insights.sentOrLater, 2);
  assert.equal(insights.applicationsWithResponse, 1);
  assert.equal(insights.responseCoveragePct, 50);
  assert.equal(insights.interviews, 1);
  assert.equal(insights.weekly.length, 8);
  assert.equal(insights.weekly.at(-1)?.responses, 2);
});
