import { ZodError } from 'zod';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import {
  ApplicationConflictError,
  ApplicationNotFoundError,
  ApplicationRejectedError,
  deleteApplication,
  readApplication,
  updateApplication,
} from '@/lib/server/applications';
import {
  isSameOrigin,
  PayloadTooLargeError,
  readBoundedJson,
} from '@/lib/server/http';

const MAX_APPLICATION_BYTES = 32 * 1024;

export async function GET(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const { applicationId } = await context.params;
    const application = await readApplication(session, applicationId);
    if (!application) return new Response('Not found', { status: 404 });
    const response = Response.json(application);
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch (error) {
    return applicationError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const { applicationId } = await context.params;
    const application = await updateApplication(
      session,
      applicationId,
      await readBoundedJson(request, MAX_APPLICATION_BYTES),
    );
    const response = Response.json(application);
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch (error) {
    return applicationError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const { applicationId } = await context.params;
    await deleteApplication(
      session,
      applicationId,
      await readBoundedJson(request, MAX_APPLICATION_BYTES),
    );
    return new Response(null, { status: 204 });
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
