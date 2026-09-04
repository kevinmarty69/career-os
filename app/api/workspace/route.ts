import { ZodError } from 'zod';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import {
  isSameOrigin,
  PayloadTooLargeError,
  readBoundedJson,
} from '@/lib/server/http';
import {
  deleteWorkspace,
  WorkspaceDeletionRejectedError,
  WorkspaceSessionNotFreshError,
} from '@/lib/server/workspace';

const MAX_DELETE_WORKSPACE_BYTES = 1024;

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  let session;
  try {
    session = await authenticatedPublicationSession(request);
  } catch {
    return new Response('Authentication unavailable.', { status: 503 });
  }
  if (!session) return new Response('Unauthorized', { status: 401 });
  try {
    await deleteWorkspace(
      session,
      await readBoundedJson(request, MAX_DELETE_WORKSPACE_BYTES),
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof PayloadTooLargeError)
      return new Response('Workspace deletion payload too large.', {
        status: 413,
      });
    if (
      error instanceof ZodError ||
      error instanceof WorkspaceDeletionRejectedError
    )
      return new Response('Workspace deletion rejected.', { status: 400 });
    if (error instanceof WorkspaceSessionNotFreshError)
      return new Response('Recent authentication required.', { status: 403 });
    return new Response('Workspace deletion unavailable.', { status: 503 });
  }
}
