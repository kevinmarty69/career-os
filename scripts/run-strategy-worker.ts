import { serverModelConfig } from '../lib/server/local-openai-transport';
import { LocalOpenAIRecruiterStrategyClient } from '../lib/server/local-openai-strategy-client';
import { processRecruiterStrategyStep } from '../lib/server/strategy-worker';
import { runWorkerLoop } from './worker-loop';

async function main() {
  const databaseUrl = required('CAREER_OS_STRATEGY_WORKER_DATABASE_URL');
  const client = new LocalOpenAIRecruiterStrategyClient({
    ...serverModelConfig(),
  });
  const once = process.argv.includes('--once');

  await runWorkerLoop({
    workerName: 'Strategy',
    once,
    iteration: () =>
      processRecruiterStrategyStep({
        databaseUrl,
        client,
      }),
  });
}

void main().catch(() => {
  console.error('Strategy worker could not start.');
  process.exitCode = 1;
});

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
