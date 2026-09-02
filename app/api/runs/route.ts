import { ZodError } from 'zod';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import {
  isSameOrigin,
  PayloadTooLargeError,
  readBoundedJson,
} from '@/lib/server/http';
import {
  createPersistedRun,
  RunConflictError,
  RunRejectedError,
} from '@/lib/server/runs';

const MAX_RUN_BYTES = 32 * 1024;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const result = await createPersistedRun(
      session,
      await readBoundedJson(request, MAX_RUN_BYTES),
      request.headers.get('idempotency-key') ?? '',
      request.signal,
    );
    const response = Response.json(result.run, {
      status: result.created ? 201 : 200,
    });
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch (error) {
    if (error instanceof PayloadTooLargeError)
      return new Response('Run payload too large.', { status: 413 });
    if (error instanceof RunConflictError)
      return new Response('Career Memory changed in another session.', {
        status: 409,
      });
    if (error instanceof ZodError || error instanceof RunRejectedError)
      return new Response('Run rejected.', { status: 400 });
    return new Response('Run unavailable.', { status: 503 });
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
