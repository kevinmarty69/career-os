import { ZodError } from 'zod';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import { readNotificationHistory } from '@/lib/server/notification-history';

export async function GET(request: Request) {
  const headers = { 'cache-control': 'private, no-store' };
  try {
    const session = await authenticatedPublicationSession(request);
    if (!session) return new Response('Unauthorized', { status: 401, headers });
    const raw = new URL(request.url).searchParams.get('cursor');
    if (raw && raw.length > 200)
      return new Response('Invalid cursor', { status: 400, headers });
    const cursor = raw ? JSON.parse(raw) : undefined;
    return Response.json(await readNotificationHistory(session, cursor), {
      headers,
    });
  } catch (error) {
    return new Response('History unavailable', {
      status:
        error instanceof ZodError || error instanceof SyntaxError ? 400 : 503,
      headers,
    });
  }
}
