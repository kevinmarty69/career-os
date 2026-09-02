import { NextResponse } from 'next/server';
import { readPublication } from '@/lib/server/publications';

export async function POST(
  request: Request,
  context: { params: Promise<{ publicationId: string }> },
) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return new Response('Forbidden', { status: 403 });
  try {
    const { publicationId } = await context.params;
    const { token } = (await request.json()) as { token?: unknown };
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
  } catch {
    return new Response('Invalid capability.', { status: 404 });
  }
}
