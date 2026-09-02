import { ZodError, z } from 'zod';
import {
  extractJobPostingFromHtml,
  JobPostingExtractionError,
  jobPostingImportResponseSchema,
} from '@/lib/job-posting-extractor';
import { authenticatedPublicationSession } from '@/lib/server/auth';
import {
  isSameOrigin,
  PayloadTooLargeError,
  readBoundedJson,
} from '@/lib/server/http';
import { SafeHttpError, safeFetchText } from '@/lib/server/safe-http';
import {
  finishUrlImport,
  reserveUrlImport,
  UrlImportRateLimitError,
} from '@/lib/server/url-imports';

export const runtime = 'nodejs';
export const maxDuration = 10;

const MAX_IMPORT_BYTES = 4_096;
const inputSchema = z.object({ url: z.string().min(1).max(2_048) }).strict();

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return response('Forbidden', 403);
  const session = await authenticate(request);
  if (session instanceof Response) return session;

  let attemptId: string | undefined;
  let outcome: 'succeeded' | 'rejected' | 'failed' = 'failed';
  try {
    const { url } = inputSchema.parse(
      await readBoundedJson(request, MAX_IMPORT_BYTES),
    );
    attemptId = await reserveUrlImport(session);
    const fetched = await safeFetchText(url);
    const extraction = extractJobPostingFromHtml(
      fetched.text,
      fetched.finalUrl,
    );
    outcome = 'succeeded';
    const result = Response.json(
      jobPostingImportResponseSchema.parse({
        ...extraction,
        provenance: {
          requestedUrl: fetched.requestedUrl,
          finalUrl: fetched.finalUrl,
          fetchedAt: new Date().toISOString(),
          contentType: fetched.contentType,
          bytes: fetched.bytes,
          trust: 'untrusted-data',
        },
      }),
    );
    result.headers.set('cache-control', 'private, no-store');
    return result;
  } catch (error) {
    outcome =
      error instanceof ZodError ||
      error instanceof PayloadTooLargeError ||
      error instanceof JobPostingExtractionError ||
      (error instanceof SafeHttpError &&
        ['INVALID_URL', 'BLOCKED_DESTINATION', 'REDIRECT_REJECTED'].includes(
          error.code,
        ))
        ? 'rejected'
        : 'failed';
    return importError(error);
  } finally {
    if (attemptId) {
      try {
        await finishUrlImport(session, attemptId, outcome);
      } catch {
        // The response must not expose storage internals; stale attempts expire in 15s.
      }
    }
  }
}

function importError(error: unknown) {
  if (error instanceof UrlImportRateLimitError)
    return response('Too many import attempts.', 429, { 'retry-after': '60' });
  if (error instanceof PayloadTooLargeError)
    return response('Import payload too large.', 413);
  if (error instanceof ZodError)
    return response('Invalid import request.', 400);
  if (error instanceof JobPostingExtractionError)
    return response('Job posting not found.', 422);
  if (error instanceof SafeHttpError) {
    if (error.code === 'RESPONSE_TOO_LARGE')
      return response('Remote page too large.', 413);
    if (error.code === 'UNSUPPORTED_CONTENT')
      return response('Unsupported remote content.', 415);
    if (error.code === 'TIMEOUT')
      return response('Remote page timed out.', 504);
    if (
      ['INVALID_URL', 'BLOCKED_DESTINATION', 'REDIRECT_REJECTED'].includes(
        error.code,
      )
    )
      return response('Remote URL rejected.', 400);
  }
  return response('Import unavailable.', 503);
}

async function authenticate(request: Request) {
  try {
    return (
      (await authenticatedPublicationSession(request)) ??
      response('Unauthorized', 401)
    );
  } catch {
    return response('Authentication unavailable.', 503);
  }
}

function response(body: string, status: number, headers?: HeadersInit) {
  return new Response(body, {
    status,
    headers: { 'cache-control': 'private, no-store', ...headers },
  });
}
