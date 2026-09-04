import { authenticatedPublicationSession } from '@/lib/server/auth';
import { readLivingProfileHistory } from '@/lib/server/profile';

export async function GET(request: Request) {
  try {
    const session = await authenticatedPublicationSession(request);
    if (!session) return new Response('Unauthorized', { status: 401 });
    const response = Response.json(await readLivingProfileHistory(session));
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch {
    return new Response('Career Memory history unavailable.', { status: 503 });
  }
}
