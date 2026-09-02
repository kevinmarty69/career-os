import { NextResponse } from 'next/server';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import { isSameOrigin } from '@/lib/server/http';
import { readPublication, revokePublication } from '@/lib/server/publications';

export async function GET(
  request: Request,
  context: { params: Promise<{ publicationId: string }> },
) {
  const { publicationId } = await context.params;
  const token = request.headers
    .get('cookie')
    ?.match(new RegExp(`(?:^|; )career_share_${publicationId}=([^;]+)`))?.[1];
  if (!token) return unavailable();
  try {
    const publication = await readPublication(publicationId, token);
    if (!publication) return unavailable();
    const response = NextResponse.json(publication);
    response.headers.set('cache-control', 'private, no-store');
    response.headers.set('referrer-policy', 'no-referrer');
    response.headers.set('x-robots-tag', 'noindex, nofollow');
    return response;
  } catch {
    return unavailable();
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ publicationId: string }> },
) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  let session;
  try {
    session = await authenticatedPublicationSession(request);
  } catch {
    return new Response('Authentication unavailable.', { status: 503 });
  }
  if (!session) return new Response('Unauthorized', { status: 401 });
  try {
    const { publicationId } = await context.params;
    await revokePublication(session, publicationId);
    return new Response(null, { status: 204 });
  } catch {
    return new Response('Revocation rejected.', { status: 403 });
  }
}

function unavailable() {
  return new Response('Private application unavailable.', {
    status: 404,
    headers: {
      'cache-control': 'private, no-store',
      'referrer-policy': 'no-referrer',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}
