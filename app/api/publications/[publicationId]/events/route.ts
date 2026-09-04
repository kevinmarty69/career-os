import { ZodError } from 'zod';
import { parsePublicationCookie } from '@/lib/publication-cookie';
import {
  isSameOrigin,
  PayloadTooLargeError,
  readBoundedJson,
} from '@/lib/server/http';
import { recordPublicationEvent } from '@/lib/server/publications';

const MAX_EVENT_BYTES = 512;

export async function POST(
  request: Request,
  context: { params: Promise<{ publicationId: string }> },
) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const capability = parsePublicationCookie(
    (await context.params).publicationId,
    request.headers.get('cookie'),
  );
  if (!capability?.token) return unavailable();
  try {
    await recordPublicationEvent(
      capability.publicationId,
      capability.token,
      await readBoundedJson(request, MAX_EVENT_BYTES),
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof PayloadTooLargeError)
      return new Response('Event too large.', { status: 413 });
    if (error instanceof ZodError)
      return new Response('Event rejected.', { status: 400 });
    return unavailable();
  }
}

function unavailable() {
  return new Response('Private application unavailable.', {
    status: 404,
    headers: { 'cache-control': 'no-store' },
  });
}
