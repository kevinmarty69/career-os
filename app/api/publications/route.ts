import { ZodError } from 'zod';
import {
  listPublications,
  mintPublication,
  PublicationRejectedError,
} from '@/lib/server/publications';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import {
  isSameOrigin,
  PayloadTooLargeError,
  readBoundedJson,
} from '@/lib/server/http';
import { takePublicationAttempt } from '@/lib/server/publication-rate-limit';

const MAX_PUBLICATION_BYTES = 4 * 1024;

export async function GET(request: Request) {
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const response = Response.json(
      await listPublications(
        session,
        new URL(request.url).searchParams.get('cursor'),
      ),
    );
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch (error) {
    if (error instanceof PublicationRejectedError)
      return new Response('Publication cursor rejected.', { status: 400 });
    return new Response('Publications unavailable.', { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  if (!takePublicationAttempt(session.tenantId))
    return new Response('Too many publication attempts.', {
      status: 429,
      headers: { 'retry-after': '60' },
    });
  try {
    const publication = await mintPublication(
      session,
      await readBoundedJson(request, MAX_PUBLICATION_BYTES),
    );
    const response = Response.json(publication, { status: 201 });
    response.headers.set('cache-control', 'no-store');
    return response;
  } catch (error) {
    if (error instanceof PayloadTooLargeError)
      return new Response('Publication payload too large.', { status: 413 });
    if (error instanceof ZodError || error instanceof PublicationRejectedError)
      return new Response('Publication rejected.', { status: 400 });
    return new Response('Publication rejected.', {
      status: 503,
    });
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
