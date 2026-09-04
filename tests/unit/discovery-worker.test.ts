import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { SearchProfile } from '../../lib/search-profile';
import { discoverSearchProfile } from '../../lib/job-discovery';

const board = readFileSync(
  new URL('../fixtures/ashby-job-board.json', import.meta.url),
  'utf8',
);

test('scheduled discovery stores only jobs compatible with hard constraints', async () => {
  const stored: unknown[] = [];
  const profile: SearchProfile = {
    searchProfileId: '10000000-0000-4000-8000-000000000001',
    name: 'Product roles',
    hardConstraints: {
      roles: ['Founding Product Engineer'],
      seniorities: [],
      locations: [],
      remoteModes: [],
      timezones: [],
      languages: [],
      contractTypes: [],
      excludedCompanies: [],
      excludedNetworks: [],
    },
    softPreferences: {
      stacks: [],
      sectors: [],
      productTypes: [],
      companySizes: [],
      cultures: [],
    },
    discoverySources: [
      { company: 'Nimbus', url: 'https://jobs.ashbyhq.com/nimbus' },
    ],
    discoveryIntervalHours: 24,
    alertThreshold: null,
    active: true,
    revision: 1,
    createdAt: '2026-09-05T08:00:00.000Z',
    updatedAt: '2026-09-05T08:00:00.000Z',
  };
  const summary = await discoverSearchProfile(
    profile,
    { tenantId: crypto.randomUUID(), userId: crypto.randomUUID() },
    async (url) => ({
      requestedUrl: url,
      finalUrl: url,
      contentType: 'application/json',
      bytes: Buffer.byteLength(board),
      text: board,
    }),
    async (_session, input) => {
      stored.push(input);
      return { created: true, opportunity: {} as never };
    },
  );

  assert.deepEqual(summary, {
    boards: 1,
    jobsRead: 2,
    stored: 1,
    filtered: 1,
    failedBoards: 0,
  });
  assert.equal(stored.length, 1);
});
