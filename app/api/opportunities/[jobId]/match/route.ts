import { ZodError } from 'zod';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import {
  createJobMatch,
  DiscoveredJobNotFoundError,
  MatchSearchProfileNotFoundError,
  readLatestJobMatch,
} from '@/lib/server/job-matches';
import {
  isSameOrigin,
  PayloadTooLargeError,
  readBoundedJson,
} from '@/lib/server/http';

const MAX_MATCH_BYTES = 4 * 1024;

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const { jobId } = await context.params;
    const searchProfileId = new URL(request.url).searchParams.get(
      'searchProfileId',
    );
    if (!searchProfileId) return response('searchProfileId is required.', 400);
    const match = await readLatestJobMatch(session, jobId, searchProfileId);
    return match ? json(match) : response('Not found', 404);
  } catch (error) {
    return matchError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  if (!isSameOrigin(request)) return response('Forbidden', 403);
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const { jobId } = await context.params;
    return json(
      await createJobMatch(
        session,
        jobId,
        await readBoundedJson(request, MAX_MATCH_BYTES),
      ),
    );
  } catch (error) {
    return matchError(error);
  }
}

function matchError(error: unknown) {
  if (error instanceof PayloadTooLargeError)
    return response('Match payload too large.', 413);
  if (
    error instanceof DiscoveredJobNotFoundError ||
    error instanceof MatchSearchProfileNotFoundError
  )
    return response('Not found', 404);
  if (error instanceof ZodError)
    return response('Match request rejected.', 400);
  return response('Match unavailable.', 503);
}

async function authenticate(request: Request) {
  try {
    return (
      (await authenticatedPublicationSession(request)) ??
      response('Unauthorized', 401)
    );
  } catch {
    return response('Authentication unavailable.', 503);
  }
}

function json(value: unknown) {
  const result = Response.json(value);
  result.headers.set('cache-control', 'private, no-store');
  return result;
}

function response(body: string, status: number) {
  return new Response(body, {
    status,
    headers: { 'cache-control': 'private, no-store' },
  });
}
