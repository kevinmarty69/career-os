import type { LookupAddress } from 'node:dns';
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest, type RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';

const MAX_REDIRECTS = 3;
export const MAX_RESPONSE_BYTES = 1_048_576;
const REQUEST_TIMEOUT_MS = 10_000;
const SOCKET_IDLE_TIMEOUT_MS = 3_000;
const forbiddenV4 = new BlockList();
const forbiddenV6 = new BlockList();

for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  forbiddenV4.addSubnet(network, prefix, 'ipv4');

for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:2::', 48],
  ['2001:10::', 28],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const)
  forbiddenV6.addSubnet(network, prefix, 'ipv6');

export type SafeHttpResult = {
  requestedUrl: string;
  finalUrl: string;
  contentType: 'text/html' | 'text/plain';
  bytes: number;
  text: string;
};

export class SafeHttpError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_URL'
      | 'BLOCKED_DESTINATION'
      | 'REDIRECT_REJECTED'
      | 'UNSUPPORTED_CONTENT'
      | 'RESPONSE_TOO_LARGE'
      | 'TIMEOUT'
      | 'FETCH_FAILED',
  ) {
    super('The remote page could not be imported.');
    this.name = 'SafeHttpError';
  }
}

export function normalizeImportUrl(raw: string) {
  if (raw.length > 2_048) throw new SafeHttpError('INVALID_URL');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeHttpError('INVALID_URL');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && url.port !== (url.protocol === 'https:' ? '443' : '80'))
  )
    throw new SafeHttpError('INVALID_URL');
  const hostname = bareHostname(url.hostname).toLowerCase();
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    (isIP(hostname) > 0 && isForbiddenAddress(hostname)) ||
    (!isIP(hostname) && !hostname.includes('.'))
  )
    throw new SafeHttpError('BLOCKED_DESTINATION');
  url.hash = '';
  return url;
}

export function isForbiddenAddress(address: string) {
  const normalized = bareHostname(address);
  const family = isIP(normalized);
  return (
    family === 0 ||
    (family === 4
      ? forbiddenV4.check(normalized, 'ipv4')
      : forbiddenV6.check(normalized, 'ipv6'))
  );
}

export async function safeFetchText(
  rawUrl: string,
  resolve: (hostname: string) => Promise<LookupAddress[]> = resolveHostname,
): Promise<SafeHttpResult> {
  const requested = normalizeImportUrl(rawUrl);
  const deadline = Date.now() + REQUEST_TIMEOUT_MS;
  const seen = new Set<string>();
  let current = requested;

  for (let redirects = 0; ; redirects += 1) {
    if (seen.has(current.href)) throw new SafeHttpError('REDIRECT_REJECTED');
    seen.add(current.href);
    const addresses = await beforeDeadline(
      resolve(bareHostname(current.hostname)),
      deadline,
    );
    if (
      !addresses.length ||
      addresses.some(({ address }) => isForbiddenAddress(address))
    )
      throw new SafeHttpError('BLOCKED_DESTINATION');

    const response = await requestPinned(current, addresses[0], deadline);
    if (response.status >= 300 && response.status < 400) {
      if (!response.location || redirects >= MAX_REDIRECTS)
        throw new SafeHttpError('REDIRECT_REJECTED');
      let next: URL;
      try {
        next = normalizeImportUrl(new URL(response.location, current).href);
      } catch (error) {
        if (error instanceof SafeHttpError) throw error;
        throw new SafeHttpError('REDIRECT_REJECTED');
      }
      if (current.protocol === 'https:' && next.protocol !== 'https:')
        throw new SafeHttpError('REDIRECT_REJECTED');
      current = next;
      continue;
    }
    if (response.status < 200 || response.status >= 300)
      throw new SafeHttpError('FETCH_FAILED');
    return {
      requestedUrl: requested.href,
      finalUrl: current.href,
      contentType: response.contentType,
      bytes: response.body.byteLength,
      text: decodeUtf8(response.body),
    };
  }
}

async function resolveHostname(hostname: string) {
  if (isIP(hostname)) return [{ address: hostname, family: isIP(hostname) }];
  try {
    return await dnsLookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SafeHttpError('FETCH_FAILED');
  }
}

export async function requestPinned(
  url: URL,
  target: LookupAddress,
  deadline: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.max(1, deadline - Date.now()),
  );
  const lookup: NonNullable<RequestOptions['lookup']> = (
    _hostname,
    _options,
    callback,
  ) => callback(null, target.address, target.family);
  try {
    return await new Promise<{
      status: number;
      location?: string;
      contentType: 'text/html' | 'text/plain';
      body: Uint8Array;
    }>((resolve, reject) => {
      const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
        {
          protocol: url.protocol,
          hostname: bareHostname(url.hostname),
          port: url.port || undefined,
          path: `${url.pathname}${url.search}`,
          method: 'GET',
          headers: {
            accept: 'text/html,text/plain;q=0.9',
            'accept-encoding': 'identity',
            'user-agent': 'CareerOS/0.1 job-import',
          },
          agent: false,
          lookup,
          maxHeaderSize: 16_384,
          servername: isIP(bareHostname(url.hostname))
            ? undefined
            : bareHostname(url.hostname),
          signal: controller.signal,
        },
        (response) => {
          const remoteAddress = response.socket.remoteAddress;
          if (
            !remoteAddress ||
            canonicalAddress(remoteAddress) !== canonicalAddress(target.address)
          ) {
            response.destroy();
            reject(new SafeHttpError('BLOCKED_DESTINATION'));
            return;
          }
          const status = response.statusCode ?? 0;
          const location = singleHeader(response.headers.location);
          if (status >= 300 && status < 400) {
            response.destroy();
            resolve({
              status,
              location,
              contentType: 'text/plain',
              body: new Uint8Array(),
            });
            return;
          }
          if (
            response.headers['content-encoding'] &&
            response.headers['content-encoding'] !== 'identity'
          ) {
            response.destroy();
            reject(new SafeHttpError('UNSUPPORTED_CONTENT'));
            return;
          }
          const contentType = parseContentType(
            response.headers['content-type'],
          );
          const declaredLength = Number(
            response.headers['content-length'] ?? 0,
          );
          if (
            !contentType ||
            !Number.isSafeInteger(declaredLength) ||
            declaredLength < 0 ||
            declaredLength > MAX_RESPONSE_BYTES
          ) {
            response.destroy();
            reject(
              new SafeHttpError(
                declaredLength > MAX_RESPONSE_BYTES
                  ? 'RESPONSE_TOO_LARGE'
                  : 'UNSUPPORTED_CONTENT',
              ),
            );
            return;
          }
          const chunks: Uint8Array[] = [];
          let length = 0;
          response.setTimeout(SOCKET_IDLE_TIMEOUT_MS, () =>
            response.destroy(new SafeHttpError('TIMEOUT')),
          );
          response.on('data', (chunk: Buffer) => {
            length += chunk.byteLength;
            if (length > MAX_RESPONSE_BYTES) {
              response.destroy(new SafeHttpError('RESPONSE_TOO_LARGE'));
              return;
            }
            chunks.push(chunk);
          });
          response.on('end', () =>
            resolve({
              status,
              contentType,
              body: Buffer.concat(chunks, length),
            }),
          );
          response.on('error', reject);
        },
      );
      request.on('error', reject);
      request.end();
    });
  } catch (error) {
    if (error instanceof SafeHttpError) throw error;
    if (controller.signal.aborted) throw new SafeHttpError('TIMEOUT');
    throw new SafeHttpError('FETCH_FAILED');
  } finally {
    clearTimeout(timeout);
  }
}

export function decodeUtf8(body: Uint8Array) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    throw new SafeHttpError('UNSUPPORTED_CONTENT');
  }
}

function parseContentType(value: string | undefined) {
  const mime = value?.split(';', 1)[0].trim().toLowerCase();
  return mime === 'text/html' || mime === 'text/plain' ? mime : undefined;
}

function singleHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? undefined : value;
}

function bareHostname(value: string) {
  return value.startsWith('[') && value.endsWith(']')
    ? value.slice(1, -1)
    : value;
}

function canonicalAddress(value: string) {
  const address = bareHostname(value).toLowerCase();
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

async function beforeDeadline<T>(promise: Promise<T>, deadline: number) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new SafeHttpError('TIMEOUT');
  let timeout: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new SafeHttpError('TIMEOUT')),
          remaining,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout!);
  }
}
