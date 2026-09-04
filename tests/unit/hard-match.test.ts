import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateHardMatch, type HardMatchJob } from '../../lib/hard-match';
import type { SearchProfile } from '../../lib/search-profile';

const job: HardMatchJob = {
  opportunityId: '10000000-0000-4000-8000-000000000001',
  company: 'Acme',
  role: 'Product Engineer',
  location: 'Paris',
  remoteMode: 'hybrid',
  contractType: 'full_time',
  salaryMin: 80_000,
  salaryMax: 100_000,
  salaryCurrency: 'EUR',
  salaryPeriod: 'year',
  lifecycle: 'open',
  revision: 3,
};

const profile: SearchProfile = {
  searchProfileId: '20000000-0000-4000-8000-000000000001',
  name: 'Main search',
  hardConstraints: {
    roles: ['Product Engineer'],
    seniorities: ['Senior'],
    locations: ['Paris'],
    remoteModes: ['hybrid'],
    timezones: ['Europe/Paris'],
    languages: ['English'],
    contractTypes: ['permanent'],
    minimumSalary: { amount: 75_000, currency: 'EUR' },
    excludedCompanies: ['Blocked Co'],
    excludedNetworks: ['Sensitive network'],
  },
  softPreferences: {
    stacks: [],
    sectors: [],
    productTypes: [],
    companySizes: [],
    cultures: [],
  },
  alertThreshold: null,
  active: true,
  revision: 2,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-02T10:00:00.000Z',
};

test('unknown hard criteria never block priority and every criterion is explained', () => {
  const result = evaluateHardMatch(job, profile);
  assert.equal(result.decision, 'priority');
  assert.equal(result.eligibleForPriority, true);
  assert.deepEqual(result.blockedCriteria, []);
  assert.equal(result.criteria.length, 11);
  for (const name of ['seniority', 'timezone', 'language', 'contractType']) {
    const item = result.criteria.find(
      (candidate) => candidate.criterion === name,
    );
    assert.equal(item?.state, 'unknown');
    assert.equal(item?.blocks, false);
    assert.ok(item?.references.length);
  }
});

test('every known hard-constraint violation makes the job ineligible', () => {
  const result = evaluateHardMatch(
    { ...job, company: 'Blocked Co', remoteMode: 'onsite' },
    profile,
  );
  assert.equal(result.decision, 'ineligible');
  assert.equal(result.eligibleForPriority, false);
  assert.deepEqual(result.blockedCriteria.sort(), ['company', 'remoteMode']);
  assert.equal(
    result.criteria.every(
      (criterion) => criterion.blocks === (criterion.state === 'blocked'),
    ),
    true,
  );
});

test('salary is comparable only for a known annual period', () => {
  const unknownPeriod = evaluateHardMatch(
    { ...job, salaryMax: 70_000, salaryPeriod: 'unknown' },
    profile,
  );
  assert.equal(criterion(unknownPeriod, 'salary').state, 'unknown');
  assert.equal(unknownPeriod.decision, 'priority');

  const below = evaluateHardMatch(
    { ...job, salaryMin: 60_000, salaryMax: 70_000 },
    profile,
  );
  assert.equal(criterion(below, 'salary').state, 'blocked');
  assert.equal(below.decision, 'ineligible');

  const crossing = evaluateHardMatch(
    { ...job, salaryMin: 70_000, salaryMax: 80_000 },
    profile,
  );
  assert.equal(criterion(crossing, 'salary').state, 'unknown');
  assert.equal(crossing.decision, 'priority');

  const above = evaluateHardMatch(
    { ...job, salaryMin: 80_000, salaryMax: 90_000 },
    profile,
  );
  assert.equal(criterion(above, 'salary').state, 'compatible');
});

test('an explicit closed lifecycle blocks priority independently of profile data', () => {
  const result = evaluateHardMatch({ ...job, lifecycle: 'closed' }, profile);
  assert.equal(criterion(result, 'availability').state, 'blocked');
  assert.deepEqual(result.blockedCriteria, ['availability']);
  assert.equal(result.decision, 'ineligible');
});

test('the same versioned inputs produce exactly the same explanation', () => {
  assert.deepEqual(
    evaluateHardMatch(job, profile),
    evaluateHardMatch(structuredClone(job), structuredClone(profile)),
  );
});

function criterion(
  result: ReturnType<typeof evaluateHardMatch>,
  name: (typeof result.criteria)[number]['criterion'],
) {
  const found = result.criteria.find((item) => item.criterion === name);
  assert.ok(found);
  return found;
}
