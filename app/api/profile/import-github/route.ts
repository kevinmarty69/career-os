import { z, ZodError } from 'zod';
import { githubRepositorySchema, parseGitHubSource } from '@/lib/github-source';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import {
  isSameOrigin,
  readBoundedJson,
  PayloadTooLargeError,
} from '@/lib/server/http';
import { safeFetchText } from '@/lib/server/safe-http';
import {
  reserveUrlImport,
  finishUrlImport,
  UrlImportRateLimitError,
} from '@/lib/server/url-imports';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: Request) {
  const reply = (error: string, status: number) =>
    Response.json(
      { error },
      { status, headers: { 'cache-control': 'private, no-store' } },
    );
  if (!isSameOrigin(request)) return reply('Forbidden', 403);
  let session;
  try {
    session = await authenticatedPublicationSession(request);
  } catch {
    return reply('Authentication unavailable', 503);
  }
  if (!session) return reply('Unauthorized', 401);
  let attempt: string | undefined;
  let outcome: 'succeeded' | 'rejected' | 'failed' = 'failed';
  try {
    const { repository } = z
      .object({ repository: githubRepositorySchema })
      .strict()
      .parse(await readBoundedJson(request, 4096));
    attempt = await reserveUrlImport(session);
    // Fixed public REST endpoints, no token, code traversal or arbitrary download URLs.
    const base = `https://api.github.com/repos/${repository}`;
    const responses = await Promise.all(
      [base, `${base}/readme`, `${base}/languages`].map(async (url) =>
        JSON.parse((await safeFetchText(url)).text),
      ),
    );
    const source = parseGitHubSource(
      repository,
      responses[0],
      responses[1],
      responses[2],
      new Date().toISOString(),
    );
    outcome = 'succeeded';
    return Response.json(source, {
      headers: { 'cache-control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof UrlImportRateLimitError)
      return reply('Import limit reached. Retry later.', 429);
    if (error instanceof ZodError || error instanceof PayloadTooLargeError) {
      outcome = 'rejected';
      return reply('Invalid repository or unsupported README.', 422);
    }
    return reply(
      'Public README unavailable. Check the repository and retry; private repositories are not supported.',
      503,
    );
  } finally {
    if (attempt)
      await finishUrlImport(session, attempt, outcome).catch(() => {});
  }
}
