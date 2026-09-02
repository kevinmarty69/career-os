import { z } from 'zod';

export const provenanceLevelSchema = z.enum([
  'verified',
  'declared',
  'inferred',
]);
export const sensitivitySchema = z.enum(['public', 'private', 'restricted']);

export const sourceSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(['document', 'web', 'manual']),
    title: z.string().min(1),
    locator: z.string().optional(),
    sensitivity: sensitivitySchema,
    allowedUses: z
      .array(z.enum(['application', 'resume', 'linkedin', 'interview']))
      .min(1),
    trust: z.literal('untrusted-data'),
  })
  .strict();

export const evidenceSchema = z
  .object({
    id: z.string().min(1),
    sourceId: z.string().min(1),
    label: z.string().min(1),
    excerpt: z.string().min(1),
  })
  .strict();

export const claimSchema = z
  .object({
    id: z.string().min(1),
    statement: z.string().min(1),
    level: provenanceLevelSchema,
    evidenceIds: z.array(z.string()),
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
    name: z.string().min(2),
    headline: z.string().min(2),
    sources: z.array(sourceSchema),
    evidence: z.array(evidenceSchema),
    claims: z.array(claimSchema),
  })
  .strict();

export const pageSpecSchema = z
  .object({
    version: z.literal(1),
    company: z.object({
      name: z.string().min(1),
      role: z.string().min(1),
      logoUrl: z.string().url().optional(),
      accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    }),
    hero: z.object({
      eyebrow: z.string(),
      title: z.string(),
      thesis: z.string(),
    }),
    blocks: z
      .array(
        z.discriminatedUnion('type', [
          z.object({
            type: z.literal('fit'),
            title: z.string(),
            claimIds: z.array(z.string()).min(1),
          }),
          z.object({
            type: z.literal('evidence'),
            title: z.string(),
            claimIds: z.array(z.string()).min(1),
          }),
          z.object({
            type: z.literal('gap'),
            title: z.string(),
            text: z.string(),
          }),
        ]),
      )
      .min(2),
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
