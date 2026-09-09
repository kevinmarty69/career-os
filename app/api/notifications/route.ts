import { authenticatedPublicationSession } from '@/lib/server/auth';
import { readNotificationContext } from '@/lib/server/notification-context';

export async function GET(request: Request) {
  try {
    const session = await authenticatedPublicationSession(request);
    if (!session) return new Response('Unauthorized', { status: 401 });
    return Response.json(await readNotificationContext(session), {
      headers: { 'cache-control': 'private, no-store' },
    });
  } catch {
    return new Response('Notifications unavailable.', { status: 503 });
  }
}
