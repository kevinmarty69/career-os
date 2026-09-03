import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  applicationFieldsSchema,
  deleteApplicationInputSchema,
  updateApplicationInputSchema,
} from '../../lib/application-contract';

const application = {
  company: 'Northstar Labs',
  role: 'Senior Product Engineer',
  description: 'Ship dependable product workflows.',
  accent: '#21504b',
  stage: 'draft' as const,
};

test('application mutations are strict and bounded', () => {
  assert.deepEqual(applicationFieldsSchema.parse(application), application);
  assert.equal(
    applicationFieldsSchema.safeParse({
      ...application,
      tenantId: randomUUID(),
    }).success,
    false,
  );
  for (const url of [
    'not a URL',
    'javascript:alert(1)',
    'data:text/html,unsafe',
    'ftp://files.example.test/offer',
  ])
    assert.equal(
      applicationFieldsSchema.safeParse({ ...application, url }).success,
      false,
    );
  assert.equal(
    applicationFieldsSchema.safeParse({
      ...application,
      url: 'https://jobs.example.test/offer',
    }).success,
    true,
  );
  assert.equal(
    updateApplicationInputSchema.safeParse({
      ...application,
      description: 'x'.repeat(20_001),
      expectedRevision: 1,
    }).success,
    false,
  );
  assert.equal(
    deleteApplicationInputSchema.safeParse({ expectedRevision: 0 }).success,
    false,
  );
});
