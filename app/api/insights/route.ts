import { authenticatedPublicationSession } from '@/lib/server/auth';
import { readApplicationInsights } from '@/lib/server/application-insights';

export async function GET(request: Request) {
  try {
    const session = await authenticatedPublicationSession(request);
    if (!session) return new Response('Unauthorized', { status: 401 });
    const response = Response.json(await readApplicationInsights(session));
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch {
    return new Response('Insights unavailable.', { status: 503 });
  }
}
