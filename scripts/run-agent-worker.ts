import { LocalOpenAICompanyResearchClient } from '../lib/server/local-openai-client';
import { processCompanyResearchStep } from '../lib/server/run-worker';

const databaseUrl = required('CAREER_OS_WORKER_DATABASE_URL');
const client = new LocalOpenAICompanyResearchClient({
  baseUrl: required('CAREER_OS_LOCAL_MODEL_BASE_URL'),
  apiKey: process.env.CAREER_OS_LOCAL_MODEL_API_KEY ?? 'local-only',
  model: required('CAREER_OS_LOCAL_MODEL'),
});
const once = process.argv.includes('--once');

do {
  try {
    const result = await processCompanyResearchStep({
      databaseUrl,
      client,
    });
    console.log(JSON.stringify(result));
    if (once) break;
    await wait(result.status === 'idle' ? 1000 : 50);
  } catch {
    console.error('Worker iteration failed.');
    if (once) {
      process.exitCode = 1;
      break;
    }
    await wait(1000);
  }
} while (true);

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
