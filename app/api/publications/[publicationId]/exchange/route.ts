import { NextResponse } from 'next/server';
import { PayloadTooLargeError, readBoundedJson } from '@/lib/server/http';
import { readPublication } from '@/lib/server/publications';

const MAX_EXCHANGE_BYTES = 1024;

export async function POST(
  request: Request,
  context: { params: Promise<{ publicationId: string }> },
) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return new Response('Forbidden', { status: 403 });
  try {
    const { publicationId } = await context.params;
    const { token } = (await readBoundedJson(request, MAX_EXCHANGE_BYTES)) as {
      token?: unknown;
    };
    if (
      typeof token !== 'string' ||
      !(await readPublication(publicationId, token))
    )
      return new Response('Invalid capability.', { status: 404 });
    const response = new NextResponse(null, { status: 204 });
    response.cookies.set(`career_share_${publicationId}`, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: `/api/publications/${publicationId}`,
      maxAge: 7 * 24 * 60 * 60,
    });
    response.headers.set('cache-control', 'no-store');
    return response;
  } catch (error) {
    if (error instanceof PayloadTooLargeError)
      return new Response('Capability payload too large.', { status: 413 });
    return new Response('Invalid capability.', { status: 404 });
  }
}
