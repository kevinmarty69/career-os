import assert from 'node:assert/strict';
import test from 'node:test';
import { syntheticProfile } from '../../lib/fixture';
import { pageSpecSchema, profileSchema } from '../../lib/schemas';
import {
  buildPageSpec,
  buildStrategy,
  canPublish,
  runReviews,
} from '../../lib/workflow';

const opportunity = {
  company: 'Northstar Labs',
  role: 'Senior Product Engineer',
  description: 'Ship dependable product workflows.',
  accent: '#21504b',
};

test('verified claims require linked evidence', () => {
  const profile = structuredClone(syntheticProfile);
  profile.claims[0].evidenceIds = [];
  assert.equal(profileSchema.safeParse(profile).success, false);
});

test('profile references stay inside one unambiguous graph', () => {
  const missingSource = structuredClone(syntheticProfile);
  missingSource.evidence[0].sourceId = 'missing-source';
  assert.equal(profileSchema.safeParse(missingSource).success, false);

  const missingEvidence = structuredClone(syntheticProfile);
  missingEvidence.claims[0].evidenceIds = ['missing-evidence'];
  assert.equal(profileSchema.safeParse(missingEvidence).success, false);

  const duplicate = structuredClone(syntheticProfile);
  duplicate.claims.push({ ...duplicate.claims[0] });
  assert.equal(profileSchema.safeParse(duplicate).success, false);
});

test('PageSpec rejects unknown blocks and free-form fields', () => {
  const strategy = buildStrategy(syntheticProfile, opportunity);
  const spec = buildPageSpec(syntheticProfile, opportunity, strategy);
  assert.equal(
    pageSpecSchema.safeParse({ ...spec, rawCss: 'body{}' }).success,
    false,
  );
  assert.equal(
    pageSpecSchema.safeParse({
      ...spec,
      blocks: [{ type: 'html', value: '<script />' }],
    }).success,
    false,
  );
});

test('the deterministic workflow keeps provenance and gates publication', () => {
  const strategy = buildStrategy(syntheticProfile, opportunity);
  const spec = buildPageSpec(syntheticProfile, opportunity, strategy);
  const reviews = runReviews(syntheticProfile, spec);
  assert.equal(reviews.length, 3);
  assert.equal(
    reviews.every((review) => review.passed),
    true,
  );
  assert.equal(canPublish(false, reviews), false);
  assert.equal(canPublish(true, reviews), true);
  assert.deepEqual(strategy.selectedClaimIds, ['claim-demo-release']);
  assert.equal(
    strategy.matches.some((match) => match.claimId),
    true,
  );
});

test('unsafe low-contrast accents fall back to an accessible token', () => {
  const strategy = buildStrategy(syntheticProfile, opportunity);
  const spec = buildPageSpec(
    syntheticProfile,
    { ...opportunity, accent: '#ffffff' },
    strategy,
  );
  assert.equal(spec.company.accent, '#21504b');
});

test('an unrelated astrophysics opportunity is refused', () => {
  assert.throws(
    () =>
      buildStrategy(syntheticProfile, {
        company: 'Cosmos Institute',
        role: 'Astrophysicist',
        description: 'Calibrate telescope optics and model stellar spectra.',
        accent: '#21504b',
      }),
    /not supported by eligible evidence/,
  );
});
