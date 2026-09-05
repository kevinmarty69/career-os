import { ZodError } from 'zod';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import {
  ApplicationContactConflictError,
  ApplicationContactNotFoundError,
  updateApplicationContact,
} from '@/lib/server/application-contacts';
import {
  isSameOrigin,
  PayloadTooLargeError,
  readBoundedJson,
} from '@/lib/server/http';

const MAX_CONTACT_UPDATE_BYTES = 8 * 1024;

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ applicationId: string; contactId: string }>;
  },
) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const { applicationId, contactId } = await context.params;
    const contact = await updateApplicationContact(
      session,
      applicationId,
      contactId,
      await readBoundedJson(request, MAX_CONTACT_UPDATE_BYTES),
    );
    const response = Response.json(contact);
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch (error) {
    if (error instanceof PayloadTooLargeError)
      return new Response('Contact update too large.', { status: 413 });
    if (error instanceof ApplicationContactConflictError)
      return new Response('Contact changed in another session.', {
        status: 409,
      });
    if (error instanceof ApplicationContactNotFoundError)
      return new Response('Not found', { status: 404 });
    if (error instanceof ZodError)
      return new Response('Contact update rejected.', { status: 400 });
    return new Response('Application contact unavailable.', { status: 503 });
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
