import { authenticatedPublicationSession } from '@/lib/server/auth';
import { listUpcomingTasks } from '@/lib/server/application-tasks';

export async function GET(request: Request) {
  try {
    const session = await authenticatedPublicationSession(request);
    if (!session) return new Response('Unauthorized', { status: 401 });
    const response = Response.json(await listUpcomingTasks(session));
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch {
    return new Response('Tasks unavailable.', { status: 503 });
  }
}
