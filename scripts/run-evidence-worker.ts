import { processEvidenceArchivistStep } from '../lib/server/evidence-worker';

async function main() {
  const databaseUrl = required('CAREER_OS_EVIDENCE_WORKER_DATABASE_URL');
  const once = process.argv.includes('--once');

  do {
    try {
      const result = await processEvidenceArchivistStep(databaseUrl);
      console.log(JSON.stringify(result));
      if (once) break;
      await wait(result.status === 'idle' ? 1000 : 50);
    } catch {
      console.error('Evidence worker iteration failed.');
      if (once) {
        process.exitCode = 1;
        break;
      }
      await wait(1000);
    }
  } while (true);
}

void main().catch(() => {
  console.error('Evidence worker could not start.');
  process.exitCode = 1;
});

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
