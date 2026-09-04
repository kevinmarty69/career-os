import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dashboardActions,
  type DashboardItem,
} from '../../lib/dashboard-priority';

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
