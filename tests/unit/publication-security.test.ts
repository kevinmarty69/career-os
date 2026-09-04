import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { syntheticProfile } from '../../lib/fixture';
import { parsePublicationCookie } from '../../lib/publication-cookie';
import { profileSchema } from '../../lib/schemas';
import { buildPageSpec, buildStrategy } from '../../lib/workflow';
import { organizationOptions } from '../../lib/server/auth-config';
import {
  isSameOrigin,
  PayloadTooLargeError,
  readBoundedJson,
} from '../../lib/server/http';
import {
  decodePublicationCursor,
  encodePublicationCursor,
  publicationInputSchema,
  publicationSummarySchema,
  publishedPayloadSchema,
} from '../../lib/server/publication-input';
import {
  resetPublicationRateLimitForTests,
  takePublicationAttempt,
} from '../../lib/server/publication-rate-limit';

const opportunity = {
  company: 'Northstar Labs',
  role: 'Senior Product Engineer',
  description: 'Ship dependable product workflows.',
  accent: '#21504b',
};
const spec = buildPageSpec(
  syntheticProfile,
  opportunity,
  buildStrategy(syntheticProfile, opportunity),
);

test('organization invitations require a verified email', () => {
  assert.equal(organizationOptions.requireEmailVerificationOnInvitation, true);
});

test('state-changing requests fail closed without a configured origin', () => {
  const previous = process.env.BETTER_AUTH_URL;
  try {
    delete process.env.BETTER_AUTH_URL;
    assert.equal(
      isSameOrigin(
        new Request('https://career.example/api/profile', {
          headers: { origin: 'https://career.example' },
        }),
      ),
      false,
    );
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = previous;
  }
});

test('state-changing requests trust the configured public origin behind a proxy', () => {
  const previous = process.env.BETTER_AUTH_URL;
  try {
    process.env.BETTER_AUTH_URL = 'https://career.example';
    const proxied = new Request('http://localhost:3000/api/profile', {
      headers: { origin: 'https://career.example' },
    });
    assert.equal(isSameOrigin(proxied), true);
    assert.equal(
      isSameOrigin(
        new Request('http://localhost:3000/api/profile', {
          headers: { origin: 'https://evil.example' },
        }),
      ),
      false,
    );
    process.env.BETTER_AUTH_URL = 'not a URL';
    assert.equal(isSameOrigin(proxied), false);
    process.env.BETTER_AUTH_URL = 'data:text/plain,not-an-origin';
    assert.equal(
      isSameOrigin(
        new Request('http://localhost:3000/api/profile', {
          headers: { origin: 'null' },
        }),
      ),
      false,
    );
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = previous;
  }
});

test('publication cookies require a valid UUID and an exact cookie name', () => {
  const publicationId = randomUUID();
  assert.deepEqual(
    parsePublicationCookie(
      publicationId,
      `unrelated=1; career_share_${publicationId}=valid-token`,
    ),
    { publicationId, token: 'valid-token' },
  );
  assert.equal(
    parsePublicationCookie(
      publicationId,
      `career_share_${publicationId}-suffix=wrong-token`,
    ),
    undefined,
  );
  assert.equal(
    parsePublicationCookie(
      '(a+)+b',
      `career_share_${'a'.repeat(100_000)}=attacker-controlled`,
    ),
    undefined,
  );
  assert.equal(parsePublicationCookie('[', 'career_share_[=token'), undefined);
});

test('profile and publication inputs are bounded and separated', () => {
  const tooManySources = Array.from({ length: 51 }, (_, index) => ({
    ...syntheticProfile.sources[0],
    id: `source-${index}`,
  }));
  assert.equal(
    profileSchema.safeParse({
      ...syntheticProfile,
      sources: tooManySources,
    }).success,
    false,
  );
  assert.equal(
    publicationInputSchema.safeParse({
      runId: randomUUID(),
      rawToken: `${randomUUID()}${randomUUID()}`,
    }).success,
    true,
  );
  assert.equal(
    publicationInputSchema.safeParse({
      profile: syntheticProfile,
      spec,
      opportunity,
      approved: true,
      profileRevision: 1,
    }).success,
    false,
  );
  assert.equal(
    publicationInputSchema.safeParse({
      runId: randomUUID(),
      rawToken: `${randomUUID()}${randomUUID()}`,
      approved: true,
    }).success,
    false,
  );
});

test('published payload remains independently readable', () => {
  assert.deepEqual(
    publishedPayloadSchema.parse({ profile: syntheticProfile, spec }),
    { profile: syntheticProfile, spec },
  );
});

test('publication inventory exposes metadata without capabilities', () => {
  const summary = {
    publicationId: randomUUID(),
    applicationId: randomUUID(),
    company: 'Northstar Labs',
    role: 'Senior Product Engineer',
    publishedAt: new Date().toISOString(),
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    status: 'active' as const,
  };
  assert.deepEqual(publicationSummarySchema.parse(summary), summary);
  assert.equal(
    publicationSummarySchema.safeParse({ ...summary, rawToken: 'secret' })
      .success,
    false,
  );
  const cursor = encodePublicationCursor(summary);
  assert.deepEqual(decodePublicationCursor(cursor), {
    publicationId: summary.publicationId,
    publishedAt: summary.publishedAt,
  });
  assert.equal(decodePublicationCursor('not-json'), null);
  assert.equal(decodePublicationCursor('x'.repeat(513)), null);
});

test('JSON reader stops an oversized streamed body', async () => {
  await assert.rejects(
    readBoundedJson(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ value: 'too large' }),
      }),
      8,
    ),
    PayloadTooLargeError,
  );
  assert.deepEqual(
    await readBoundedJson(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ ok: true }),
      }),
      32,
    ),
    { ok: true },
  );
});

test('demo publication limiter fails closed after ten attempts', () => {
  resetPublicationRateLimitForTests();
  for (let attempt = 0; attempt < 10; attempt += 1)
    assert.equal(takePublicationAttempt('tenant-a', 1), true);
  assert.equal(takePublicationAttempt('tenant-a', 1), false);
  assert.equal(takePublicationAttempt('tenant-b', 1), true);
  assert.equal(takePublicationAttempt('tenant-a', 60_001), true);
  resetPublicationRateLimitForTests();
});
