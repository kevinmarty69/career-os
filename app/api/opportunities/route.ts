import { opportunityListResponseSchema } from '@/lib/discovered-job-contract';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import { listDiscoveredJobs } from '@/lib/server/discovered-jobs';

export async function GET(request: Request) {
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const result = Response.json(
      opportunityListResponseSchema.parse({
        opportunities: await listDiscoveredJobs(session),
      }),
    );
    result.headers.set('cache-control', 'private, no-store');
    return result;
  } catch {
    return response('Opportunities unavailable.', 503);
  }
}

async function authenticate(request: Request) {
  try {
    return (
      (await authenticatedPublicationSession(request)) ??
      response('Unauthorized', 401)
    );
  } catch {
    return response('Authentication unavailable.', 503);
  }
}

function response(body: string, status: number) {
  return new Response(body, {
    status,
    headers: { 'cache-control': 'private, no-store' },
  });
}
