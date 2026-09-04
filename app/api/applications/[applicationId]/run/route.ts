import { authenticatedPublicationSession } from '@/lib/server/auth';
import { readLatestApplicationRun, RunRejectedError } from '@/lib/server/runs';

export async function GET(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const { applicationId } = await context.params;
    const run = await readLatestApplicationRun(session, applicationId);
    const response = run
      ? Response.json(run)
      : new Response(null, { status: 204 });
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch (error) {
    return new Response(
      error instanceof RunRejectedError
        ? 'Run request rejected.'
        : 'Run unavailable.',
      { status: error instanceof RunRejectedError ? 400 : 503 },
    );
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
