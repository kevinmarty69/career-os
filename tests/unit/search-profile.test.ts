import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptySearchProfile,
  evaluateSearchCriterion,
  searchProfileFieldsSchema,
  updateSearchProfileInputSchema,
} from '../../lib/search-profile';

const configured = {
  ...emptySearchProfile.hardConstraints,
  roles: ['Product Engineer'],
  remoteModes: ['remote' as const],
  minimumSalary: { amount: 80_000, currency: 'EUR' as const },
  excludedCompanies: ['Example Corp'],
};

test('hard criteria block only a known mismatch', () => {
  assert.deepEqual(evaluateSearchCriterion(configured, 'role', ''), {
    state: 'unknown',
    blocks: false,
    explanation: 'Information absente ou critère non défini : à vérifier.',
  });
  assert.equal(
    evaluateSearchCriterion(configured, 'role', 'product engineer').state,
    'compatible',
  );
  assert.equal(
    evaluateSearchCriterion(configured, 'role', 'Sales Engineer').state,
    'blocked',
  );
});

test('salary remains unknown across currencies and blocks below a known minimum', () => {
  assert.equal(
    evaluateSearchCriterion(configured, 'salary', '90000 USD').state,
    'unknown',
  );
  assert.equal(
    evaluateSearchCriterion(configured, 'salary', '75 000 EUR').state,
    'blocked',
  );
  assert.equal(
    evaluateSearchCriterion(configured, 'salary', '80 000 EUR').state,
    'compatible',
  );
});

test('exclusions are deterministic and accent-insensitive', () => {
  assert.equal(
    evaluateSearchCriterion(
      { ...configured, excludedCompanies: ['Société Exemple'] },
      'company',
      'societe exemple',
    ).state,
    'blocked',
  );
  assert.equal(
    evaluateSearchCriterion(configured, 'company', 'Another Corp').state,
    'compatible',
  );
});

test('search profile mutations are strict and bounded', () => {
  const input = {
    ...emptySearchProfile,
    name: 'France · Product Engineering',
  };
  assert.equal(searchProfileFieldsSchema.safeParse(input).success, true);
  assert.equal(
    searchProfileFieldsSchema.safeParse({ ...input, alertThreshold: 100 })
      .success,
    true,
  );
  assert.equal(
    searchProfileFieldsSchema.safeParse({ ...input, alertThreshold: 101 })
      .success,
    false,
  );
  assert.equal(
    searchProfileFieldsSchema.safeParse({
      ...input,
      tenantId: crypto.randomUUID(),
    }).success,
    false,
  );
  assert.equal(
    searchProfileFieldsSchema.safeParse({
      ...input,
      hardConstraints: {
        ...input.hardConstraints,
        roles: Array.from({ length: 31 }, (_, index) => `Role ${index}`),
      },
    }).success,
    false,
  );
  assert.equal(
    updateSearchProfileInputSchema.safeParse({
      ...input,
      expectedRevision: 0,
    }).success,
    false,
  );
});
