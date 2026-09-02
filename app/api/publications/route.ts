import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  createSession,
  decodeSession,
  encodeSession,
  mintPublication,
  PublicationRejectedError,
} from '@/lib/server/publications';
import { PayloadTooLargeError, readBoundedJson } from '@/lib/server/http';
import { takePublicationAttempt } from '@/lib/server/publication-rate-limit';

const MAX_PUBLICATION_BYTES = 128 * 1024;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  if (!takePublicationAttempt())
    return new Response('Too many publication attempts.', {
      status: 429,
      headers: { 'retry-after': '60' },
    });
  try {
    const current = decodeSession(
      request.headers
        .get('cookie')
        ?.match(/(?:^|; )career_session=([^;]+)/)?.[1],
    );
    const session = current ?? createSession();
    const publication = await mintPublication(
      session,
      await readBoundedJson(request, MAX_PUBLICATION_BYTES),
    );
    const response = NextResponse.json(publication, { status: 201 });
    if (!current)
      response.cookies.set('career_session', encodeSession(session), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      });
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

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return origin === new URL(request.url).origin;
}
