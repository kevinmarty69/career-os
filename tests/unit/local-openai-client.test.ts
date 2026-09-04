import assert from 'node:assert/strict';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import test from 'node:test';
import {
  COMPANY_RESEARCH_MAX_OUTPUT_TOKENS,
  COMPANY_RESEARCH_RUN_TOKEN_BUDGET,
  LocalModelClientError,
  LocalOpenAICompanyResearchClient,
} from '../../lib/server/local-openai-client';

const offer = {
  company: 'Northstar Labs',
  role: 'Senior Product Engineer',
  description: 'Build dependable product workflows.',
  sourceUrl: 'https://jobs.example.test/product-engineer',
};

const sourcedOffer = {
  schemaVersion: 2 as const,
  company: 'Northstar Labs',
  role: 'Senior Product Engineer',
  documents: [
    {
      sourceId: 'job-posting',
      kind: 'job' as const,
      text: 'Build dependable product workflows.',
    },
    {
      sourceId: 'company-values',
      kind: 'company-web' as const,
      text: 'We write down decisions and learn from production.',
    },
  ],
};

test('returns strict company research with authoritative local usage', async () => {
  const secret = 'sentinel-local-key';
  let requestBody = '';
  let authorization = '';
  await withServer(
    async (request, response) => {
      authorization = request.headers.authorization ?? '';
      requestBody = await readRequest(request);
      json(response, successfulEnvelope());
    },
    async (baseUrl) => {
      const client = clientFor(baseUrl, { apiKey: secret });
      assert.doesNotMatch(JSON.stringify(client), new RegExp(secret));
      assert.equal(client.provider, 'openai-compatible-local');
      assert.equal(client.model, 'local-test-model');
      const result = await client.generate(offer, { maxOutputTokens: 64 });
      assert.equal(authorization, `Bearer ${secret}`);
      assert.equal(JSON.parse(requestBody).response_format.type, 'json_schema');
      assert.deepEqual(result.output, {
        signals: [
          {
            statement: 'Own delivery from discovery to production.',
            excerpt: 'Build dependable product workflows.',
            category: 'responsibility',
            priority: 'high',
          },
        ],
      });
      assert.equal(result.usage.inputTokens, 12);
      assert.equal(result.usage.outputTokens, 8);
      assert.equal(result.usage.costMicros, 0);
      assert.equal(result.provider, 'openai-compatible-local');
      assert.equal(result.model, 'local-test-model');
      assert.equal(result.providerRequestId, 'local-request-1');
    },
  );
});

test('returns v2 signals sourced to the exact supplied document', async () => {
  let requestBody = '';
  await withServer(
    async (request, response) => {
      requestBody = await readRequest(request);
      const envelope = successfulEnvelope();
      envelope.choices[0].message.content = JSON.stringify({
        signals: [
          {
            statement: 'The team values explicit operating decisions.',
            sourceId: 'company-values',
            excerpt: 'write down decisions',
            category: 'culture',
            priority: 'medium',
          },
        ],
      });
      json(response, envelope);
    },
    async (baseUrl) => {
      const result = await clientFor(baseUrl).generate(sourcedOffer, {
        maxOutputTokens: 64,
      });
      const body = JSON.parse(requestBody);
      assert.deepEqual(JSON.parse(body.messages[1].content), sourcedOffer);
      assert.ok(
        body.response_format.json_schema.schema.properties.signals.items.required.includes(
          'sourceId',
        ),
      );
      assert.deepEqual(result.output.signals, [
        {
          statement: 'The team values explicit operating decisions.',
          sourceId: 'company-values',
          excerpt: 'write down decisions',
          category: 'culture',
          priority: 'medium',
        },
      ]);
    },
  );
});

test('rejects redirects without following them', async () => {
  let redirectedHits = 0;
  await withServer(
    (request, response) => {
      if (request.url === '/redirected') {
        redirectedHits += 1;
        json(response, successfulEnvelope());
        return;
      }
      response.writeHead(302, { location: '/redirected' });
      response.end();
    },
    async (baseUrl) => {
      await assert.rejects(
        clientFor(baseUrl).generate(offer),
        hasCode('PROVIDER_UNAVAILABLE'),
      );
      assert.equal(redirectedHits, 0);
    },
  );
});

test('times out a stalled local provider', async () => {
  await withServer(
    () => undefined,
    async (baseUrl) => {
      await assert.rejects(
        clientFor(baseUrl, { timeoutMs: 20 }).generate(offer),
        hasCode('TIMEOUT'),
      );
    },
  );
});

test('rejects a response body above the configured cap', async () => {
  await withServer(
    (_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('x'.repeat(2_048));
    },
    async (baseUrl) => {
      await assert.rejects(
        clientFor(baseUrl, { maxResponseBytes: 1_024 }).generate(offer),
        hasCode('RESPONSE_TOO_LARGE'),
      );
    },
  );
});

test('rejects malformed JSON without reflecting it', async () => {
  await withServer(
    (_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{invalid-json');
    },
    async (baseUrl) => {
      await assert.rejects(
        clientFor(baseUrl).generate(offer),
        hasCode('INVALID_RESPONSE'),
      );
    },
  );
});

test('rejects model output outside the signals-only contract', async () => {
  await withServer(
    (_request, response) => {
      const envelope = successfulEnvelope();
      envelope.choices[0].message.content = JSON.stringify({
        company: offer.company,
        signals: [],
      });
      json(response, envelope);
    },
    async (baseUrl) => {
      await assert.rejects(
        clientFor(baseUrl).generate(offer),
        hasCode('INVALID_RESPONSE'),
      );
    },
  );
});

test('rejects excerpts that are not present in the immutable offer', async () => {
  await withServer(
    (_request, response) => {
      const envelope = successfulEnvelope();
      envelope.choices[0].message.content = JSON.stringify({
        signals: [
          {
            statement: 'An invented requirement.',
            excerpt: 'Operate a fleet of autonomous robots.',
            category: 'requirement',
            priority: 'high',
          },
        ],
      });
      json(response, envelope);
    },
    async (baseUrl) => {
      await assert.rejects(
        clientFor(baseUrl).generate(offer),
        hasCode('INVALID_RESPONSE'),
      );
    },
  );
});

test('rejects v2 signals without a source ID', async () => {
  await withServer(
    (_request, response) => json(response, successfulEnvelope()),
    async (baseUrl) => {
      await assert.rejects(
        clientFor(baseUrl).generate(sourcedOffer),
        hasCode('INVALID_RESPONSE'),
      );
    },
  );
});

test('rejects a v2 excerpt that belongs to a different document', async () => {
  await withServer(
    (_request, response) => {
      const envelope = successfulEnvelope();
      envelope.choices[0].message.content = JSON.stringify({
        signals: [
          {
            statement: 'An incorrectly attributed signal.',
            sourceId: 'company-values',
            excerpt: 'Build dependable product workflows.',
            category: 'responsibility',
            priority: 'high',
          },
        ],
      });
      json(response, envelope);
    },
    async (baseUrl) => {
      await assert.rejects(
        clientFor(baseUrl).generate(sourcedOffer),
        hasCode('INVALID_RESPONSE'),
      );
    },
  );
});

test('bounds and uniquely identifies v2 source documents', () => {
  const client = clientFor('http://127.0.0.1:11434/v1');
  const invalidDocuments = [
    sourcedOffer.documents.filter(({ kind }) => kind === 'company-web'),
    [...sourcedOffer.documents, { ...sourcedOffer.documents[0] }],
    [
      sourcedOffer.documents[0],
      ...Array.from({ length: 4 }, (_, index) => ({
        sourceId: `company-${index}`,
        kind: 'company-web' as const,
        text: `Company page ${index}`,
      })),
    ],
  ];
  for (const documents of invalidDocuments)
    assert.throws(
      () => client.reserve({ ...sourcedOffer, documents }),
      hasCode('INVALID_INPUT'),
    );
});

test('the run budget covers the largest valid UTF-8 request', () => {
  const client = clientFor('http://127.0.0.1:11434/v1');
  const reservation = client.reserve(
    {
      company: 'é'.repeat(200),
      role: 'é'.repeat(200),
      description: 'é'.repeat(20_000),
      sourceUrl: `https://example.test/${'x'.repeat(2_000)}`,
    },
    COMPANY_RESEARCH_MAX_OUTPUT_TOKENS,
  );
  assert.ok(reservation.tokens <= COMPANY_RESEARCH_RUN_TOKEN_BUDGET);
});

test('rejects missing, negative and excessive usage', async (context) => {
  const cases: Array<[string, unknown]> = [
    ['missing', undefined],
    ['negative', { prompt_tokens: -1, completion_tokens: 8 }],
    ['excessive', { prompt_tokens: 12, completion_tokens: 513 }],
  ];
  for (const [name, usage] of cases) {
    await context.test(name, async () => {
      await withServer(
        (_request, response) => {
          const envelope = successfulEnvelope() as Record<string, unknown>;
          if (usage === undefined) delete envelope.usage;
          else envelope.usage = usage;
          json(response, envelope);
        },
        async (baseUrl) => {
          await assert.rejects(
            clientFor(baseUrl).generate(offer),
            hasCode('USAGE_INVALID'),
          );
        },
      );
    });
  }
});

test('never includes secrets or provider content in errors', async () => {
  const secret = 'never-leak-this-key';
  const providerSecret = 'never-leak-this-response';
  await withServer(
    (_request, response) => {
      response.writeHead(500, {
        'content-type': 'application/json',
        'x-provider-detail': providerSecret,
      });
      response.end(JSON.stringify({ error: providerSecret }));
    },
    async (baseUrl) => {
      let caught: unknown;
      try {
        await clientFor(baseUrl, { apiKey: secret }).generate(offer);
      } catch (error) {
        caught = error;
      }
      assert.ok(caught instanceof LocalModelClientError);
      const rendered = `${caught.name}: ${caught.message}\n${caught.stack ?? ''}`;
      assert.doesNotMatch(rendered, new RegExp(secret));
      assert.doesNotMatch(rendered, new RegExp(providerSecret));
      assert.equal(caught.message, 'Local model request failed.');
    },
  );
});

test('accepts only credential-free loopback HTTP endpoints', () => {
  for (const baseUrl of [
    'https://models.example.com/v1',
    'file:///tmp/model',
    'http://user:pass@127.0.0.1:11434/v1',
  ])
    assert.throws(() => clientFor(baseUrl), hasCode('INVALID_CONFIG'));
});

function clientFor(
  baseUrl: string,
  overrides: {
    apiKey?: string;
    timeoutMs?: number;
    maxResponseBytes?: number;
  } = {},
) {
  return new LocalOpenAICompanyResearchClient({
    baseUrl,
    apiKey: overrides.apiKey ?? 'local-test-key',
    model: 'local-test-model',
    ...(overrides.timeoutMs === undefined
      ? {}
      : { timeoutMs: overrides.timeoutMs }),
    ...(overrides.maxResponseBytes === undefined
      ? {}
      : { maxResponseBytes: overrides.maxResponseBytes }),
  });
}

function successfulEnvelope() {
  return {
    id: 'local-request-1',
    object: 'chat.completion',
    created: 1_788_400_000,
    model: 'local-test-model',
    system_fingerprint: null,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: JSON.stringify({
            signals: [
              {
                statement: 'Own delivery from discovery to production.',
                excerpt: 'Build dependable product workflows.',
                category: 'responsibility',
                priority: 'high',
              },
            ],
          }),
          refusal: null,
        },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
  };
}

function hasCode(code: LocalModelClientError['code']) {
  return (error: unknown) =>
    error instanceof LocalModelClientError && error.code === code;
}

async function withServer(
  handler: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => void | Promise<void>,
  run: (baseUrl: string) => Promise<void>,
) {
  const server = createServer((request, response) => {
    void Promise.resolve(handler(request, response)).catch(() => {
      response.destroy();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    await run(`http://127.0.0.1:${address.port}/v1`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

async function readRequest(request: IncomingMessage) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return body;
}

function json(response: ServerResponse, body: unknown) {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}
