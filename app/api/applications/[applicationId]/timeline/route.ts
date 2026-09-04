import { ZodError } from 'zod';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import {
  ApplicationTimelineNotFoundError,
  createApplicationTimelineEvent,
  listApplicationTimeline,
} from '@/lib/server/application-timeline';
import {
  isSameOrigin,
  PayloadTooLargeError,
  readBoundedJson,
} from '@/lib/server/http';

const MAX_TIMELINE_EVENT_BYTES = 4 * 1024;

export async function GET(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const { applicationId } = await context.params;
    const response = Response.json({
      events: await listApplicationTimeline(session, applicationId),
    });
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch (error) {
    return timelineError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const { applicationId } = await context.params;
    const event = await createApplicationTimelineEvent(
      session,
      applicationId,
      await readBoundedJson(request, MAX_TIMELINE_EVENT_BYTES),
    );
    const response = Response.json(event, { status: 201 });
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch (error) {
    return timelineError(error);
  }
}

function timelineError(error: unknown) {
  if (error instanceof PayloadTooLargeError)
    return new Response('Timeline event payload too large.', { status: 413 });
  if (error instanceof ApplicationTimelineNotFoundError)
    return new Response('Not found', { status: 404 });
  if (error instanceof ZodError)
    return new Response('Timeline event rejected.', { status: 400 });
  return new Response('Application timeline unavailable.', { status: 503 });
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
