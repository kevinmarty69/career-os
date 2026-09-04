import { ZodError } from 'zod';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import {
  deleteSearchProfile,
  readSearchProfile,
  SearchProfileConflictError,
  SearchProfileNotFoundError,
  updateSearchProfile,
} from '@/lib/server/search-profiles';
import {
  isSameOrigin,
  PayloadTooLargeError,
  readBoundedJson,
} from '@/lib/server/http';

const MAX_SEARCH_PROFILE_BYTES = 24 * 1024;

export async function GET(
  request: Request,
  context: { params: Promise<{ searchProfileId: string }> },
) {
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const { searchProfileId } = await context.params;
    const searchProfile = await readSearchProfile(session, searchProfileId);
    if (!searchProfile) return new Response('Not found', { status: 404 });
    const response = Response.json(searchProfile);
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch (error) {
    return searchProfileError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ searchProfileId: string }> },
) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const { searchProfileId } = await context.params;
    const searchProfile = await updateSearchProfile(
      session,
      searchProfileId,
      await readBoundedJson(request, MAX_SEARCH_PROFILE_BYTES),
    );
    const response = Response.json(searchProfile);
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch (error) {
    return searchProfileError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ searchProfileId: string }> },
) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const { searchProfileId } = await context.params;
    await deleteSearchProfile(
      session,
      searchProfileId,
      await readBoundedJson(request, MAX_SEARCH_PROFILE_BYTES),
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    return searchProfileError(error);
  }
}

function searchProfileError(error: unknown) {
  if (error instanceof PayloadTooLargeError)
    return new Response('Search profile payload too large.', { status: 413 });
  if (error instanceof SearchProfileConflictError)
    return new Response('Search profile changed in another session.', {
      status: 409,
    });
  if (error instanceof SearchProfileNotFoundError)
    return new Response('Not found', { status: 404 });
  if (error instanceof ZodError)
    return new Response('Search profile rejected.', { status: 400 });
  return new Response('Search profiles unavailable.', { status: 503 });
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
