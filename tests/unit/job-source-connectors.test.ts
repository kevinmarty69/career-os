import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  genericNormalizedFields,
  JobConnectorError,
  parseJobConnector,
  resolveJobConnector,
} from '../../lib/job-source-connectors';

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

test('recognizes only supported public Greenhouse and Ashby job URLs', () => {
  assert.deepEqual(
    resolveJobConnector(
      'https://job-boards.greenhouse.io/greenhouselabs/jobs/44444?gh_src=test#apply',
    ),
    {
      sourceKind: 'greenhouse',
      pageUrl:
        'https://job-boards.greenhouse.io/greenhouselabs/jobs/44444?gh_src=test',
      fetchUrl:
        'https://boards-api.greenhouse.io/v1/boards/greenhouselabs/jobs/44444?pay_transparency=true',
      externalId: 'greenhouselabs:44444',
      board: 'greenhouselabs',
      posting: '44444',
    },
  );
  assert.equal(
    resolveJobConnector(
      'https://jobs.ashbyhq.com/nimbus/123e4567-e89b-12d3-a456-426614174000',
    )?.fetchUrl,
    'https://api.ashbyhq.com/posting-api/job-board/nimbus?includeCompensation=true',
  );
  assert.equal(resolveJobConnector('https://example.com/jobs/44444'), null);
});

test('normalizes the official Greenhouse job fixture without guessing absent fields', () => {
  const target = resolveJobConnector(
    'https://job-boards.greenhouse.io/greenhouselabs/jobs/44444',
  );
  assert.ok(target);
  const result = parseJobConnector(target, fixture('greenhouse-job.json'));
  assert.equal(result.extraction.company, 'Greenhouse Labs');
  assert.equal(result.extraction.role, 'Product Engineer');
  assert.match(result.extraction.description ?? '', /reliable tools/);
  assert.deepEqual(result.normalized, {
    location: 'Paris, France',
    remoteMode: 'unknown',
    contractType: 'unknown',
    salaryMin: 70000,
    salaryMax: 90000,
    salaryCurrency: 'EUR',
    publishedAt: '2026-08-20T10:00:00Z',
    externalId: 'greenhouselabs:44444',
    sourceKind: 'greenhouse',
    lifecycleSignal: 'open',
  });
});

test('selects and normalizes exactly one Ashby job from the public board fixture', () => {
  const target = resolveJobConnector(
    'https://jobs.ashbyhq.com/nimbus/123e4567-e89b-12d3-a456-426614174000',
  );
  assert.ok(target);
  const result = parseJobConnector(target, fixture('ashby-job-board.json'));
  assert.equal(result.extraction.role, 'Founding Product Engineer');
  assert.deepEqual(result.normalized, {
    location: 'Europe',
    remoteMode: 'remote',
    contractType: 'full_time',
    salaryMin: 80000,
    salaryMax: 110000,
    salaryCurrency: 'EUR',
    publishedAt: '2026-08-28T14:00:00.000+00:00',
    externalId: 'nimbus:123e4567-e89b-12d3-a456-426614174000',
    sourceKind: 'ashby',
    lifecycleSignal: 'open',
  });
});

test('fails closed on an ambiguous Ashby match and keeps generic absences explicit', () => {
  const target = resolveJobConnector(
    'https://jobs.ashbyhq.com/nimbus/missing-posting',
  );
  assert.ok(target);
  assert.throws(
    () => parseJobConnector(target, fixture('ashby-job-board.json')),
    JobConnectorError,
  );
  assert.deepEqual(genericNormalizedFields(), {
    location: null,
    remoteMode: 'unknown',
    contractType: 'unknown',
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    publishedAt: null,
    externalId: null,
    sourceKind: 'generic_html',
    lifecycleSignal: 'unknown',
  });
});
