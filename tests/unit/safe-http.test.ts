import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import {
  decodeUtf8,
  isForbiddenAddress,
  MAX_RESPONSE_BYTES,
  normalizeImportUrl,
  requestPinned,
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

    await assert.rejects(
      requestPinned(
        new URL(`http://127.0.0.1:${address.port}/large`),
        target,
        Date.now() + 2_000,
      ),
      (error: unknown) =>
        error instanceof SafeHttpError && error.code === 'RESPONSE_TOO_LARGE',
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
