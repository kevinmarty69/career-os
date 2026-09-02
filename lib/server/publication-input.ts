import { z } from 'zod';
import { pageSpecSchema, profileSchema } from '../schemas';

const opportunitySchema = z
  .object({
    company: z.string().min(1).max(200),
    role: z.string().min(1).max(200),
    description: z.string().min(1).max(20_000),
    url: z.string().url().max(2_048).optional(),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .strict();

export const publishedPayloadSchema = z
  .object({
    profile: profileSchema,
    spec: pageSpecSchema,
  })
  .strict();

export const publicationInputSchema = publishedPayloadSchema
  .extend({
    opportunity: opportunitySchema,
    approved: z.literal(true),
  })
  .strict()
  .superRefine(({ profile, spec }, context) => {
    limit(context, profile.sources.length, 50, ['profile', 'sources']);
    limit(context, profile.evidence.length, 100, ['profile', 'evidence']);
    limit(context, profile.claims.length, 100, ['profile', 'claims']);
    limit(context, spec.blocks.length, 4, ['spec', 'blocks']);
    text(context, profile.name, 200, ['profile', 'name']);
    text(context, profile.headline, 500, ['profile', 'headline']);
    for (const [index, source] of profile.sources.entries()) {
      text(context, source.id, 200, ['profile', 'sources', index, 'id']);
      text(context, source.title, 500, ['profile', 'sources', index, 'title']);
      if (source.locator)
        text(context, source.locator, 2_048, [
          'profile',
          'sources',
          index,
          'locator',
        ]);
    }
    for (const [index, evidence] of profile.evidence.entries()) {
      text(context, evidence.id, 200, ['profile', 'evidence', index, 'id']);
      text(context, evidence.sourceId, 200, [
        'profile',
        'evidence',
        index,
        'sourceId',
      ]);
      text(context, evidence.label, 500, [
        'profile',
        'evidence',
        index,
        'label',
      ]);
      text(context, evidence.excerpt, 10_000, [
        'profile',
        'evidence',
        index,
        'excerpt',
      ]);
    }
    for (const [index, claim] of profile.claims.entries()) {
      text(context, claim.id, 200, ['profile', 'claims', index, 'id']);
      text(context, claim.statement, 5_000, [
        'profile',
        'claims',
        index,
        'statement',
      ]);
      limit(context, claim.evidenceIds.length, 50, [
        'profile',
        'claims',
        index,
        'evidenceIds',
      ]);
    }
    text(context, spec.hero.eyebrow, 500, ['spec', 'hero', 'eyebrow']);
    text(context, spec.hero.title, 500, ['spec', 'hero', 'title']);
    text(context, spec.hero.thesis, 5_000, ['spec', 'hero', 'thesis']);
    text(context, spec.company.name, 200, ['spec', 'company', 'name']);
    text(context, spec.company.role, 200, ['spec', 'company', 'role']);
    if (spec.company.logoUrl)
      text(context, spec.company.logoUrl, 2_048, [
        'spec',
        'company',
        'logoUrl',
      ]);
    for (const [index, source] of profile.sources.entries())
      limit(context, source.allowedUses.length, 4, [
        'profile',
        'sources',
        index,
        'allowedUses',
      ]);
    for (const [index, claim] of profile.claims.entries())
      limit(context, claim.allowedUses.length, 4, [
        'profile',
        'claims',
        index,
        'allowedUses',
      ]);
    for (const [index, block] of spec.blocks.entries()) {
      text(context, block.title, 500, ['spec', 'blocks', index, 'title']);
      if ('claimIds' in block)
        limit(context, block.claimIds.length, 100, [
          'spec',
          'blocks',
          index,
          'claimIds',
        ]);
      else text(context, block.text, 10_000, ['spec', 'blocks', index, 'text']);
    }
  });

function limit(
  context: z.RefinementCtx,
  actual: number,
  maximum: number,
  path: PropertyKey[],
) {
  if (actual > maximum)
    context.addIssue({
      code: 'too_big',
      origin: 'array',
      maximum,
      inclusive: true,
      path,
      message: `Maximum ${maximum} items.`,
    });
}

function text(
  context: z.RefinementCtx,
  value: string,
  maximum: number,
  path: PropertyKey[],
) {
  if (value.length > maximum)
    context.addIssue({
      code: 'too_big',
      origin: 'string',
      maximum,
      inclusive: true,
      path,
      message: `Maximum ${maximum} characters.`,
    });
}
