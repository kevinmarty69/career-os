import { ZodError } from 'zod';
import { opportunityDecisionMutationResponseSchema } from '@/lib/opportunity-decision';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import {
  OpportunityDecisionConflictError,
  OpportunityDecisionNotFoundError,
  saveOpportunityDecision,
} from '@/lib/server/opportunity-decisions';
import {
  isSameOrigin,
  PayloadTooLargeError,
  readBoundedJson,
} from '@/lib/server/http';

const MAX_DECISION_BYTES = 4 * 1024;

export async function PUT(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  if (!isSameOrigin(request)) return response('Forbidden', 403);
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const { jobId } = await context.params;
    const decision = await saveOpportunityDecision(
      session,
      jobId,
      await readBoundedJson(request, MAX_DECISION_BYTES),
      request.headers.get('idempotency-key'),
    );
    const result = Response.json(
      opportunityDecisionMutationResponseSchema.parse({ decision }),
    );
    result.headers.set('cache-control', 'private, no-store');
    return result;
  } catch (error) {
    return decisionError(error);
  }
}

function decisionError(error: unknown) {
  if (error instanceof PayloadTooLargeError)
    return response('Opportunity decision payload too large.', 413);
  if (error instanceof OpportunityDecisionConflictError)
    return response('Opportunity decision changed in another session.', 409);
  if (error instanceof OpportunityDecisionNotFoundError)
    return response('Not found', 404);
  if (error instanceof ZodError)
    return response('Opportunity decision rejected.', 400);
  return response('Opportunity decisions unavailable.', 503);
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
