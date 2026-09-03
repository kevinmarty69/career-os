import assert from 'node:assert/strict';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import test from 'node:test';
import { REVIEW_INPUT_MAX_BYTES, type ReviewerInput } from '../../lib/reviewer';
import { LocalModelClientError } from '../../lib/server/local-openai-client';
import {
  LocalOpenAIReviewClient,
  REVIEW_MAX_OUTPUT_TOKENS,
  REVIEW_RUN_TOKEN_BUDGET,
} from '../../lib/server/local-openai-review-client';

const claimId = '40000000-0000-4000-8000-000000000001';
const evidenceId = '50000000-0000-4000-8000-000000000001';
const input: ReviewerInput = {
  schemaVersion: 1,
  reviewer: 'recruiter',
  reviewStartId: '70000000-0000-4000-8000-000000000001',
  profileSnapshotId: '10000000-0000-4000-8000-000000000001',
  pageSpecId: '60000000-0000-4000-8000-000000000001',
  pageSpecHash: 'a'.repeat(64),
  pageSpecArtifactId: '80000000-0000-4000-8000-000000000001',
  pageSpecArtifactHash: 'b'.repeat(64),
  candidateName: 'Ada Lovelace',
  company: {
    name: 'Northstar Labs',
    role: 'Senior Product Engineer',
  },
  pageSpec: {
    version: 1,
    company: {
      name: 'Northstar Labs',
      role: 'Senior Product Engineer',
      accent: '#5847e8',
    },
    hero: {
      eyebrow: 'Private application',
      title: 'Ada Lovelace × Northstar Labs',
      thesis: 'Built and operated reliable production systems.',
    },
    blocks: [
      {
        type: 'fit',
        title: 'Relevant experience',
        claimIds: [claimId],
      },
    ],
  },
  proofs: [
    {
      claimId,
      statement: 'Built and operated reliable production systems.',
      provenance: 'verified',
      evidence: [
        {
          evidenceId,
          sourceId: '30000000-0000-4000-8000-000000000001',
          label: 'Production review',
          excerpt: 'Operated reliable production systems end to end.',
        },
      ],
    },
  ],
};

test('returns strict grounded review output with authoritative local usage', async () => {
  const secret = 'review-secret-sentinel';
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
      assert.match(request.messages[0].content, /untrusted data/);
      assert.match(request.messages[0].content, /Do not browse/);
      assert.equal(result.output.reviewer, 'recruiter');
      assert.equal(result.output.verdict, 'changes_required');
      assert.equal(result.output.issues[0].blocking, false);
      assert.equal(result.usage.inputTokens, 25);
      assert.equal(result.usage.outputTokens, 40);
      assert.equal(result.usage.costMicros, 0);
      assert.equal(result.provider, 'openai-compatible-local');
      assert.equal(result.providerRequestId, 'review-request-1');
    },
  );
});

test('rejects redirects, remote endpoints and reviewer mismatches', async () => {
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
  assert.throws(
    () => clientFor('https://models.example.com/v1'),
    hasCode('INVALID_CONFIG'),
  );
  const hiringClient = new LocalOpenAIReviewClient({
    reviewer: 'hiring-manager',
    baseUrl: 'http://127.0.0.1:11434/v1',
    apiKey: 'local-key',
    model: 'local-review-model',
  });
  await assert.rejects(hiringClient.generate(input), hasCode('INVALID_INPUT'));
});

test('bounds response size, output shape and reported usage', async (context) => {
  await context.test('refusal and incomplete generation', async () => {
    for (const mutation of ['refusal', 'length'] as const) {
      await withServer(
        (_request, response) => {
          const envelope = successfulEnvelope();
          if (mutation === 'refusal')
            (
              envelope.choices[0].message as {
                content: string;
                refusal?: string;
              }
            ).refusal = 'I cannot review this.';
          else envelope.choices[0].finish_reason = 'length';
          json(response, envelope);
        },
        async (baseUrl) => {
          await assert.rejects(
            clientFor(baseUrl).generate(input),
            hasCode('INVALID_RESPONSE'),
          );
        },
      );
    }
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
  await context.test('more than five issues', async () => {
    await withServer(
      (_request, response) => {
        const envelope = successfulEnvelope();
        envelope.choices[0].message.content = JSON.stringify({
          issues: Array.from({ length: 6 }, () => ({
            section: 'hero',
            message: 'Shorten the headline.',
            claimId,
            evidenceIds: [evidenceId],
          })),
        });
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
  await context.test('excessive usage', async () => {
    await withServer(
      (_request, response) => {
        const envelope = successfulEnvelope();
        envelope.usage.completion_tokens = 769;
        envelope.usage.total_tokens = 794;
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

test('does not leak credentials or provider bodies through errors', async () => {
  const secret = 'never-leak-review-key';
  const providerSecret = 'never-leak-review-response';
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

test('reserves a bounded zero-cost budget', () => {
  const reservation = clientFor('http://127.0.0.1:11434/v1').reserve(
    input,
    REVIEW_MAX_OUTPUT_TOKENS,
  );
  assert.ok(reservation.tokens <= REVIEW_RUN_TOKEN_BUDGET);
  assert.equal(reservation.costMicros, 0);
});

test('accepts a quote-heavy input without exceeding the request budget', () => {
  const secondClaimId = '40000000-0000-4000-8000-000000000002';
  const special = (length: number) =>
    '\\"'.repeat(Math.ceil(length / 2)).slice(0, length);
  const company = { name: special(200), role: special(200) };
  const proofs: ReviewerInput['proofs'] = [claimId, secondClaimId].map(
    (nextClaimId, index) => ({
      claimId: nextClaimId,
      statement: special(4_500),
      provenance: 'verified',
      evidence: [
        {
          evidenceId: `50000000-0000-4000-8000-00000000000${index + 1}`,
          sourceId: `30000000-0000-4000-8000-00000000000${index + 1}`,
          label: special(500),
          excerpt: special(2_000),
        },
        ...(index === 0
          ? [
              {
                evidenceId: '50000000-0000-4000-8000-000000000003',
                sourceId: '30000000-0000-4000-8000-000000000003',
                label: special(500),
                excerpt: special(1_500),
              },
            ]
          : []),
      ],
    }),
  );
  const quoteHeavyInput: ReviewerInput = {
    ...input,
    candidateName: special(200),
    company,
    pageSpec: {
      ...input.pageSpec,
      company: { ...company, accent: '#5847e8' },
      hero: {
        ...input.pageSpec.hero,
        title: special(403),
        thesis: special(5_000),
      },
      blocks: [
        {
          ...input.pageSpec.blocks[0],
          claimIds: proofs.map((proof) => proof.claimId),
        },
      ],
    },
    proofs,
  };
  const inputBytes = new TextEncoder().encode(
    JSON.stringify(quoteHeavyInput),
  ).byteLength;
  assert.ok(
    inputBytes > REVIEW_INPUT_MAX_BYTES - 1_024,
    `only ${inputBytes} input bytes`,
  );
  for (const reviewer of ['recruiter', 'hiring-manager'] as const) {
    const reviewerInput: ReviewerInput = {
      ...quoteHeavyInput,
      reviewer: reviewer === 'recruiter' ? reviewer : 'hiring_manager',
    };
    const reservation = new LocalOpenAIReviewClient({
      reviewer,
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: 'local-key',
      model: special(200),
    }).reserve(reviewerInput, REVIEW_MAX_OUTPUT_TOKENS);
    assert.ok(reservation.tokens <= REVIEW_RUN_TOKEN_BUDGET);
  }
});

function clientFor(
  baseUrl: string,
  overrides: {
    apiKey?: string;
    timeoutMs?: number;
    maxResponseBytes?: number;
  } = {},
) {
  return new LocalOpenAIReviewClient({
    reviewer: 'recruiter',
    baseUrl,
    apiKey: overrides.apiKey ?? 'local-review-key',
    model: 'local-review-model',
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
    id: 'review-request-1',
    choices: [
      {
        message: {
          content: JSON.stringify({
            issues: [
              {
                section: 'hero',
                message: 'Shorten the headline for faster scanning.',
                claimId,
                evidenceIds: [evidenceId],
              },
            ],
          }),
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
