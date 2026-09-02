import assert from 'node:assert/strict';
import test from 'node:test';
import { syntheticProfile } from '../../lib/fixture';
import { buildPageSpec, buildStrategy } from '../../lib/workflow';
import { organizationOptions } from '../../lib/server/auth-config';
import { PayloadTooLargeError, readBoundedJson } from '../../lib/server/http';
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

test('publication input rejects oversized arrays and text', () => {
  const tooManySources = Array.from({ length: 51 }, (_, index) => ({
    ...syntheticProfile.sources[0],
    id: `source-${index}`,
  }));
  assert.equal(
    publicationInputSchema.safeParse({
      profile: { ...syntheticProfile, sources: tooManySources },
      spec,
      opportunity,
      approved: true,
    }).success,
    false,
  );
  assert.equal(
    publicationInputSchema.safeParse({
      profile: syntheticProfile,
      spec,
      opportunity: { ...opportunity, description: 'x'.repeat(20_001) },
      approved: true,
    }).success,
    false,
  );
  assert.equal(
    publicationInputSchema.safeParse({
      profile: {
        ...syntheticProfile,
        sources: [
          {
            ...syntheticProfile.sources[0],
            allowedUses: Array.from({ length: 5 }, () => 'application'),
          },
        ],
      },
      spec,
      opportunity,
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
    assert.equal(takePublicationAttempt(1), true);
  assert.equal(takePublicationAttempt(1), false);
  assert.equal(takePublicationAttempt(60_001), true);
  resetPublicationRateLimitForTests();
});
