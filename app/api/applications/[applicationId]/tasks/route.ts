import { ZodError } from 'zod';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import {
  ApplicationTaskNotFoundError,
  createApplicationTask,
  listApplicationTasks,
} from '@/lib/server/application-tasks';
import {
  isSameOrigin,
  PayloadTooLargeError,
  readBoundedJson,
} from '@/lib/server/http';

const MAX_TASK_BYTES = 2 * 1024;

export async function GET(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const { applicationId } = await context.params;
    const response = Response.json({
      tasks: await listApplicationTasks(session, applicationId),
    });
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch (error) {
    return taskError(error);
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
    const task = await createApplicationTask(
      session,
      applicationId,
      await readBoundedJson(request, MAX_TASK_BYTES),
    );
    const response = Response.json(task, { status: 201 });
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch (error) {
    return taskError(error);
  }
}

function taskError(error: unknown) {
  if (error instanceof PayloadTooLargeError)
    return new Response('Task payload too large.', { status: 413 });
  if (error instanceof ApplicationTaskNotFoundError)
    return new Response('Not found', { status: 404 });
  if (error instanceof ZodError)
    return new Response('Task rejected.', { status: 400 });
  return new Response('Application tasks unavailable.', { status: 503 });
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
