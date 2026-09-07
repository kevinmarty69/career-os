import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LocalModelClientError,
  LocalOpenAITransport,
  localModelResponseSchema,
} from '../../lib/server/local-openai-transport';

test('shared transport rejects excessive headers and invalid streamed UTF-8, cancelling rejected bodies', async (t) => {
  const transport = new LocalOpenAITransport(
    {
      baseUrl: 'http://127.0.0.1:9999/v1',
      apiKey: 'local-only',
      model: 'fixture',
    },
    1024,
  );
  const fetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = fetch;
  });
  for (const invalidHeaders of [
    { 'x-oversized': 'x'.repeat(16 * 1024) },
    Object.fromEntries(
      Array.from({ length: 65 }, (_, index) => [`x-${index}`, 'v']),
    ),
  ]) {
    let cancelled = false;
    globalThis.fetch = async () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
        {
          headers: { 'content-type': 'application/json', ...invalidHeaders },
        },
      );
    await assert.rejects(
      transport.request('{}', {
        maxOutputTokens: 1,
        schema: localModelResponseSchema({ maxContentChars: 100 }),
      }),
      (error: unknown) =>
        error instanceof LocalModelClientError &&
        error.code === 'INVALID_RESPONSE',
    );
    assert.equal(cancelled, true);
  }
  globalThis.fetch = async () =>
    new Response(new Uint8Array([0xff]), {
      headers: { 'content-type': 'application/json' },
    });
  await assert.rejects(
    transport.request('{}', {
      maxOutputTokens: 1,
      schema: localModelResponseSchema({ maxContentChars: 100 }),
    }),
    (error: unknown) =>
      error instanceof LocalModelClientError &&
      error.code === 'INVALID_RESPONSE',
  );
});
