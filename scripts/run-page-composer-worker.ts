import { processPageComposerStep } from '../lib/server/page-composer-worker';
import {
  pageComposerSandboxConfig,
  runPageComposerSandbox,
} from '../lib/server/page-composer-sandbox';
import { runWorkerLoop } from './worker-loop';

async function main() {
  const databaseUrl = required('CAREER_OS_PAGE_COMPOSER_DATABASE_URL');
  const sandboxConfig = pageComposerSandboxConfig(process.env);
  const once = process.argv.includes('--once');

  await runWorkerLoop({
    workerName: 'Page composer',
    once,
    iteration: () =>
      processPageComposerStep({
        databaseUrl,
        composePage: (input) => runPageComposerSandbox(input, sandboxConfig),
      }),
  });
}

void main().catch(() => {
  console.error('Page composer worker could not start.');
  process.exitCode = 1;
});

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
