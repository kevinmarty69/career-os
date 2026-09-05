import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import {
  decodeUtf8,
  isForbiddenAddress,
  MAX_RESPONSE_BYTES,
  normalizeImportUrl,
  requestPinned,
  resolveRedirect,
  SafeHttpError,
  safeFetchText,
} from '../../lib/server/safe-http';

test('rejects local names, credentials, non-standard ports and forbidden IPs', () => {
  for (const url of [
    'http://localhost/job',
    'http://service.internal/job',
    'https://user:secret@example.com/job',
    'https://example.com:8443/job',
    'http://127.0.0.1/job',
    'http://[::1]/job',
    `https://example.com/${'x'.repeat(2_100)}`,
  ])
    assert.throws(() => normalizeImportUrl(url), SafeHttpError);

  for (const address of [
    '10.0.0.1',
    '100.64.0.1',
    '169.254.169.254',
    '192.168.1.1',
    '::1',
    '::ffff:8.8.8.8',
    'fc00::1',
    'fe80::1',
  ])
    assert.equal(isForbiddenAddress(address), true, address);
  assert.equal(isForbiddenAddress('8.8.8.8'), false);
  assert.equal(isForbiddenAddress('2606:4700:4700::1111'), false);
});

test('rejects a hostname when any resolved address is forbidden', async () => {
  await assert.rejects(
    safeFetchText('https://jobs.example.com/role', async () => [
      { address: '8.8.8.8', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]),
    (error: unknown) =>
      error instanceof SafeHttpError && error.code === 'BLOCKED_DESTINATION',
  );
});

test('redirects preserve the SSRF boundary and HTTPS', () => {
  const https = new URL('https://jobs.example.com/role');
  assert.equal(
    resolveRedirect(https, '/next#ignored', 0).href,
    'https://jobs.example.com/next',
  );
  for (const [location, redirects, code] of [
    ['http://jobs.example.com/next', 0, 'REDIRECT_REJECTED'],
    ['https://jobs.example.com/next', 3, 'REDIRECT_REJECTED'],
    ['http://127.0.0.1/private', 0, 'BLOCKED_DESTINATION'],
  ] as const)
    assert.throws(
      () => resolveRedirect(https, location, redirects),
      (error: unknown) => error instanceof SafeHttpError && error.code === code,
    );
});

test('pins the socket, destroys redirect bodies and bounds final bodies', async () => {
  let redirectSocketClosed = false;
  const server = createServer((request, response) => {
    if (request.url === '/redirect') {
      request.socket.on('close', () => {
        redirectSocketClosed = true;
      });
      response.writeHead(302, {
        location: '/next',
        'content-type': 'text/html',
      });
      response.write('ignored');
      return;
    }
    if (request.url === '/json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"ok":true}');
      return;
    }
    if (request.url === '/image') {
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      return;
    }
    if (request.url === '/compressed') {
      response.writeHead(200, {
        'content-type': 'text/plain',
        'content-encoding': 'gzip',
      });
      response.end('not actually compressed');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(Buffer.alloc(MAX_RESPONSE_BYTES + 1, 97));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const target = { address: '127.0.0.1', family: 4 };
  try {
    const redirect = await requestPinned(
      new URL(`http://127.0.0.1:${address.port}/redirect`),
      target,
      Date.now() + 2_000,
    );
    assert.equal(redirect.status, 302);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(redirectSocketClosed, true);

    const json = await requestPinned(
      new URL(`http://127.0.0.1:${address.port}/json`),
      target,
      Date.now() + 2_000,
    );
    assert.equal(json.contentType, 'application/json');
    assert.equal(new TextDecoder().decode(json.body), '{"ok":true}');

    const image = await requestPinned(
      new URL(`http://127.0.0.1:${address.port}/image`),
      target,
      Date.now() + 2_000,
      'image',
    );
    assert.equal(image.contentType, 'image/png');
    assert.deepEqual([...image.body], [0x89, 0x50, 0x4e, 0x47]);

    await assert.rejects(
      requestPinned(
        new URL(`http://127.0.0.1:${address.port}/json`),
        target,
        Date.now() + 2_000,
        'image',
      ),
      (error: unknown) =>
        error instanceof SafeHttpError && error.code === 'UNSUPPORTED_CONTENT',
    );

    await assert.rejects(
      requestPinned(
        new URL(`http://127.0.0.1:${address.port}/large`),
        target,
        Date.now() + 2_000,
      ),
      (error: unknown) =>
        error instanceof SafeHttpError && error.code === 'RESPONSE_TOO_LARGE',
    );

    await assert.rejects(
      requestPinned(
        new URL(`http://127.0.0.1:${address.port}/compressed`),
        target,
        Date.now() + 2_000,
      ),
      (error: unknown) =>
        error instanceof SafeHttpError && error.code === 'UNSUPPORTED_CONTENT',
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('invalid UTF-8 becomes a controlled content rejection', () => {
  assert.throws(
    () => decodeUtf8(Uint8Array.from([0xc3, 0x28])),
    (error: unknown) =>
      error instanceof SafeHttpError && error.code === 'UNSUPPORTED_CONTENT',
  );
});
