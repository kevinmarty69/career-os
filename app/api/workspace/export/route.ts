import { authenticatedPublicationSession } from '@/lib/server/auth';
import { isSameOrigin } from '@/lib/server/http';
import {
  exportWorkspace,
  WorkspaceExportBusyError,
  WorkspaceExportRejectedError,
  WorkspaceExportSessionNotFreshError,
} from '@/lib/server/workspace-export';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  let session;
  try {
    session = await authenticatedPublicationSession(request);
  } catch {
    return new Response('Authentication unavailable.', { status: 503 });
  }
  if (!session) return new Response('Unauthorized', { status: 401 });
  try {
    const exported = await exportWorkspace(session);
    return new Response(exported.body, {
      headers: {
        'cache-control': 'private, no-store',
        'content-disposition': `attachment; filename="${exported.filename}"`,
        'content-type': 'application/x-ndjson; charset=utf-8',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof WorkspaceExportSessionNotFreshError)
      return new Response('Recent authentication required.', { status: 403 });
    if (error instanceof WorkspaceExportRejectedError)
      return new Response('Workspace export rejected.', { status: 403 });
    if (error instanceof WorkspaceExportBusyError)
      return new Response('Workspace export already running.', {
        status: 409,
        headers: { 'retry-after': '30' },
      });
    return new Response('Workspace export unavailable.', { status: 503 });
  }
}
