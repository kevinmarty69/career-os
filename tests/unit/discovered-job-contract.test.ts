import assert from 'node:assert/strict';
import test from 'node:test';
import {
  discoveredJobPersistenceInputSchema,
  discoveredJobSchema,
  opportunityImportInputSchema,
} from '../../lib/discovered-job-contract';

const source = {
  sourceRecordId: '00000000-0000-4000-8000-000000000001',
  requestedUrl: 'https://jobs.example.test/opening?team=platform',
  finalUrl: 'https://jobs.example.test/opening',
  fetchedAt: '2026-09-04T09:00:00.000Z',
  contentType: 'text/html' as const,
  bytes: 4_096,
  sha256: 'a'.repeat(64),
  trust: 'untrusted-data' as const,
};

test('discovered jobs retain bounded source provenance', () => {
  const parsed = discoveredJobSchema.parse({
    opportunityId: '00000000-0000-4000-8000-000000000002',
    company: 'Example',
    role: 'Platform Engineer',
    description: 'Build dependable systems.',
    sourceUrl: source.finalUrl,
    revision: 1,
    sources: [source],
    firstSeenAt: source.fetchedAt,
    lastSeenAt: source.fetchedAt,
  });
  assert.equal(parsed.sources[0].trust, 'untrusted-data');
  assert.equal(parsed.sources[0].sha256, 'a'.repeat(64));
  assert.throws(() =>
    discoveredJobSchema.parse({
      ...parsed,
      sources: [{ ...source, trust: 'verified' }],
    }),
  );
});

test('persistence requires extraction and fetch provenance to share a final URL', () => {
  const valid = {
    extraction: {
      company: 'Example',
      role: 'Platform Engineer',
      sourceUrl: source.finalUrl,
    },
    provenance: {
      requestedUrl: source.requestedUrl,
      finalUrl: source.finalUrl,
      fetchedAt: source.fetchedAt,
      contentType: source.contentType,
      bytes: source.bytes,
      sha256: source.sha256,
      trust: source.trust,
    },
  };
  assert.equal(
    discoveredJobPersistenceInputSchema.parse(valid).extraction.role,
    'Platform Engineer',
  );
  assert.throws(() =>
    discoveredJobPersistenceInputSchema.parse({
      ...valid,
      extraction: {
        ...valid.extraction,
        sourceUrl: 'https://other.example.test/job',
      },
    }),
  );
});

test('URL import input is strict and bounded', () => {
  assert.deepEqual(
    opportunityImportInputSchema.parse({ url: source.requestedUrl }),
    {
      url: source.requestedUrl,
    },
  );
  assert.throws(() =>
    opportunityImportInputSchema.parse({
      url: source.requestedUrl,
      createApplication: true,
    }),
  );
});
