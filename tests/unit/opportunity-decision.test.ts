import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateOpportunityDecisionFeedback,
  opportunityDecisionInputSchema,
  opportunityDecisionListResponseSchema,
  type OpportunityDecision,
} from '../../lib/opportunity-decision';

const profileA = '10000000-0000-4000-8000-000000000001';
const profileB = '10000000-0000-4000-8000-000000000002';

test('opportunity decisions are strict, bounded and revisioned', () => {
  const valid = {
    searchProfileId: profileA,
    disposition: 'ignored',
    qualification: 'exploratory',
    reason: 'location',
    note: 'The commute is outside the current search boundary.',
    expectedRevision: 2,
  };
  assert.deepEqual(opportunityDecisionInputSchema.parse(valid), valid);
  assert.equal(
    opportunityDecisionInputSchema.safeParse({ ...valid, extra: true }).success,
    false,
  );
  assert.equal(
    opportunityDecisionInputSchema.safeParse({
      ...valid,
      note: 'x'.repeat(501),
    }).success,
    false,
  );
  assert.equal(
    opportunityDecisionInputSchema.safeParse({
      ...valid,
      expectedRevision: -1,
    }).success,
    false,
  );
});

test('feedback aggregates one current outcome per opportunity deterministically', () => {
  const decisions = [
    decision(profileB, 'ignored', 'ignore', 'location'),
    decision(profileA, 'saved', 'interesting', 'weak_evidence'),
    decision(null, 'archived', 'exploratory', 'other'),
    decision(profileA, 'ignored', 'ignore', 'location'),
    decision(profileA, 'ignored', 'ignore', 'location'),
  ];
  assert.deepEqual(aggregateOpportunityDecisionFeedback(decisions), [
    {
      searchProfileId: profileA,
      outcomes: [
        {
          disposition: 'ignored',
          qualification: 'ignore',
          reason: 'location',
          count: 2,
        },
        {
          disposition: 'saved',
          qualification: 'interesting',
          reason: 'weak_evidence',
          count: 1,
        },
      ],
    },
    {
      searchProfileId: profileB,
      outcomes: [
        {
          disposition: 'ignored',
          qualification: 'ignore',
          reason: 'location',
          count: 1,
        },
      ],
    },
  ]);
});

test('three revisions of one opportunity contribute only its current outcome', () => {
  const current = decision(profileA, 'saved', 'priority', 'strong_fit');
  current.history = [
    history('ignored', 'ignore', 'location', 1),
    history('archived', 'exploratory', 'career_direction', 2),
    history('saved', 'priority', 'strong_fit', 3),
  ];
  assert.deepEqual(aggregateOpportunityDecisionFeedback([current]), [
    {
      searchProfileId: profileA,
      outcomes: [
        {
          disposition: 'saved',
          qualification: 'priority',
          reason: 'strong_fit',
          count: 1,
        },
      ],
    },
  ]);
});

test('list responses reject model scores or hidden ranking fields', () => {
  assert.equal(
    opportunityDecisionListResponseSchema.safeParse({
      decisions: [],
      feedback: [
        {
          searchProfileId: profileA,
          outcomes: [
            {
              disposition: 'ignored',
              qualification: 'ignore',
              reason: 'location',
              count: 2,
              score: 0.91,
            },
          ],
        },
      ],
    }).success,
    false,
  );
});

function decision(
  searchProfileId: string | null,
  disposition: OpportunityDecision['disposition'],
  qualification: OpportunityDecision['qualification'],
  reason: OpportunityDecision['reason'],
): OpportunityDecision {
  return {
    decisionId: crypto.randomUUID(),
    opportunityId: crypto.randomUUID(),
    searchProfileId,
    disposition,
    qualification,
    reason,
    note: null,
    revision: 1,
    actor: 'human',
    actorId: crypto.randomUUID(),
    createdAt: '2026-09-04T12:00:00.000Z',
    updatedAt: '2026-09-04T12:00:00.000Z',
    history: [],
  };
}

function history(
  disposition: OpportunityDecision['disposition'],
  qualification: OpportunityDecision['qualification'],
  reason: OpportunityDecision['reason'],
  revision: number,
): OpportunityDecision['history'][number] {
  return {
    eventId: crypto.randomUUID(),
    searchProfileId: profileA,
    disposition,
    qualification,
    reason,
    note: null,
    revision,
    actor: 'human',
    actorId: crypto.randomUUID(),
    createdAt: `2026-09-04T12:0${revision}:00.000Z`,
  };
}
