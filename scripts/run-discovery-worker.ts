import { processScheduledDiscoveryStep } from '../lib/server/discovery-worker';
import { runWorkerLoop } from './worker-loop';

async function main() {
  const databaseUrl = process.env.CAREER_OS_DISCOVERY_DATABASE_URL;
  if (!databaseUrl)
    throw new Error('CAREER_OS_DISCOVERY_DATABASE_URL is required.');
  await runWorkerLoop({
    workerName: 'Job discovery',
    once: process.argv.includes('--once'),
    iteration: () => processScheduledDiscoveryStep({ databaseUrl }),
    idleDelayMs: 30_000,
  });
}

void main().catch(() => {
  console.error('Job discovery worker could not start.');
  process.exitCode = 1;
});
