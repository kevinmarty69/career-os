import { ZodError } from 'zod';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import {
  ApplicationConflictError,
  ApplicationNotFoundError,
  ApplicationRejectedError,
  createApplication,
  listApplications,
} from '@/lib/server/applications';
import {
  isSameOrigin,
  PayloadTooLargeError,
  readBoundedJson,
} from '@/lib/server/http';

const MAX_APPLICATION_BYTES = 32 * 1024;

export async function GET(request: Request) {
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const response = Response.json({
      applications: await listApplications(session),
    });
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch {
    return new Response('Applications unavailable.', { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const result = await createApplication(
      session,
      await readBoundedJson(request, MAX_APPLICATION_BYTES),
      request.headers.get('idempotency-key') ?? '',
    );
    const response = Response.json(result.application, {
      status: result.created ? 201 : 200,
    });
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch (error) {
    return applicationError(error);
  }
}

function applicationError(error: unknown) {
  if (error instanceof PayloadTooLargeError)
    return new Response('Application payload too large.', { status: 413 });
  if (error instanceof ApplicationConflictError)
    return new Response('Application changed in another session.', {
      status: 409,
    });
  if (error instanceof ApplicationNotFoundError)
    return new Response('Not found', { status: 404 });
  if (error instanceof ZodError || error instanceof ApplicationRejectedError)
    return new Response('Application rejected.', { status: 400 });
  return new Response('Applications unavailable.', { status: 503 });
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
