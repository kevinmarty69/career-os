import { ZodError } from 'zod';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import {
  isSameOrigin,
  PayloadTooLargeError,
  readBoundedJson,
} from '@/lib/server/http';
import {
  confirmResearchSelection,
  RunConflictError,
  RunRejectedError,
} from '@/lib/server/runs';

const MAX_SELECTION_BYTES = 4 * 1024;

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const { runId } = await context.params;
    const result = await confirmResearchSelection(
      session,
      runId,
      await readBoundedJson(request, MAX_SELECTION_BYTES),
      request.headers.get('idempotency-key') ?? '',
    );
    const response = Response.json(result.run, {
      status: result.created ? 202 : 200,
    });
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch (error) {
    if (error instanceof PayloadTooLargeError)
      return new Response('Evidence selection payload too large.', {
        status: 413,
      });
    if (error instanceof RunConflictError)
      return new Response('Research selection already differs.', {
        status: 409,
      });
    if (error instanceof ZodError || error instanceof RunRejectedError)
      return new Response('Research selection rejected.', { status: 400 });
    return new Response('Research selection unavailable.', { status: 503 });
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
