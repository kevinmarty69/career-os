import { ZodError } from 'zod';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import {
  DiscoveredJobNotFoundError,
  MatchSearchProfileNotFoundError,
} from '@/lib/server/job-matches';
import { isSameOrigin } from '@/lib/server/http';
import { LocalModelClientError } from '@/lib/server/local-openai-client';
import {
  readLatestSemanticAnalysis,
  runSemanticAnalysis,
  SemanticAnalysisInputUnavailableError,
  SemanticAnalysisModelNotConfiguredError,
} from '@/lib/server/semantic-analyses';

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  if (!isSameOrigin(request)) return response('Forbidden', 403);
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const searchProfileId = new URL(request.url).searchParams.get(
      'searchProfileId',
    );
    if (!searchProfileId) return response('searchProfileId is required.', 400);
    const { jobId } = await context.params;
    const result = await readLatestSemanticAnalysis(
      session,
      jobId,
      searchProfileId,
    );
    return result ? json(result) : response('Not found', 404);
  } catch (error) {
    return semanticError(error);
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
    const searchProfileId = new URL(request.url).searchParams.get(
      'searchProfileId',
    );
    if (!searchProfileId) return response('searchProfileId is required.', 400);
    const { jobId } = await context.params;
    return json(await runSemanticAnalysis(session, jobId, searchProfileId));
  } catch (error) {
    return semanticError(error);
  }
}

function semanticError(error: unknown) {
  if (
    error instanceof DiscoveredJobNotFoundError ||
    error instanceof MatchSearchProfileNotFoundError
  )
    return response('Not found', 404);
  if (error instanceof SemanticAnalysisInputUnavailableError)
    return response('Exact semantic analysis input is unavailable.', 409);
  if (error instanceof SemanticAnalysisModelNotConfiguredError)
    return response('Local semantic model is not configured.', 503);
  if (error instanceof LocalModelClientError) {
    if (
      error.code === 'PROVIDER_UNAVAILABLE' ||
      error.code === 'TIMEOUT' ||
      error.code === 'ABORTED'
    )
      return response('Local semantic model is unavailable.', 503);
    return response('Local semantic model returned an invalid response.', 502);
  }
  if (error instanceof ZodError)
    return response('Semantic analysis request rejected.', 400);
  return response('Semantic analysis unavailable.', 503);
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
