import { ZodError } from 'zod';
import {
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

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  let session;
  try {
    session = await authenticatedPublicationSession(request);
  } catch {
    return new Response('Authentication unavailable.', { status: 503 });
  }
  if (!session) return new Response('Unauthorized', { status: 401 });
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
