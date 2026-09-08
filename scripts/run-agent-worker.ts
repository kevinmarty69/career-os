import { serverModelConfig } from '../lib/server/local-openai-transport';
import { LocalOpenAICompanyResearchClient } from '../lib/server/local-openai-client';
import { processCompanyResearchStep } from '../lib/server/run-worker';
import { runWorkerLoop } from './worker-loop';

async function main() {
  const databaseUrl = required('CAREER_OS_WORKER_DATABASE_URL');
  const client = new LocalOpenAICompanyResearchClient({
    ...serverModelConfig(),
  });
  const once = process.argv.includes('--once');

  await runWorkerLoop({
    workerName: 'Company research',
    once,
    iteration: () =>
      processCompanyResearchStep({
        databaseUrl,
        client,
      }),
  });
}

void main().catch(() => {
  console.error('Worker could not start.');
  process.exitCode = 1;
});

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
