import { z } from 'zod';
import { pageSpecSchema, profileSchema } from './schemas';

export const runOpportunitySchema = z
  .object({
    company: z.string().min(1).max(200),
    role: z.string().min(1).max(200),
    description: z.string().min(1).max(20_000),
    url: z.string().url().max(2_048).optional(),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .strict();

export const createRunInputSchema = z
  .object({
    opportunity: runOpportunitySchema,
    profileRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

const runStatusSchema = z.enum([
  'running',
  'awaiting_approval',
  'completed',
  'blocked',
  'budget_exhausted',
  'cancelled',
  'failed',
]);

const reviewSchema = z
  .object({
    reviewer: z.enum(['recruiter', 'hiring-manager', 'factuality']),
    passed: z.boolean(),
    findings: z.array(z.string()),
  })
  .strict();

const eventSchema = z
  .object({
    actor: z.enum([
      'human',
      'system',
      'evidence-archivist',
      'company-researcher',
      'recruiter-strategist',
      'hiring-manager',
      'page-composer',
      'fact-checker',
      'recruiter',
    ]),
    type: z.string().min(1),
    summary: z.string().min(1),
    artifactId: z.string().uuid().optional(),
    costMicros: z.number().int().nonnegative(),
  })
  .strict();

export const persistedRunSchema = z
  .object({
    runId: z.string().uuid(),
    status: runStatusSchema,
    stage: z.string().min(1),
    revision: z.number().int().min(0).max(3),
    usedTokens: z.number().int().nonnegative(),
    usedCostMicros: z.number().int().nonnegative(),
    profile: profileSchema,
    spec: pageSpecSchema.optional(),
    reviews: z.array(reviewSchema),
    events: z.array(eventSchema),
  })
  .strict();

export type PersistedRun = z.infer<typeof persistedRunSchema>;
