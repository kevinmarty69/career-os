import { ZodError } from 'zod';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import {
  ApplicationNotFoundError,
  OpportunityApplicationClosedError,
  OpportunityApplicationExcludedError,
  promoteDiscoveredJobToApplication,
} from '@/lib/server/applications';
import { hasRequestBody, isSameOrigin } from '@/lib/server/http';

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  if (!isSameOrigin(request)) return response('Forbidden', 403);
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    if (await hasRequestBody(request))
      return response('Request body is not allowed.', 400);
    const { jobId } = await context.params;
    const result = await promoteDiscoveredJobToApplication(session, jobId);
    const created = Response.json(result.application, {
      status: result.created ? 201 : 200,
    });
    created.headers.set('cache-control', 'private, no-store');
    return created;
  } catch (error) {
    if (error instanceof ApplicationNotFoundError)
      return response('Not found', 404);
    if (error instanceof OpportunityApplicationClosedError)
      return response('Opportunity is closed.', 409);
    if (error instanceof OpportunityApplicationExcludedError)
      return response(`Opportunity is ${error.disposition}.`, 409);
    if (error instanceof ZodError)
      return response('Opportunity promotion rejected.', 400);
    return response('Opportunity promotion unavailable.', 503);
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
