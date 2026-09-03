import { reviewerSchema, type Reviewer } from '../lib/reviewer';
import { LocalOpenAIReviewClient } from '../lib/server/local-openai-review-client';
import { processReviewerStep } from '../lib/server/reviewer-worker';
import { runWorkerLoop } from './worker-loop';

async function main() {
  const reviewer = reviewerSchema.parse(required('CAREER_OS_REVIEWER'));
  const databaseUrl = required(reviewerDatabaseUrlName(reviewer));
  const once = process.argv.includes('--once');
  const client = qualitativeClient(reviewer);

  await runWorkerLoop({
    workerName: `${reviewer} reviewer`,
    once,
    iteration: () =>
      reviewer === 'factuality'
        ? processReviewerStep({ reviewer, databaseUrl })
        : processReviewerStep({
            reviewer,
            databaseUrl,
            client: client!,
          }),
  });
}

function reviewerDatabaseUrlName(reviewer: Reviewer) {
  if (reviewer === 'recruiter')
    return 'CAREER_OS_RECRUITER_REVIEWER_DATABASE_URL';
  if (reviewer === 'hiring-manager')
    return 'CAREER_OS_HIRING_MANAGER_REVIEWER_DATABASE_URL';
  return 'CAREER_OS_FACTUALITY_REVIEWER_DATABASE_URL';
}

void main().catch(() => {
  console.error('Reviewer worker could not start.');
  process.exitCode = 1;
});

function qualitativeClient(reviewer: Reviewer) {
  if (reviewer === 'factuality') return undefined;
  return new LocalOpenAIReviewClient({
    reviewer,
    baseUrl: required('CAREER_OS_LOCAL_MODEL_BASE_URL'),
    apiKey: process.env.CAREER_OS_LOCAL_MODEL_API_KEY ?? 'local-only',
    model: required('CAREER_OS_LOCAL_MODEL'),
  });
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
