import { opportunityDecisionListResponseSchema } from '@/lib/opportunity-decision';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import { listOpportunityDecisions } from '@/lib/server/opportunity-decisions';

export async function GET(request: Request) {
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const result = Response.json(
      opportunityDecisionListResponseSchema.parse(
        await listOpportunityDecisions(session),
      ),
    );
    result.headers.set('cache-control', 'private, no-store');
    return result;
  } catch {
    return response('Opportunity decisions unavailable.', 503);
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
