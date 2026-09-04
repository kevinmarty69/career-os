export class PayloadTooLargeError extends Error {}

export function isSameOrigin(request: Request) {
  try {
    const configuredUrl = process.env.BETTER_AUTH_URL;
    if (!configuredUrl) return false;
    const expected = new URL(configuredUrl);
    return (
      ['http:', 'https:'].includes(expected.protocol) &&
      request.headers.get('origin') === expected.origin
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
