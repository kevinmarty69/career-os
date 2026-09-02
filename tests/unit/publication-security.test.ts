import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { syntheticProfile } from '../../lib/fixture';
import { profileSchema } from '../../lib/schemas';
import { buildPageSpec, buildStrategy } from '../../lib/workflow';
import { organizationOptions } from '../../lib/server/auth-config';
import {
  isSameOrigin,
  PayloadTooLargeError,
  readBoundedJson,
} from '../../lib/server/http';
import {
  publicationInputSchema,
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

test('state-changing requests require an exact origin', () => {
  assert.equal(
    isSameOrigin(
      new Request('https://career.example/api/profile', {
        headers: { origin: 'https://career.example' },
      }),
    ),
    true,
  );
  assert.equal(
    isSameOrigin(
      new Request('https://career.example/api/profile', {
        headers: { origin: 'https://evil.example' },
      }),
    ),
    false,
  );
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
    publicationInputSchema.safeParse({ runId: randomUUID() }).success,
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
