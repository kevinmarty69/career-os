import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applicationOrigin,
  authRedirectUrl,
  isSameOrigin,
} from '../../lib/server/http';

test('auth redirects retain the configured public cookie origin, not the internal proxy hostname', () => {
  const saved = process.env.CAREER_OS_APP_URL;
  try {
    process.env.CAREER_OS_APP_URL = 'http://127.0.0.1:3012';
    assert.equal(
      authRedirectUrl('workspace').href,
      'http://127.0.0.1:3012/sign-in?workspace=1',
    );
    process.env.CAREER_OS_APP_URL = 'https://career.example';
    assert.equal(
      authRedirectUrl('callback').href,
      'https://career.example/sign-in?error=callback',
    );
    assert.equal(
      authRedirectUrl('confirmation').origin,
      'https://career.example',
    );
    for (const invalid of [
      'file:///tmp/app',
      'https://user:secret@career.example',
    ]) {
      process.env.CAREER_OS_APP_URL = invalid;
      assert.throws(() => authRedirectUrl('workspace'));
    }
    delete process.env.CAREER_OS_APP_URL;
    assert.throws(() => authRedirectUrl('workspace'));
  } finally {
    if (saved === undefined) delete process.env.CAREER_OS_APP_URL;
    else process.env.CAREER_OS_APP_URL = saved;
  }
});

test('cookie security and CSRF use the same validated public origin behind an HTTP proxy', () => {
  const previous = process.env.CAREER_OS_APP_URL;
  try {
    const request = new Request('http://internal-proxy/api/auth/workspaces', {
      method: 'POST',
      headers: { origin: 'https://career.example' },
    });
    process.env.CAREER_OS_APP_URL = 'https://career.example';
    assert.equal(applicationOrigin().protocol, 'https:');
    assert.equal(isSameOrigin(request), true);
    assert.equal(
      isSameOrigin(
        new Request(request.url, {
          headers: { origin: 'http://career.example' },
        }),
      ),
      false,
    );
    process.env.CAREER_OS_APP_URL = 'https://operator:secret@career.example';
    assert.throws(applicationOrigin);
    assert.equal(isSameOrigin(request), false);
    process.env.CAREER_OS_APP_URL = 'http://127.0.0.1:3012';
    assert.equal(applicationOrigin().protocol, 'http:');
  } finally {
    if (previous === undefined) delete process.env.CAREER_OS_APP_URL;
    else process.env.CAREER_OS_APP_URL = previous;
  }
});
