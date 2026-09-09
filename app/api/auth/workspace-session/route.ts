import { authenticatedPublicationSession } from '@/lib/server/auth';

export async function GET(request: Request) {
  try {
    const session = await authenticatedPublicationSession(request);
    return session
      ? Response.json(
          { userId: session.userId, tenantId: session.tenantId },
          { headers: { 'cache-control': 'private, no-store' } },
        )
      : new Response('Unauthorized', { status: 401 });
  } catch {
    return new Response('Session unavailable', { status: 503 });
  }
}
