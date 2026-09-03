import { authenticatedPublicationSession } from '@/lib/server/auth';
import { readInstanceStatus } from '@/lib/server/runs';

export async function GET(request: Request) {
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const response = Response.json(await readInstanceStatus(session));
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch {
    return new Response('Instance status unavailable.', {
      status: 503,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}

async function authenticate(request: Request) {
  try {
    return (
      (await authenticatedPublicationSession(request)) ??
      new Response('Unauthorized', {
        status: 401,
        headers: { 'cache-control': 'private, no-store' },
      })
    );
  } catch {
    return new Response('Authentication unavailable.', {
      status: 503,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
