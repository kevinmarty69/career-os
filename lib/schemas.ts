import { z } from 'zod';

export const provenanceLevelSchema = z.enum([
  'verified',
  'declared',
  'inferred',
]);
export const sensitivitySchema = z.enum(['public', 'private', 'restricted']);

export const sourceSchema = z
  .object({
    id: z.string().min(1).max(200),
    kind: z.enum(['document', 'web', 'manual']),
    title: z.string().min(1).max(500),
    locator: z.string().max(2_048).optional(),
    sensitivity: sensitivitySchema,
    allowedUses: z
      .array(z.enum(['application', 'resume', 'linkedin', 'interview']))
      .min(1),
    trust: z.literal('untrusted-data'),
  })
  .strict();

export const evidenceSchema = z
  .object({
    id: z.string().min(1).max(200),
    sourceId: z.string().min(1).max(200),
    label: z.string().min(1).max(500),
    excerpt: z.string().min(1).max(10_000),
  })
  .strict();

export const claimSchema = z
  .object({
    id: z.string().min(1).max(200),
    statement: z.string().min(1).max(5_000),
    level: provenanceLevelSchema,
    evidenceIds: z.array(z.string().min(1).max(200)).max(50),
    sensitivity: sensitivitySchema,
    allowedUses: z
      .array(z.enum(['application', 'resume', 'linkedin', 'interview']))
      .min(1),
  })
  .superRefine((claim, context) => {
    if (claim.level === 'verified' && claim.evidenceIds.length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'Verified claims require evidence.',
      });
    }
  })
  .strict();

export const profileSchema = z
  .object({
    name: z.string().min(2).max(200),
    headline: z.string().min(2).max(500),
    sources: z.array(sourceSchema).max(50),
    evidence: z.array(evidenceSchema).max(100),
    claims: z.array(claimSchema).max(100),
  })
  .superRefine((profile, context) => {
    const sourceIds = new Set(profile.sources.map((source) => source.id));
    const evidenceIds = new Set(
      profile.evidence.map((evidence) => evidence.id),
    );
    uniqueIds(context, profile.sources, ['sources']);
    uniqueIds(context, profile.evidence, ['evidence']);
    uniqueIds(context, profile.claims, ['claims']);
    for (const [index, evidence] of profile.evidence.entries())
      if (!sourceIds.has(evidence.sourceId))
        context.addIssue({
          code: 'custom',
          path: ['evidence', index, 'sourceId'],
          message: 'Evidence must reference a source in this profile.',
        });
    for (const [claimIndex, claim] of profile.claims.entries())
      for (const [evidenceIndex, evidenceId] of claim.evidenceIds.entries())
        if (!evidenceIds.has(evidenceId))
          context.addIssue({
            code: 'custom',
            path: ['claims', claimIndex, 'evidenceIds', evidenceIndex],
            message: 'Claim evidence must exist in this profile.',
          });
  })
  .strict();

export const livingProfileInputSchema = profileSchema.superRefine(
  (profile, context) => {
    for (const [index, claim] of profile.claims.entries())
      if (claim.level === 'verified')
        context.addIssue({
          code: 'custom',
          path: ['claims', index, 'level'],
          message:
            'Living Career Memory claims remain declared until a trusted server process verifies them.',
        });
  },
);

function uniqueIds(
  context: z.RefinementCtx,
  values: Array<{ id: string }>,
  path: PropertyKey[],
) {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (seen.has(value.id))
      context.addIssue({
        code: 'custom',
        path: [...path, index, 'id'],
        message: 'IDs must be unique inside a profile.',
      });
    seen.add(value.id);
  }
}

export const pageSpecSchema = z
  .object({
    version: z.literal(1),
    company: z
      .object({
        name: z.string().min(1).max(200),
        role: z.string().min(1).max(200),
        logoUrl: z.string().url().max(2_048).optional(),
        accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      })
      .strict(),
    hero: z
      .object({
        eyebrow: z.string().min(1).max(100),
        title: z.string().min(1).max(420),
        thesis: z.string().min(1).max(5_000),
      })
      .strict(),
    blocks: z
      .array(
        z.discriminatedUnion('type', [
          z
            .object({
              type: z.literal('fit'),
              title: z.string().min(1).max(200),
              claimIds: z.array(z.string().min(1).max(200)).min(1).max(10),
            })
            .strict(),
          z
            .object({
              type: z.literal('evidence'),
              title: z.string().min(1).max(200),
              claimIds: z.array(z.string().min(1).max(200)).min(1).max(10),
            })
            .strict(),
          z
            .object({
              type: z.literal('gap'),
              title: z.string().min(1).max(200),
              text: z.string().min(1).max(5_000),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(6),
  })
  .strict();

export type Profile = z.infer<typeof profileSchema>;
export type PageSpec = z.infer<typeof pageSpecSchema>;

export type Review = {
  reviewer: 'recruiter' | 'hiring-manager' | 'factuality';
  passed: boolean;
  findings: string[];
};

export const workflowStateSchema = z.enum([
  'draft',
  'researched',
  'strategized',
  'generated',
  'reviewed',
  'approved',
  'published',
]);
