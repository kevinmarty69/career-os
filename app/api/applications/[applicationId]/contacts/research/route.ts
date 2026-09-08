import { ZodError } from 'zod';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import { ApplicationContactNotFoundError } from '@/lib/server/application-contacts';
import {
  ContactResearchLimitError,
  readContactResearch,
  researchApplicationContacts,
} from '@/lib/server/contact-research';
import {
  isSameOrigin,
  PayloadTooLargeError,
  readBoundedJson,
} from '@/lib/server/http';

export const maxDuration = 180;

export async function GET(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(request, context, false);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  return handle(request, context, true);
}

async function handle(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
  launch: boolean,
) {
  try {
    const session = await authenticatedPublicationSession(request);
    if (!session) return new Response('Unauthorized', { status: 401 });
    const { applicationId } = await context.params;
    const research = launch
      ? await researchApplicationContacts(
          session,
          applicationId,
          await readBoundedJson(request, 8_192),
        )
      : await readContactResearch(session, applicationId);
    return Response.json(
      { research },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const status =
      error instanceof ApplicationContactNotFoundError
        ? 404
        : error instanceof ContactResearchLimitError
          ? 429
          : error instanceof PayloadTooLargeError
            ? 413
            : error instanceof ZodError || error instanceof SyntaxError
              ? 400
              : 503;
    return new Response(
      status === 429
        ? 'Three contact searches per workspace per day.'
        : 'Contact research unavailable. Check public sources and model configuration.',
      { status },
    );
  }
}
