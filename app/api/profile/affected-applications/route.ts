import { z, ZodError } from 'zod';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import { readAffectedApplications } from '@/lib/server/profile';
import {
  isSameOrigin,
  readBoundedJson,
  PayloadTooLargeError,
} from '@/lib/server/http';

// Read-only POST keeps private wording out of URL/history/access logs.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  try {
    const session = await authenticatedPublicationSession(request);
    if (!session) return new Response('Unauthorized', { status: 401 });
    const { statement } = z
      .object({ statement: z.string().min(1).max(5000) })
      .strict()
      .parse(await readBoundedJson(request, 32 * 1024));
    return Response.json(
      { applications: await readAffectedApplications(session, statement) },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    return new Response('Application lookup unavailable.', {
      status:
        error instanceof PayloadTooLargeError
          ? 413
          : error instanceof ZodError
            ? 400
            : 503,
    });
  }
}
