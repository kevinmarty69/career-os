import assert from 'node:assert/strict';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import test from 'node:test';
import type {
  RecruiterStrategyInput,
  RecruiterStrategyModelOutput,
} from '../../lib/recruiter-strategy';
import { LocalModelClientError } from '../../lib/server/local-openai-client';
import {
  LocalOpenAIRecruiterStrategyClient,
  RECRUITER_STRATEGY_MAX_OUTPUT_TOKENS,
  RECRUITER_STRATEGY_RUN_TOKEN_BUDGET,
} from '../../lib/server/local-openai-strategy-client';

const input: RecruiterStrategyInput = {
  schemaVersion: 1,
  purpose: 'application',
  profileSnapshotId: '10000000-0000-4000-8000-000000000001',
  researchArtifactId: '20000000-0000-4000-8000-000000000001',
  researchArtifactHash: 'a'.repeat(64),
  evidenceArchiveArtifactId: '30000000-0000-4000-8000-000000000001',
  evidenceArchiveArtifactHash: 'b'.repeat(64),
  company: 'Northstar Labs',
  role: 'Senior Product Engineer',
  signals: [
    {
      signalId: 'signal-1',
      statement: 'Own reliable production systems.',
      excerpt: 'Operate reliable production systems.',
      category: 'responsibility',
      priority: 'high',
      coverage: 'verified_candidate',
      matches: [
        {
          claimId: '40000000-0000-4000-8000-000000000001',
          statement: 'Built and operated reliable production systems.',
          provenance: 'verified',
          evidence: [
            {
              evidenceId: '50000000-0000-4000-8000-000000000001',
              label: 'Production review',
              excerpt: 'Reliable production systems were operated end to end.',
            },
          ],
        },
      ],
    },
    {
      signalId: 'signal-2',
      statement: 'Operate Kubernetes clusters.',
      excerpt: 'Kubernetes operations are required.',
      category: 'requirement',
      priority: 'medium',
      coverage: 'unmatched',
      matches: [],
    },
  ],
};

const strategy: RecruiterStrategyModelOutput = {
  positioning: {
    message: 'Lead with demonstrated ownership of reliable production systems.',
    sourceSignalIds: ['signal-1'],
  },
  lead: {
    signalId: 'signal-1',
    claimId: '40000000-0000-4000-8000-000000000001',
    evidenceIds: ['50000000-0000-4000-8000-000000000001'],
    rationale: 'This is the strongest direct proof of production ownership.',
  },
  supports: [],
  gaps: [
    {
      signalId: 'signal-2',
      treatment: 'interview_topic',
      rationale: 'Clarify the required Kubernetes operating depth.',
    },
  ],
  omittedSignalIds: [],
};

test('returns a validated artifact with authoritative local usage', async () => {
  const secret = 'strategy-secret-sentinel';
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
      const result = await client.generate(input, { maxOutputTokens: 128 });
      const request = JSON.parse(requestBody);
      assert.equal(authorization, `Bearer ${secret}`);
      assert.equal(request.response_format.type, 'json_schema');
      assert.equal(request.response_format.json_schema.strict, true);
      assert.match(request.messages[0].content, /not facts or final page copy/);
      assert.equal(result.output.copyPolicy, 'internal-editorial-direction');
      assert.equal(result.output.lead.claimId, strategy.lead.claimId);
      assert.equal(result.usage.inputTokens, 25);
      assert.equal(result.usage.outputTokens, 40);
      assert.equal(result.usage.costMicros, 0);
      assert.equal(result.provider, 'openai-compatible-local');
      assert.equal(result.model, 'local-strategy-model');
      assert.equal(result.providerRequestId, 'strategy-request-1');
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
        clientFor(baseUrl).generate(input),
        hasCode('PROVIDER_UNAVAILABLE'),
      );
      assert.equal(redirectedHits, 0);
    },
  );
});

test('bounds timeout and response body size', async (context) => {
  await context.test('timeout', async () => {
    await withServer(
      () => undefined,
      async (baseUrl) => {
        await assert.rejects(
          clientFor(baseUrl, { timeoutMs: 20 }).generate(input),
          hasCode('TIMEOUT'),
        );
      },
    );
  });
  await context.test('response body', async () => {
    await withServer(
      (_request, response) => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('x'.repeat(2_048));
      },
      async (baseUrl) => {
        await assert.rejects(
          clientFor(baseUrl, { maxResponseBytes: 1_024 }).generate(input),
          hasCode('RESPONSE_TOO_LARGE'),
        );
      },
    );
  });
});

test('rejects malformed, ungrounded and PageSpec-like model output', async (context) => {
  const cases: Array<[string, string]> = [
    ['malformed', '{not-json'],
    [
      'ungrounded',
      JSON.stringify({
        ...strategy,
        lead: { ...strategy.lead, claimId: crypto.randomUUID() },
      }),
    ],
    ['PageSpec', JSON.stringify({ ...strategy, blocks: [{ type: 'fit' }] })],
  ];
  for (const [name, content] of cases)
    await context.test(name, async () => {
      await withServer(
        (_request, response) => {
          const envelope = successfulEnvelope();
          envelope.choices[0].message.content = content;
          json(response, envelope);
        },
        async (baseUrl) => {
          await assert.rejects(
            clientFor(baseUrl).generate(input),
            hasCode('INVALID_RESPONSE'),
          );
        },
      );
    });
});

test('rejects missing, negative and excessive usage', async (context) => {
  const cases: Array<[string, unknown]> = [
    ['missing', undefined],
    ['negative', { prompt_tokens: -1, completion_tokens: 40 }],
    ['excessive', { prompt_tokens: 25, completion_tokens: 769 }],
  ];
  for (const [name, usage] of cases)
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
            clientFor(baseUrl).generate(input),
            hasCode('USAGE_INVALID'),
          );
        },
      );
    });
});

test('never reflects credentials or provider content in errors', async () => {
  const secret = 'never-leak-strategy-key';
  const providerSecret = 'never-leak-strategy-response';
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
        await clientFor(baseUrl, { apiKey: secret }).generate(input);
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

test('reserves within the declared zero-cost run budget', () => {
  const client = clientFor('http://127.0.0.1:11434/v1');
  const reservation = client.reserve(
    input,
    RECRUITER_STRATEGY_MAX_OUTPUT_TOKENS,
  );
  assert.ok(reservation.tokens <= RECRUITER_STRATEGY_RUN_TOKEN_BUDGET);
  assert.equal(reservation.costMicros, 0);
});

function clientFor(
  baseUrl: string,
  overrides: {
    apiKey?: string;
    timeoutMs?: number;
    maxResponseBytes?: number;
  } = {},
) {
  return new LocalOpenAIRecruiterStrategyClient({
    baseUrl,
    apiKey: overrides.apiKey ?? 'local-strategy-key',
    model: 'local-strategy-model',
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
    id: 'strategy-request-1',
    object: 'chat.completion',
    created: 1_788_400_000,
    model: 'local-strategy-model',
    system_fingerprint: null,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: JSON.stringify(strategy),
          refusal: null,
        },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 25, completion_tokens: 40, total_tokens: 65 },
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
