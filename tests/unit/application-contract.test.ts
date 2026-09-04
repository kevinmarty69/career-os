import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  applicationSchema,
  applicationFieldsSchema,
  deleteApplicationInputSchema,
  updateApplicationInputSchema,
} from '../../lib/application-contract';
import { optionalHttpUrl } from '../../lib/http-url';

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
    applicationFieldsSchema.safeParse({
      ...application,
      logoUrl: 'data:image/svg+xml,unsafe',
    }).success,
    false,
  );
  assert.equal(
    applicationFieldsSchema.parse({ ...application, accent: '#ffffff' }).accent,
    '#21504b',
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

test('legacy URLs can be omitted without weakening the HTTP boundary', () => {
  assert.equal(optionalHttpUrl('mailto:jobs@example.test'), undefined);
  assert.equal(
    optionalHttpUrl('https://jobs.example.test/offer'),
    'https://jobs.example.test/offer',
  );
  assert.equal(
    applicationSchema.safeParse({
      ...application,
      applicationId: randomUUID(),
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).success,
    true,
  );
});

test('company research sources are explicit, canonical and unique', () => {
  assert.equal(
    applicationFieldsSchema.safeParse({
      ...application,
      companySources: [
        { url: 'https://example.test/about', origin: 'job-jsonld' },
        { url: 'https://example.test/careers', origin: 'api' },
      ],
    }).success,
    true,
  );
  assert.deepEqual(
    applicationFieldsSchema.parse({
      ...application,
      companySources: [
        { url: 'http://EXAMPLE.test/about', origin: 'job-jsonld' },
      ],
    }).companySources,
    [{ url: 'http://example.test/about', origin: 'job-jsonld' }],
  );
  for (const companySources of [
    [{ url: 'https://user:password@example.test/about', origin: 'api' }],
    [
      { url: 'https://example.test/about', origin: 'api' },
      { url: 'https://EXAMPLE.test/about', origin: 'job-jsonld' },
    ],
    Array.from({ length: 4 }, (_, index) => ({
      url: `https://example.test/${index}`,
      origin: 'api',
    })),
  ])
    assert.equal(
      applicationFieldsSchema.safeParse({
        ...application,
        companySources,
      }).success,
      false,
    );
});
