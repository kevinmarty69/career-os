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
  fetchedUrl: 'https://jobs.example.test/opening',
  sourceKind: 'generic_html' as const,
  externalId: null,
  matchedBy: 'new' as const,
  fetchedAt: '2026-09-04T09:00:00.000Z',
  contentType: 'text/html' as const,
  bytes: 4_096,
  sha256: 'a'.repeat(64),
  trust: 'untrusted-data' as const,
};
const normalized = {
  location: null,
  remoteMode: 'unknown' as const,
  contractType: 'unknown' as const,
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  salaryPeriod: 'unknown' as const,
  publishedAt: null,
  externalId: null,
  sourceKind: 'generic_html' as const,
  lifecycleSignal: 'unknown' as const,
};
const observation = {
  observationId: '00000000-0000-4000-8000-000000000003',
  sourceRecordId: source.sourceRecordId,
  observedAt: source.fetchedAt,
  sha256: source.sha256,
  change: 'first_seen' as const,
  lifecycleSignal: 'unknown' as const,
  matchedBy: 'new' as const,
  normalized,
};

test('discovered jobs retain bounded source provenance', () => {
  const parsed = discoveredJobSchema.parse({
    opportunityId: '00000000-0000-4000-8000-000000000002',
    company: 'Example',
    role: 'Platform Engineer',
    description: 'Build dependable systems.',
    sourceUrl: source.finalUrl,
    location: null,
    remoteMode: 'unknown',
    contractType: 'unknown',
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: 'unknown',
    publishedAt: null,
    externalId: null,
    sourceKind: 'generic_html',
    lifecycle: 'open',
    fingerprint: null,
    revision: 1,
    sources: [source],
    observations: [observation],
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
    normalized,
    provenance: {
      requestedUrl: source.requestedUrl,
      finalUrl: source.finalUrl,
      fetchedUrl: source.fetchedUrl,
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
      normalized: { ...normalized, salaryPeriod: 'year' },
    }),
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
