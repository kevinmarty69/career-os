import { ZodError } from 'zod';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import {
  createSearchProfile,
  listSearchProfiles,
  SearchProfileConflictError,
} from '@/lib/server/search-profiles';
import {
  isSameOrigin,
  PayloadTooLargeError,
  readBoundedJson,
} from '@/lib/server/http';

const MAX_SEARCH_PROFILE_BYTES = 24 * 1024;

export async function GET(request: Request) {
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const response = Response.json({
      searchProfiles: await listSearchProfiles(session),
    });
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch {
    return new Response('Search profiles unavailable.', { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const session = await authenticate(request);
  if (session instanceof Response) return session;
  try {
    const searchProfile = await createSearchProfile(
      session,
      await readBoundedJson(request, MAX_SEARCH_PROFILE_BYTES),
    );
    const response = Response.json(searchProfile, { status: 201 });
    response.headers.set('cache-control', 'private, no-store');
    return response;
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
