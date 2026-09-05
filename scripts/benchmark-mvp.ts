import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { FakeAgentProvider, runAgentTeam } from '../lib/agent-runtime';
import { syntheticProfile } from '../lib/fixture';
import { evaluateHardMatch, type HardMatchJob } from '../lib/hard-match';
import {
  parseJobBoard,
  type JobBoardTarget,
} from '../lib/job-source-connectors';
import type { SearchProfile } from '../lib/search-profile';

const jobCount = 1_000;
const workflowCount = 100;

const board: JobBoardTarget = {
  sourceKind: 'greenhouse',
  board: 'signal-forge',
  pageUrl: 'https://job-boards.greenhouse.io/signal-forge',
  fetchUrl:
    'https://boards-api.greenhouse.io/v1/boards/signal-forge/jobs?content=true&pay_transparency=true',
};

const profile: SearchProfile = {
  searchProfileId: '20000000-0000-4000-8000-000000000001',
  name: 'Synthetic platform search',
  hardConstraints: {
    roles: ['Staff Platform Engineer'],
    seniorities: ['Staff'],
    locations: ['Paris'],
    remoteModes: ['hybrid'],
    timezones: ['Europe/Paris'],
    languages: ['English'],
    contractTypes: ['permanent'],
    minimumSalary: { amount: 80_000, currency: 'EUR' },
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
  discoverySources: [],
  discoveryIntervalHours: 24,
  alertThreshold: null,
  active: true,
  revision: 1,
  createdAt: '2026-09-05T00:00:00.000Z',
  updatedAt: '2026-09-05T00:00:00.000Z',
};

const payload = JSON.stringify({
  jobs: Array.from({ length: jobCount }, (_, index) => ({
    id: index + 1,
    title: 'Staff Platform Engineer',
    company_name: 'Signal Forge',
    location: { name: 'Paris' },
    content: '<p>Operate reliable deployment workflows.</p>',
    absolute_url: `https://job-boards.greenhouse.io/signal-forge/jobs/${index + 1}`,
    pay_input_ranges: [
      { min_cents: 9_000_000, max_cents: 11_000_000, currency_type: 'EUR' },
    ],
  })),
});

async function main() {
  const collectionStarted = performance.now();
  const jobs = parseJobBoard(board, payload);
  const evaluations = jobs.map((job, index) =>
    evaluateHardMatch(
      {
        opportunityId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        company: 'Signal Forge',
        role: job.extraction.role,
        location: job.normalized.location,
        remoteMode: job.normalized.remoteMode,
        contractType: job.normalized.contractType,
        salaryMin: job.normalized.salaryMin,
        salaryMax: job.normalized.salaryMax,
        salaryCurrency: job.normalized.salaryCurrency,
        salaryPeriod: job.normalized.salaryPeriod,
        lifecycle: 'open',
        revision: 1,
      } satisfies HardMatchJob,
      profile,
    ),
  );
  const collectionMs = performance.now() - collectionStarted;

  const workflowLatencies: number[] = [];
  const workflowStarted = performance.now();
  const runs = await Promise.all(
    Array.from({ length: workflowCount }, async (_, index) => {
      const started = performance.now();
      const run = await runAgentTeam({
        tenantId: `tenant-${index}`,
        runId: `run-${index}`,
        profile: syntheticProfile,
        opportunity: {
          company: 'Signal Forge',
          role: 'Staff Platform Engineer',
          description: 'Ship reliable deployment workflows.',
          accent: '#5647e0',
        },
        provider: new FakeAgentProvider(),
      });
      workflowLatencies.push(performance.now() - started);
      return run;
    }),
  );
  const workflowsMs = performance.now() - workflowStarted;

  assert.equal(jobs.length, jobCount);
  assert.equal(evaluations.length, jobCount);
  assert.equal(
    runs.filter((run) => run.status === 'awaiting_approval').length,
    workflowCount,
  );
  assert.ok(
    collectionMs < 10_000,
    'Collection and matching exceeded 10 seconds.',
  );
  assert.ok(workflowsMs < 10_000, 'Agent workflows exceeded 10 seconds.');

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        runtime: process.version,
        collectionAndMatching: {
          jobs: jobCount,
          eligible: evaluations.filter((result) => result.eligibleForPriority)
            .length,
          totalMs: round(collectionMs),
          jobsPerSecond: round(jobCount / (collectionMs / 1_000)),
        },
        agentOrchestration: {
          workflows: workflowCount,
          totalMs: round(workflowsMs),
          p50Ms: percentile(workflowLatencies, 50),
          p95Ms: percentile(workflowLatencies, 95),
          events: runs.reduce((total, run) => total + run.events.length, 0),
          inputTokens: runs.reduce(
            (total, run) => total + run.usage.inputTokens,
            0,
          ),
          outputTokens: runs.reduce(
            (total, run) => total + run.usage.outputTokens,
            0,
          ),
          costMicros: runs.reduce(
            (total, run) => total + run.usage.costMicros,
            0,
          ),
          costStatus: 'unpriced_local_provider',
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Benchmark failed.');
  process.exitCode = 1;
});

function percentile(values: number[], target: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return round(sorted[Math.ceil((target / 100) * sorted.length) - 1]);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
