import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeApplicationInsights } from '../../lib/application-insights';

test('groups by confirmed submission date at UTC boundaries, not dossier creation or silence', () => {
  const now = new Date('2026-09-21T00:00:00Z');
  const applications = [0, 6, 7, 13, 14, 27, 28].map((days) => ({
    applicationId: String(days),
    stage: 'applied' as const,
    submittedOn: new Date(now.getTime() - days * 86_400_000)
      .toISOString()
      .slice(0, 10),
  }));
  const insights = summarizeApplicationInsights(
    [
      ...applications,
      { applicationId: 'missing', stage: 'applied' },
      { applicationId: 'closed', stage: 'closed', submittedOn: null },
      { applicationId: 'future', stage: 'applied', submittedOn: '2026-09-22' },
      { applicationId: 'draft', stage: 'draft', submittedOn: '2026-09-01' },
    ],
    [
      { applicationId: '7', kind: 'response', occurredAt: now.toISOString() },
      { applicationId: '7', kind: 'response', occurredAt: now.toISOString() },
      {
        applicationId: '14',
        kind: 'response',
        occurredAt: '2026-09-22T00:00:00Z',
      },
    ],
    now,
  );
  assert.deepEqual(
    insights.ageCohorts.map((cohort) => [
      cohort.applications,
      cohort.responses,
      cohort.withoutResponse,
      cohort.responsePct,
    ]),
    [
      [2, 0, 2, 0],
      [2, 1, 1, 50],
      [2, 0, 2, 0],
      [1, 0, 1, 0],
      [3, 0, 3, 0],
    ],
  );
  assert.equal(insights.sentOrLater, 10);
  assert.equal(
    summarizeApplicationInsights([], [], now).ageCohorts[0]?.responsePct,
    null,
  );
  assert.deepEqual(
    summarizeApplicationInsights(
      applications,
      [],
      new Date('2026-09-20T20:00:00-04:00'),
    ).ageCohorts,
    summarizeApplicationInsights(applications, [], now).ageCohorts,
  );
  assert.ok(applications.every(({ stage }) => stage === 'applied'));
});

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
