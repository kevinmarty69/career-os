import { ZodError } from 'zod';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import {
  ApplicationTaskConflictError,
  ApplicationTaskNotFoundError,
  updateApplicationTask,
} from '@/lib/server/application-tasks';
import {
  isSameOrigin,
  PayloadTooLargeError,
  readBoundedJson,
} from '@/lib/server/http';

const MAX_TASK_UPDATE_BYTES = 1024;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ applicationId: string; taskId: string }> },
) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const { applicationId, taskId } = await context.params;
    const task = await updateApplicationTask(
      session,
      applicationId,
      taskId,
      await readBoundedJson(request, MAX_TASK_UPDATE_BYTES),
    );
    const response = Response.json(task);
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch (error) {
    if (error instanceof PayloadTooLargeError)
      return new Response('Task update too large.', { status: 413 });
    if (error instanceof ApplicationTaskConflictError)
      return new Response('Task changed in another session.', { status: 409 });
    if (error instanceof ApplicationTaskNotFoundError)
      return new Response('Not found', { status: 404 });
    if (error instanceof ZodError)
      return new Response('Task update rejected.', { status: 400 });
    return new Response('Application task unavailable.', { status: 503 });
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
