import assert from 'node:assert/strict';
import test from 'node:test';
import dns from 'node:dns/promises';
import { syncBuiltinESMExports } from 'node:module';
import {
  LocalModelClientError,
  LocalOpenAITransport,
  localModelResponseSchema,
  serverModelConfig,
  modelRunCostBudget,
} from '../../lib/server/local-openai-transport';

test('remote model opt-in requires HTTPS, a public destination, explicit rates and a cost ceiling', () => {
  const config = {
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'operator-private-key',
    model: 'fixture',
    remote: true,
    inputMicrosPerToken: 0.5,
    outputMicrosPerToken: 2,
    maxRequestCostMicros: 10_000,
  };
  const transport = new LocalOpenAITransport(config, 1024);
  assert.equal(transport.provider, 'openai-compatible-remote');
  assert.doesNotMatch(JSON.stringify(transport), /operator-private-key/);
  assert.deepEqual(transport.reserve('{}', 10), {
    tokens: 268,
    costMicros: 536,
  });
  for (const override of [
    { remote: false },
    { inputMicrosPerToken: undefined },
    { outputMicrosPerToken: undefined },
    { maxRequestCostMicros: undefined },
    { apiKey: 'local-only' },
    ...[
      'http://api.example.com/v1',
      'https://127.0.0.1/v1',
      'https://169.254.169.254/',
      'https://[::1]/',
      'https://192.168.1.2/',
      'https://model.internal/',
      'https://api.example.com:8443/',
      'https://secret@api.example.com/',
      'https://api.example.com/?key=x',
    ].map((baseUrl) => ({ baseUrl })),
  ])
    assert.throws(
      () => new LocalOpenAITransport({ ...config, ...override }, 1024),
      LocalModelClientError,
    );
  assert.throws(() =>
    new LocalOpenAITransport(
      { ...config, maxRequestCostMicros: 1 },
      1024,
    ).reserve('{}', 10),
  );
  assert.throws(() =>
    modelRunCostBudget({ CAREER_OS_MODEL_RUN_COST_BUDGET_MICROS: '-1' }),
  );
  assert.throws(() => serverModelConfig({ CAREER_OS_MODEL_MODE: 'auto' }));
  assert.equal(modelRunCostBudget({}), 0);
  assert.equal(
    serverModelConfig({ CAREER_OS_MODEL_MODE: 'remote' }).apiKey,
    '',
  );
});

test('priced usage is rounded up and bounded; standard provider metadata is ignored, not trusted', async (t) => {
  const transport = new LocalOpenAITransport(
    {
      baseUrl: 'http://127.0.0.1:9999/v1',
      apiKey: 'fixture',
      model: 'fixture',
      inputMicrosPerToken: 0.5,
      outputMicrosPerToken: 2,
      maxRequestCostMicros: 10_000,
    },
    1024,
  );
  const fetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = fetch;
  });
  globalThis.fetch = async () =>
    Response.json({
      choices: [
        {
          message: { content: '{}', annotations: [] },
          finish_reason: 'stop',
          logprobs: null,
        },
      ],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 3,
        total_tokens: 14,
        completion_tokens_details: { reasoning_tokens: 0 },
      },
      service_tier: 'default',
    });
  const result = await transport.request('{}', {
    maxOutputTokens: 10,
    schema: localModelResponseSchema({ maxContentChars: 100 }),
  });
  assert.equal(result.usage.costMicros, 12);
  assert.equal(result.usage.reservedCostMicros, 536);
  assert.ok(result.usage.costMicros <= result.usage.reservedCostMicros);
});

test('remote DNS mixed/private records are rejected before any credential-bearing connection', async (t) => {
  const original = dns.lookup;
  t.after(() => {
    dns.lookup = original;
    syncBuiltinESMExports();
  });
  dns.lookup = (async () => [
    { address: '8.8.8.8', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ]) as unknown as typeof dns.lookup;
  syncBuiltinESMExports();
  const transport = new LocalOpenAITransport(
    {
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret-never-sent',
      model: 'fixture',
      remote: true,
      inputMicrosPerToken: 0,
      outputMicrosPerToken: 0,
      maxRequestCostMicros: 0,
    },
    1024,
  );
  await assert.rejects(
    transport.request('{}', {
      maxOutputTokens: 10,
      schema: localModelResponseSchema({ maxContentChars: 100 }),
    }),
    (error: unknown) =>
      error instanceof LocalModelClientError && error.code === 'INVALID_CONFIG',
  );
});

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
