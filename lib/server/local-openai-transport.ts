import { z } from 'zod';

const MAX_BASE_URL_CHARS = 2_048;
const MAX_API_KEY_CHARS = 4_096;
const MAX_MODEL_CHARS = 200;
const MAX_RESPONSE_HEADERS = 64;
const MAX_RESPONSE_HEADER_BYTES = 16 * 1024;
const MAX_REPORTED_TOKENS = 1_000_000;

export type LocalModelClientErrorCode =
  | 'INVALID_CONFIG'
  | 'INVALID_INPUT'
  | 'ABORTED'
  | 'TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'RESPONSE_TOO_LARGE'
  | 'USAGE_INVALID';

export class LocalModelClientError extends Error {
  constructor(public readonly code: LocalModelClientErrorCode) {
    super('Local model request failed.');
    this.name = 'LocalModelClientError';
  }
}

export type LocalOpenAIClientConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

export const localModelConfigSchema = (maxResponseBytes: number) =>
  z
    .object({
      baseUrl: z.string().min(1).max(MAX_BASE_URL_CHARS),
      apiKey: z
        .string()
        .min(1)
        .max(MAX_API_KEY_CHARS)
        .refine((value) => !/[\r\n]/.test(value)),
      model: z
        .string()
        .min(1)
        .max(MAX_MODEL_CHARS)
        .refine((value) => !/[\r\n]/.test(value)),
      timeoutMs: z.number().int().min(10).max(120_000).default(30_000),
      maxResponseBytes: z
        .number()
        .int()
        .min(1_024)
        .max(maxResponseBytes)
        .default(maxResponseBytes),
    })
    .strict();

export const localModelResponseSchema = (policy: {
  maxContentChars: number;
  requireStop?: boolean;
  rejectRefusal?: boolean;
}) =>
  z
    .object({
      id: z.string().min(1).max(200).optional(),
      object: z.literal('chat.completion').optional(),
      created: z
        .number()
        .int()
        .nonnegative()
        .max(Number.MAX_SAFE_INTEGER)
        .optional(),
      model: z.string().min(1).max(MAX_MODEL_CHARS).optional(),
      system_fingerprint: z.string().max(200).nullable().optional(),
      choices: z
        .array(
          z
            .object({
              index: z.number().int().min(0).max(20).optional(),
              message: z
                .object({
                  role: z.literal('assistant').optional(),
                  content: z.string().min(1).max(policy.maxContentChars),
                  refusal: policy.rejectRefusal
                    ? z.null().optional()
                    : z.string().max(2_000).nullable().optional(),
                })
                .strict(),
              finish_reason: policy.requireStop
                ? z.literal('stop')
                : z.string().min(1).max(50).nullable().optional(),
            })
            .strict(),
        )
        .length(1),
      usage: z
        .object({
          prompt_tokens: z
            .number()
            .int()
            .nonnegative()
            .max(MAX_REPORTED_TOKENS),
          completion_tokens: z
            .number()
            .int()
            .nonnegative()
            .max(MAX_REPORTED_TOKENS),
          total_tokens: z
            .number()
            .int()
            .nonnegative()
            .max(MAX_REPORTED_TOKENS)
            .optional(),
        })
        .strict(),
    })
    .strict();

export class LocalOpenAITransport {
  readonly model: string;
  private readonly endpoint: URL;
  readonly #apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;

  constructor(
    rawConfig: LocalOpenAIClientConfig,
    maximumResponseBytes: number,
  ) {
    const parsed =
      localModelConfigSchema(maximumResponseBytes).safeParse(rawConfig);
    if (!parsed.success) throw new LocalModelClientError('INVALID_CONFIG');
    this.endpoint = localChatCompletionsUrl(parsed.data.baseUrl);
    this.#apiKey = parsed.data.apiKey;
    this.model = parsed.data.model;
    this.timeoutMs = parsed.data.timeoutMs;
    this.maxResponseBytes = parsed.data.maxResponseBytes;
  }

  async request(
    body: string,
    options: {
      maxOutputTokens: number;
      schema: ReturnType<typeof localModelResponseSchema>;
      signal?: AbortSignal;
    },
  ) {
    const { maxOutputTokens } = options;
    const reservedTokens = utf8Bytes(body) + maxOutputTokens + 256;
    const started = performance.now();
    const timeout = new AbortController();
    const timeoutId = setTimeout(() => timeout.abort(), this.timeoutMs);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeout.signal])
      : timeout.signal;

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        redirect: 'error',
        signal,
        headers: {
          authorization: `Bearer ${this.#apiKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body,
      });
      try {
        validateHeaders(response.headers, this.maxResponseBytes);
      } catch (error) {
        await response.body?.cancel().catch(() => undefined);
        throw error;
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new LocalModelClientError('PROVIDER_UNAVAILABLE');
      }
      const contentType = response.headers.get('content-type')?.toLowerCase();
      if (!contentType?.startsWith('application/json')) {
        await response.body?.cancel().catch(() => undefined);
        throw new LocalModelClientError('INVALID_RESPONSE');
      }

      const responseText = await readBoundedBody(
        response,
        this.maxResponseBytes,
      );
      const envelope = parseEnvelope(responseText, options.schema);
      const usage = envelope.usage;
      const usedTokens = usage.prompt_tokens + usage.completion_tokens;
      if (
        usage.completion_tokens > maxOutputTokens ||
        usedTokens > reservedTokens ||
        (usage.total_tokens !== undefined && usage.total_tokens !== usedTokens)
      )
        throw new LocalModelClientError('USAGE_INVALID');
      return {
        envelope,
        usage: {
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
          costMicros: 0 as const,
          latencyMs: Math.max(0, Math.round(performance.now() - started)),
          reservedTokens,
          reservedCostMicros: 0 as const,
        },
      };
    } catch (error) {
      if (error instanceof LocalModelClientError) throw error;
      if (options.signal?.aborted) throw new LocalModelClientError('ABORTED');
      if (timeout.signal.aborted) throw new LocalModelClientError('TIMEOUT');
      throw new LocalModelClientError('PROVIDER_UNAVAILABLE');
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function localChatCompletionsUrl(rawBaseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawBaseUrl);
  } catch {
    throw new LocalModelClientError('INVALID_CONFIG');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !isLoopbackHost(url.hostname)
  )
    throw new LocalModelClientError('INVALID_CONFIG');
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/chat/completions`;
  return url;
}

function isLoopbackHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true;
  const parts = hostname.split('.');
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255) &&
    Number(parts[0]) === 127
  );
}

function validateHeaders(headers: Headers, maximumBodyBytes: number) {
  let count = 0;
  let bytes = 0;
  for (const [name, value] of headers) {
    count += 1;
    bytes += utf8Bytes(name) + utf8Bytes(value);
    if (count > MAX_RESPONSE_HEADERS || bytes > MAX_RESPONSE_HEADER_BYTES)
      throw new LocalModelClientError('INVALID_RESPONSE');
  }
  const declaredLength = headers.get('content-length');
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength))
      throw new LocalModelClientError('INVALID_RESPONSE');
    if (Number(declaredLength) > maximumBodyBytes)
      throw new LocalModelClientError('RESPONSE_TOO_LARGE');
  }
}

async function readBoundedBody(
  response: Response,
  maximumBytes: number,
): Promise<string> {
  if (!response.body) throw new LocalModelClientError('INVALID_RESPONSE');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes)
        throw new LocalModelClientError('RESPONSE_TOO_LARGE');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    throw new LocalModelClientError('INVALID_RESPONSE');
  }
}

function parseEnvelope(
  value: string,
  responseSchema: ReturnType<typeof localModelResponseSchema>,
) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new LocalModelClientError('INVALID_RESPONSE');
  }
  const result = responseSchema.safeParse(parsed);
  if (!result.success) {
    const usage = isRecord(parsed) ? parsed.usage : undefined;
    if (usage === undefined || hasInvalidUsage(usage))
      throw new LocalModelClientError('USAGE_INVALID');
    throw new LocalModelClientError('INVALID_RESPONSE');
  }
  return result.data;
}

function hasInvalidUsage(value: unknown): boolean {
  if (!isRecord(value)) return true;
  return !['prompt_tokens', 'completion_tokens'].every((key) => {
    const candidate = value[key];
    return (
      typeof candidate === 'number' &&
      Number.isInteger(candidate) &&
      candidate >= 0 &&
      candidate <= MAX_REPORTED_TOKENS
    );
  });
}

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
