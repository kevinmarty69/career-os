import { ZodError, z } from 'zod';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import {
  isSameOrigin,
  PayloadTooLargeError,
  readBoundedJson,
} from '@/lib/server/http';
import {
  ProfileConflictError,
  readLivingProfile,
  saveLivingProfile,
} from '@/lib/server/profile';

const MAX_PROFILE_BYTES = 512 * 1024;
const saveSchema = z
  .object({
    profile: z.unknown(),
    expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export async function GET(request: Request) {
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const result = await readLivingProfile(session);
    const response = Response.json(result ?? { profile: null, revision: 0 });
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch {
    return new Response('Career Memory unavailable.', { status: 503 });
  }
}

export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const input = saveSchema.parse(
      await readBoundedJson(request, MAX_PROFILE_BYTES),
    );
    const result = await saveLivingProfile(
      session,
      input.profile,
      input.expectedRevision,
    );
    const response = Response.json(result);
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch (error) {
    if (error instanceof PayloadTooLargeError)
      return new Response('Career Memory payload too large.', { status: 413 });
    if (error instanceof ProfileConflictError)
      return new Response('Career Memory changed in another session.', {
        status: 409,
      });
    if (error instanceof ZodError)
      return new Response('Career Memory rejected.', { status: 400 });
    return new Response('Career Memory unavailable.', { status: 503 });
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
