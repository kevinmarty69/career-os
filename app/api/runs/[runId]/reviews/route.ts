import { ZodError } from 'zod';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import {
  isSameOrigin,
  PayloadTooLargeError,
  readBoundedJson,
} from '@/lib/server/http';
import {
  RunConflictError,
  RunRejectedError,
  startPageSpecReviews,
} from '@/lib/server/runs';

const MAX_REVIEW_START_BYTES = 64;

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const { runId } = await context.params;
    const result = await startPageSpecReviews(
      session,
      runId,
      await readBoundedJson(request, MAX_REVIEW_START_BYTES),
      request.headers.get('idempotency-key') ?? '',
    );
    const response = Response.json(result.run, {
      status: result.created ? 202 : 200,
    });
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch (error) {
    if (error instanceof PayloadTooLargeError)
      return new Response('Review request payload too large.', { status: 413 });
    if (error instanceof RunConflictError)
      return new Response('Review request already differs.', { status: 409 });
    if (error instanceof ZodError || error instanceof RunRejectedError)
      return new Response('Review request rejected.', { status: 400 });
    return new Response('Review request unavailable.', { status: 503 });
  }
}

async function authenticate(request: Request) {
  try {
    return (
      (await authenticatedPublicationSession(request)) ??
      new Response('Unauthorized', { status: 401 })
    );
  } catch {
    return new Response('Authentication unavailable.', { status: 503 });
  }
}
