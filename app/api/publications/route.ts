import { NextResponse } from 'next/server';
import {
  createSession,
  decodeSession,
  encodeSession,
  mintPublication,
} from '@/lib/server/publications';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  try {
    const current = decodeSession(
      request.headers
        .get('cookie')
        ?.match(/(?:^|; )career_session=([^;]+)/)?.[1],
    );
    const session = current ?? createSession();
    const publication = await mintPublication(session, await request.json());
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
  } catch {
    return new Response('Publication rejected.', {
      status: process.env.DATABASE_URL ? 400 : 503,
    });
  }
}

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}
