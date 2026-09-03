import { z } from 'zod';
import { evidenceArchiveOutputSchema } from './evidence-archive';
import { recruiterStrategyArtifactSchema } from './recruiter-strategy';
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
    applicationId: z.string().uuid(),
    applicationRevision: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER),
    profileRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

const runStatusSchema = z.enum([
  'running',
  'paused',
  'awaiting_approval',
  'completed',
  'blocked',
  'budget_exhausted',
  'cancelled',
  'failed',
]);

const persistedStepSchema = z
  .object({
    stage: z.string().min(1).max(100),
    status: z.enum([
      'pending',
      'leased',
      'in_flight',
      'completed',
      'failed',
      'cancelled',
    ]),
    attempt: z.number().int().positive(),
    failureCode: z.string().min(1).max(100).optional(),
  })
  .strict();

const researchSignalSchema = z
  .object({
    signalId: z.string().regex(/^signal-(?:[1-9]|1\d|20)$/),
    statement: z.string().min(1).max(500),
    excerpt: z.string().min(1).max(1_000),
    category: z.enum([
      'responsibility',
      'requirement',
      'culture',
      'constraint',
    ]),
    priority: z.enum(['high', 'medium', 'low']),
  })
  .strict();

export const persistedResearchSchema = z
  .object({
    artifactId: z.string().uuid(),
    artifactHash: z.string().regex(/^[0-9a-f]{64}$/),
    company: z.string().min(1).max(200),
    role: z.string().min(1).max(200),
    source: z
      .object({
        kind: z.literal('job-posting'),
        url: z.string().url().max(2_048).optional(),
        trust: z.literal('untrusted-data'),
      })
      .strict(),
    signals: z.array(researchSignalSchema).min(1).max(20),
  })
  .strict();

export const researchSelectionInputSchema = z
  .object({
    researchArtifactId: z.string().uuid(),
    selectedSignalIds: z
      .array(z.string().regex(/^signal-(?:[1-9]|1\d|20)$/))
      .min(1)
      .max(20),
  })
  .strict()
  .refine(
    ({ selectedSignalIds }) =>
      new Set(selectedSignalIds).size === selectedSignalIds.length,
    { path: ['selectedSignalIds'], message: 'Signal IDs must be unique.' },
  );

export const strategyStartInputSchema = z
  .object({
    evidenceArtifactId: z.string().uuid(),
    evidenceArtifactHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export const strategyApprovalInputSchema = z
  .object({
    strategyArtifactId: z.string().uuid(),
    strategyArtifactHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export const persistedEvidenceArchiveSchema = evidenceArchiveOutputSchema
  .extend({
    artifactId: z.string().uuid(),
    artifactHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export const persistedRecruiterStrategySchema = recruiterStrategyArtifactSchema
  .extend({
    artifactId: z.string().uuid(),
    artifactHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export const runtimeReviewSchema = z
  .object({
    reviewer: z.enum(['recruiter', 'hiring-manager', 'factuality']),
    passed: z.boolean(),
    findings: z.array(z.string()),
  })
  .strict();

const persistedReviewSchema = runtimeReviewSchema
  .extend({
    reviewId: z.string().uuid(),
    issues: z.array(
      z
        .object({
          section: z.string().min(1),
          message: z.string().min(1),
          blocking: z.boolean(),
        })
        .strict(),
    ),
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
    steps: z.array(persistedStepSchema).max(20),
    research: persistedResearchSchema.optional(),
    evidenceArchive: persistedEvidenceArchiveSchema.optional(),
    strategy: persistedRecruiterStrategySchema.optional(),
    spec: pageSpecSchema.optional(),
    reviews: z.array(persistedReviewSchema),
    events: z.array(eventSchema),
  })
  .strict();

export type PersistedRun = z.infer<typeof persistedRunSchema>;

export const reviewIssueDecisionInputSchema = z
  .object({
    reviewId: z.string().uuid(),
    issueIndex: z.number().int().min(0).max(99),
    decision: z.enum(['keep', 'correct']),
  })
  .strict();

export const reviewIssueDecisionResultSchema = z
  .object({
    decisionId: z.string().uuid(),
    runId: z.string().uuid(),
    reviewId: z.string().uuid(),
    issueIndex: z.number().int().nonnegative(),
    decision: z.enum(['keep', 'correct']),
    publicationEligible: z.boolean(),
    correctedRun: persistedRunSchema.optional(),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.decision === 'correct' && !result.correctedRun)
      context.addIssue({
        code: 'custom',
        path: ['correctedRun'],
        message: 'A correction must return its real corrected run.',
      });
    if (result.decision === 'keep' && result.correctedRun)
      context.addIssue({
        code: 'custom',
        path: ['correctedRun'],
        message: 'A keep decision cannot create a corrected run.',
      });
  });

export type ReviewIssueDecisionResult = z.infer<
  typeof reviewIssueDecisionResultSchema
>;
