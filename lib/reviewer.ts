import { z } from 'zod';
import { pageComposerOutputSchema } from './page-composer';

export const REVIEW_INPUT_MAX_BYTES = 46 * 1024;
const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();

export const reviewerSchema = z.enum([
  'recruiter',
  'hiring-manager',
  'factuality',
]);
export type Reviewer = z.infer<typeof reviewerSchema>;
export type QualitativeReviewer = Exclude<Reviewer, 'factuality'>;

export const databaseReviewerSchema = z.enum([
  'recruiter',
  'hiring_manager',
  'factuality',
]);
export type DatabaseReviewer = z.infer<typeof databaseReviewerSchema>;

const evidenceSchema = z
  .object({
    evidenceId: uuidSchema,
    sourceId: uuidSchema,
    label: z.string().min(1).max(500),
    excerpt: z.string().min(1).max(2_000),
  })
  .strict();

const proofSchema = z
  .object({
    claimId: uuidSchema,
    statement: z.string().min(1).max(5_000),
    provenance: z.enum(['verified', 'declared']),
    evidence: z.array(evidenceSchema).min(1).max(2),
  })
  .strict()
  .superRefine((proof, context) => {
    unique(context, proof.evidence, (item) => item.evidenceId, ['evidence']);
  });

export const reviewerInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    reviewer: databaseReviewerSchema,
    reviewStartId: uuidSchema,
    profileSnapshotId: uuidSchema,
    pageSpecId: uuidSchema,
    pageSpecHash: hashSchema,
    pageSpecArtifactId: uuidSchema,
    pageSpecArtifactHash: hashSchema,
    candidateName: z.string().min(1).max(200),
    company: z
      .object({
        name: z.string().min(1).max(200),
        role: z.string().min(1).max(200),
      })
      .strict(),
    pageSpec: pageComposerOutputSchema,
    proofs: z.array(proofSchema).min(1).max(5),
  })
  .strict()
  .superRefine((input, context) => {
    unique(context, input.proofs, (proof) => proof.claimId, ['proofs']);
    const pageClaimIds = new Set(input.pageSpec.blocks[0].claimIds);
    const proofClaimIds = new Set(input.proofs.map((proof) => proof.claimId));
    if (
      pageClaimIds.size !== proofClaimIds.size ||
      [...pageClaimIds].some((claimId) => !proofClaimIds.has(claimId))
    )
      context.addIssue({
        code: 'custom',
        path: ['pageSpec', 'blocks', 0, 'claimIds'],
        message: 'Reviewer proofs must exactly match the PageSpec claims.',
      });
    if (
      input.pageSpec.company.name !== input.company.name ||
      input.pageSpec.company.role !== input.company.role
    )
      context.addIssue({
        code: 'custom',
        path: ['company'],
        message: 'Reviewer company context must match the PageSpec.',
      });
  });

export type ReviewerInput = z.infer<typeof reviewerInputSchema>;

export const reviewSectionSchema = z.enum(['hero', 'relevant_experience']);

const modelIssueSchema = z
  .object({
    section: reviewSectionSchema,
    message: z.string().min(1).max(400),
    claimId: uuidSchema,
    evidenceIds: z.array(uuidSchema).min(1).max(2),
  })
  .strict()
  .superRefine((issue, context) => {
    unique(context, issue.evidenceIds, (id) => id, ['evidenceIds']);
  });

export const reviewModelOutputSchema = z
  .object({
    issues: z.array(modelIssueSchema).max(5),
  })
  .strict();

export type ReviewModelOutput = z.infer<typeof reviewModelOutputSchema>;

const storedIssueSchema = modelIssueSchema
  .extend({ blocking: z.boolean() })
  .strict();

export const reviewerOutputSchema = z
  .object({
    schemaVersion: z.literal(1),
    purpose: z.literal('page-spec-review'),
    pageSpecId: uuidSchema,
    pageSpecHash: hashSchema,
    reviewer: databaseReviewerSchema,
    verdict: z.enum(['pass', 'changes_required']),
    issues: z.array(storedIssueSchema).max(5),
  })
  .strict()
  .superRefine((output, context) => {
    if ((output.verdict === 'pass') !== (output.issues.length === 0))
      context.addIssue({
        code: 'custom',
        path: ['verdict'],
        message: 'Verdict must agree with the issue list.',
      });
    output.issues.forEach((issue, index) => {
      if (issue.blocking !== (output.reviewer === 'factuality'))
        context.addIssue({
          code: 'custom',
          path: ['issues', index, 'blocking'],
          message: 'Issue blocking policy must agree with the reviewer.',
        });
    });
  });

export type ReviewerOutput = z.infer<typeof reviewerOutputSchema>;

export function parseReviewerInput(
  value: unknown,
  expectedReviewer?: Reviewer,
): ReviewerInput {
  const input = reviewerInputSchema.parse(value);
  if (
    expectedReviewer &&
    input.reviewer !== toDatabaseReviewer(expectedReviewer)
  )
    throw new Error('Reviewer input does not match the worker authority.');
  if (utf8Bytes(JSON.stringify(input)) > REVIEW_INPUT_MAX_BYTES)
    throw new Error('Reviewer input exceeds its size limit.');
  return input;
}

export function buildQualitativeReview(
  input: ReviewerInput,
  reviewer: QualitativeReviewer,
  rawOutput: unknown,
): ReviewerOutput {
  if (input.reviewer !== toDatabaseReviewer(reviewer))
    throw new Error('Reviewer output does not match the worker authority.');
  const output = reviewModelOutputSchema.parse(rawOutput);
  const proofs = new Map(input.proofs.map((proof) => [proof.claimId, proof]));
  for (const issue of output.issues) {
    const proof = proofs.get(issue.claimId);
    const evidenceIds = new Set(
      proof?.evidence.map((evidence) => evidence.evidenceId),
    );
    if (
      !proof ||
      issue.evidenceIds.some((evidenceId) => !evidenceIds.has(evidenceId))
    )
      throw new Error('Review issue is not grounded in the supplied proofs.');
  }
  return reviewerOutputSchema.parse({
    schemaVersion: 1,
    purpose: 'page-spec-review',
    pageSpecId: input.pageSpecId,
    pageSpecHash: input.pageSpecHash,
    reviewer: input.reviewer,
    verdict: output.issues.length === 0 ? 'pass' : 'changes_required',
    issues: output.issues.map((issue) => ({ ...issue, blocking: false })),
  });
}

export function buildFactualityReview(value: unknown): ReviewerOutput {
  const input = parseReviewerInput(value, 'factuality');
  if (
    !input.proofs.some(
      (proof) => proof.statement === input.pageSpec.hero.thesis,
    )
  )
    throw new Error('PageSpec thesis is not an exact durable proof statement.');
  return reviewerOutputSchema.parse({
    schemaVersion: 1,
    purpose: 'page-spec-review',
    pageSpecId: input.pageSpecId,
    pageSpecHash: input.pageSpecHash,
    reviewer: 'factuality',
    verdict: 'pass',
    issues: [],
  });
}

export function toDatabaseReviewer(reviewer: Reviewer): DatabaseReviewer {
  return reviewer === 'hiring-manager' ? 'hiring_manager' : reviewer;
}

function unique<T>(
  context: z.RefinementCtx,
  values: T[],
  key: (value: T) => string,
  path: PropertyKey[],
) {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const id = key(value);
    if (seen.has(id))
      context.addIssue({
        code: 'custom',
        path: [...path, index],
        message: 'Values must be unique.',
      });
    seen.add(id);
  });
}

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value).byteLength;
}
