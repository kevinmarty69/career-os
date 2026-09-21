import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dashboardActions,
  nextTasks,
  type DashboardItem,
} from '../../lib/dashboard-priority';
import type { UpcomingTask } from '../../lib/application-task';

test('due tasks stay ordered by instant, completed tasks are omitted without mutating input', () => {
  const task = (
    id: string,
    dueAt: string,
    completedAt: string | null = null,
  ): UpcomingTask => ({
    taskId: id,
    applicationId: id,
    company: 'Example',
    role: 'Engineer',
    kind: 'follow_up',
    title: 'Follow up',
    dueAt,
    completedAt,
    revision: 1,
    createdAt: dueAt,
    updatedAt: dueAt,
  });
  const input = [
    task('future', '2026-10-01T00:00:00Z'),
    task('done', '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'),
    task('older', '2026-09-01T10:00:00+02:00'),
    task('later', '2026-09-01T09:00:00Z'),
  ];
  assert.deepEqual(
    nextTasks(input).map(({ taskId }) => taskId),
    ['older', 'later', 'future'],
  );
  assert.equal(input[0].taskId, 'future');
});

const base = {
  applicationId: '988c0a00-0000-4000-8000-000000000041',
  company: 'Signal Forge',
  role: 'Staff Platform Engineer',
  updatedAt: '2026-09-04T12:00:00.000Z',
};

test('puts unresolved human decisions before running and new applications', () => {
  const reviewId = '988c0a00-0000-4000-8000-000000000042';
  const items: DashboardItem[] = [
    {
      application: {
        ...base,
        applicationId: base.applicationId.replace('41', '43'),
      },
    },
    {
      application: {
        ...base,
        applicationId: base.applicationId.replace('41', '44'),
      },
      run: {
        runId: base.applicationId.replace('41', '45'),
        status: 'running',
        stage: 'research',
        publicationEligible: false,
        reviews: [],
        reviewDecisions: [],
      },
    },
    {
      application: base,
      run: {
        runId: base.applicationId.replace('41', '46'),
        status: 'awaiting_approval',
        stage: 'review',
        publicationEligible: false,
        reviews: [
          {
            reviewId,
            reviewer: 'factuality',
            passed: false,
            findings: [],
            issues: [
              {
                section: 'Opening',
                message: 'The figure exceeds the source.',
                blocking: true,
              },
            ],
          },
        ],
        reviewDecisions: [],
      },
    },
  ];

  const actions = dashboardActions(items);
  assert.deepEqual(
    actions.map(({ kind }) => kind),
    ['review', 'running', 'start'],
  );
  assert.equal(actions[0]?.pendingDecisions, 1);
});

test('does not treat an unavailable workflow as a new application', () => {
  assert.deepEqual(
    dashboardActions([{ application: base, unavailable: true }]),
    [],
  );
});

test('closed and already-sent dossiers do not get a prompt to start a new workflow', () => {
  assert.deepEqual(
    dashboardActions([
      { application: { ...base, stage: 'closed' } },
      { application: { ...base, stage: 'applied' } },
      { application: { ...base, stage: 'interview' } },
    ]),
    [],
  );
});
