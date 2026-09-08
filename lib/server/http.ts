export class PayloadTooLargeError extends Error {}

// Next can normalize the request hostname behind a proxy (including localhost).
// Auth cookies and callback redirects must stay on the configured public origin.
export function applicationOrigin(configured = process.env.CAREER_OS_APP_URL) {
  if (!configured) throw new Error('CAREER_OS_APP_URL is required.');
  const url = new URL(configured);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error('Invalid application origin.');
  return new URL(url.origin);
}

export function authRedirectUrl(
  outcome: 'workspace' | 'callback' | 'confirmation',
) {
  return new URL(
    outcome === 'workspace'
      ? '/sign-in?workspace=1'
      : `/sign-in?error=${outcome}`,
    applicationOrigin(),
  );
}

export function isSameOrigin(request: Request) {
  try {
    return (
      request.headers.get('origin') ===
      applicationOrigin(
        process.env.CAREER_OS_APP_URL ?? process.env.BETTER_AUTH_URL,
      ).origin
    );
  } catch {
    return false;
  }
}

export async function hasRequestBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return false;
      if (value.byteLength) {
        await reader.cancel();
        return true;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function readBoundedJson(request: Request, maximumBytes: number) {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes))
    throw new PayloadTooLargeError();

  const reader = request.body?.getReader();
  if (!reader) return JSON.parse('');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBytes) {
        await reader.cancel();
        throw new PayloadTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body)) as unknown;
}
