import { ZodError } from 'zod';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import {
  isSameOrigin,
  PayloadTooLargeError,
  readBoundedJson,
} from '@/lib/server/http';
import {
  decideReviewIssue,
  RunConflictError,
  RunRejectedError,
} from '@/lib/server/runs';

const MAX_DECISION_BYTES = 4 * 1024;

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const { runId } = await context.params;
    const result = await decideReviewIssue(
      session,
      runId,
      await readBoundedJson(request, MAX_DECISION_BYTES),
      request.headers.get('idempotency-key') ?? '',
    );
    const response = Response.json(result.decision, {
      status: result.created ? 201 : 200,
    });
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch (error) {
    if (error instanceof PayloadTooLargeError)
      return new Response('Review decision payload too large.', {
        status: 413,
      });
    if (error instanceof RunConflictError)
      return new Response('Review issue already has a different decision.', {
        status: 409,
      });
    if (error instanceof ZodError || error instanceof RunRejectedError)
      return new Response('Review decision rejected.', { status: 400 });
    return new Response('Review decision unavailable.', { status: 503 });
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
