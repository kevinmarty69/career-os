import { ZodError } from 'zod';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import {
  ApplicationContactConflictError,
  ApplicationContactNotFoundError,
  createApplicationContact,
  listApplicationContacts,
} from '@/lib/server/application-contacts';
import {
  isSameOrigin,
  PayloadTooLargeError,
  readBoundedJson,
} from '@/lib/server/http';

const MAX_CONTACT_BYTES = 24 * 1024;

export async function GET(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const { applicationId } = await context.params;
    const response = Response.json({
      contacts: await listApplicationContacts(session, applicationId),
    });
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch (error) {
    return contactError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const { applicationId } = await context.params;
    const contact = await createApplicationContact(
      session,
      applicationId,
      await readBoundedJson(request, MAX_CONTACT_BYTES),
    );
    const response = Response.json(contact, { status: 201 });
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch (error) {
    return contactError(error);
  }
}

function contactError(error: unknown) {
  if (error instanceof PayloadTooLargeError)
    return new Response('Contact payload too large.', { status: 413 });
  if (error instanceof ApplicationContactConflictError)
    return new Response('Contact rank or profile already exists.', {
      status: 409,
    });
  if (error instanceof ApplicationContactNotFoundError)
    return new Response('Not found', { status: 404 });
  if (error instanceof ZodError)
    return new Response('Contact rejected.', { status: 400 });
  return new Response('Application contacts unavailable.', { status: 503 });
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
