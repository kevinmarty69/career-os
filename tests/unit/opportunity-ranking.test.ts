import assert from 'node:assert/strict';
import test from 'node:test';
import { rankOpportunitiesByHumanFeedback } from '../../lib/opportunity-ranking';

const profileId = '10000000-0000-4000-8000-000000000001';

test('ranks future opportunities from related human decisions only', () => {
  const priorGood = opportunity(
    'good',
    'Example',
    'Product Engineer',
    'Paris',
    'hybrid',
  );
  const priorBad = opportunity(
    'bad',
    'Other',
    'Backend Engineer',
    'Remote',
    'remote',
  );
  const candidates = [
    opportunity('unrelated', 'Third', 'Designer', 'London'),
    opportunity('lowered', 'Fourth', 'Backend Engineer', 'Remote', 'remote'),
    opportunity('raised', 'Example', 'Product Engineer', 'Berlin'),
  ];
  const result = rankOpportunitiesByHumanFeedback(
    candidates,
    [...candidates, priorGood, priorBad],
    [
      decision(priorGood.opportunityId, 'priority', 'strong_fit'),
      decision(priorBad.opportunityId, 'ignore', 'location'),
    ],
    profileId,
  );

  assert.deepEqual(
    result.map(({ opportunity, direction, exampleCount, scopes }) => ({
      id: opportunity.opportunityId,
      direction,
      exampleCount,
      scopes,
    })),
    [
      { id: 'raised', direction: 'up', exampleCount: 1, scopes: ['role'] },
      {
        id: 'lowered',
        direction: 'down',
        exampleCount: 1,
        scopes: ['location'],
      },
      {
        id: 'unrelated',
        direction: null,
        exampleCount: 0,
        scopes: [],
      },
    ],
  );
});

test('does not reuse hard-constraint or cross-profile decisions', () => {
  const prior = opportunity('prior', 'Example', 'Product Engineer', 'Paris');
  const candidate = opportunity(
    'candidate',
    'Example',
    'Product Engineer',
    'Paris',
  );
  const result = rankOpportunitiesByHumanFeedback(
    [candidate],
    [candidate, prior],
    [
      decision(prior.opportunityId, 'priority', 'hard_constraint'),
      {
        ...decision(prior.opportunityId, 'priority', 'strong_fit'),
        searchProfileId: crypto.randomUUID(),
      },
    ],
    profileId,
  );

  assert.equal(result[0].direction, null);
  assert.equal(result[0].exampleCount, 0);
});

function opportunity(
  opportunityId: string,
  company: string,
  role: string,
  location: string,
  remoteMode: 'onsite' | 'hybrid' | 'remote' = 'onsite',
) {
  return { opportunityId, company, role, location, remoteMode };
}

function decision(
  opportunityId: string,
  qualification: 'priority' | 'interesting' | 'exploratory' | 'ignore',
  reason:
    | 'strong_fit'
    | 'career_direction'
    | 'hard_constraint'
    | 'weak_evidence'
    | 'compensation'
    | 'location'
    | 'company'
    | 'duplicate'
    | 'closed'
    | 'other',
) {
  return { opportunityId, searchProfileId: profileId, qualification, reason };
}
