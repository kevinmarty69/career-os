import assert from 'node:assert/strict';
import test from 'node:test';
import { authRedirectUrl } from '../../lib/server/http';

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
