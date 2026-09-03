import { z } from 'zod';
import { evidenceArchiveOutputSchema } from './evidence-archive';
import { httpUrlSchema } from './http-url';
import { recruiterStrategyArtifactSchema } from './recruiter-strategy';
import { pageSpecSchema, profileSchema } from './schemas';

export const runOpportunitySchema = z
  .object({
    company: z.string().min(1).max(200),
    role: z.string().min(1).max(200),
    description: z.string().min(1).max(20_000),
    url: httpUrlSchema.optional(),
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

export const workerServiceSchema = z.enum([
  'company-researcher',
  'evidence-archivist',
  'recruiter-strategist',
  'page-composer',
  'recruiter-reviewer',
  'hiring-manager-reviewer',
  'factuality-reviewer',
]);

export const workerServices = workerServiceSchema.options;
export const deploymentModeSchema = z.enum(['self-hosted', 'managed']);

export const workerAvailabilitySchema = z
  .object({
    state: z.enum(['ready', 'waiting', 'unavailable']),
    service: workerServiceSchema.optional(),
  })
  .strict();

export const instanceStatusSchema = z
  .object({
    mode: deploymentModeSchema,
    services: z
      .array(
        z
          .object({
            service: workerServiceSchema,
            status: z.enum(['fresh', 'stale', 'missing']),
          })
          .strict(),
      )
      .length(workerServices.length),
  })
  .strict()
  .superRefine(({ services }, context) => {
    const reported = new Set(services.map(({ service }) => service));
    if (
      reported.size !== workerServices.length ||
      workerServices.some((service) => !reported.has(service))
    )
      context.addIssue({
        code: 'custom',
        path: ['services'],
        message: 'Every worker service must appear exactly once.',
      });
  });

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
        url: httpUrlSchema.optional(),
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

export const reviewStartInputSchema = z.object({}).strict();

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
    findings: z.array(z.string().min(1).max(400)).max(5),
  })
  .strict();

const persistedReviewSchema = runtimeReviewSchema
  .extend({
    reviewId: z.string().uuid(),
    issues: z
      .array(
        z
          .object({
            section: z.string().min(1).max(100),
            message: z.string().min(1).max(400),
            blocking: z.boolean(),
            claimId: z.string().uuid().optional(),
            evidenceIds: z.array(z.string().uuid()).max(2).optional(),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();

const persistedReviewDecisionSchema = z
  .object({
    reviewId: z.string().uuid(),
    issueIndex: z.number().int().min(0).max(4),
    decision: z.enum(['keep', 'correct']),
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
    workerAvailability: workerAvailabilitySchema.optional(),
    research: persistedResearchSchema.optional(),
    evidenceArchive: persistedEvidenceArchiveSchema.optional(),
    strategy: persistedRecruiterStrategySchema.optional(),
    pageSpecId: z.string().uuid().optional(),
    pageSpecHash: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    pageSpecArtifactId: z.string().uuid().optional(),
    pageSpecArtifactHash: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    spec: pageSpecSchema.optional(),
    reviews: z.array(persistedReviewSchema).max(3),
    reviewDecisions: z.array(persistedReviewDecisionSchema).max(15),
    publicationEligible: z.boolean(),
    events: z.array(eventSchema),
  })
  .strict()
  .superRefine((run, context) => {
    const pageFields = [
      run.spec,
      run.pageSpecId,
      run.pageSpecHash,
      run.pageSpecArtifactId,
      run.pageSpecArtifactHash,
    ];
    const present = pageFields.filter((value) => value !== undefined).length;
    if (present !== 0 && present !== pageFields.length)
      context.addIssue({
        code: 'custom',
        path: ['spec'],
        message: 'A PageSpec projection requires its exact durable lineage.',
      });
  });

export type PersistedRun = z.infer<typeof persistedRunSchema>;
export type WorkerAvailability = z.infer<typeof workerAvailabilitySchema>;
export type WorkerService = z.infer<typeof workerServiceSchema>;
export type InstanceStatus = z.infer<typeof instanceStatusSchema>;

export const reviewIssueDecisionInputSchema = z
  .object({
    reviewId: z.string().uuid(),
    issueIndex: z.number().int().min(0).max(4),
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
