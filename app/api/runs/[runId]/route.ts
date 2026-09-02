import { authenticatedPublicationSession } from '@/lib/server/auth';
import { readPersistedRun, RunRejectedError } from '@/lib/server/runs';

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const { runId } = await context.params;
    const run = await readPersistedRun(session, runId);
    if (!run) return new Response('Not found', { status: 404 });
    const response = Response.json(run);
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch (error) {
    if (error instanceof RunRejectedError)
      return new Response('Not found', { status: 404 });
    return new Response('Run unavailable.', { status: 503 });
  }
}

async function authenticate(request: Request) {
  try {
    return (
      (await authenticatedPublicationSession(request)) ??
      new Response('Unauthorized', { status: 401 })
    );
  } catch {
    return new Response('Authentication unavailable.', { status: 503 });
  }
}
