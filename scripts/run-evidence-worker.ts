import { processEvidenceArchivistStep } from '../lib/server/evidence-worker';
import { runWorkerLoop } from './worker-loop';

async function main() {
  const databaseUrl = required('CAREER_OS_EVIDENCE_WORKER_DATABASE_URL');
  const once = process.argv.includes('--once');

  await runWorkerLoop({
    workerName: 'Evidence',
    once,
    iteration: () => processEvidenceArchivistStep(databaseUrl),
  });
}

void main().catch(() => {
  console.error('Evidence worker could not start.');
  process.exitCode = 1;
});

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
