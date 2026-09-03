import { reviewerSchema, type Reviewer } from '../lib/reviewer';
import { LocalOpenAIReviewClient } from '../lib/server/local-openai-review-client';
import { processReviewerStep } from '../lib/server/reviewer-worker';

async function main() {
  const reviewer = reviewerSchema.parse(required('CAREER_OS_REVIEWER'));
  const databaseUrl = required(reviewerDatabaseUrlName(reviewer));
  const once = process.argv.includes('--once');
  const client = qualitativeClient(reviewer);

  do {
    try {
      const result =
        reviewer === 'factuality'
          ? await processReviewerStep({ reviewer, databaseUrl })
          : await processReviewerStep({
              reviewer,
              databaseUrl,
              client: client!,
            });
      console.log(JSON.stringify(result));
      if (once) break;
      await wait(result.status === 'idle' ? 1_000 : 50);
    } catch {
      console.error(`${reviewer} reviewer worker iteration failed.`);
      if (once) {
        process.exitCode = 1;
        break;
      }
      await wait(1_000);
    }
  } while (true);
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

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
