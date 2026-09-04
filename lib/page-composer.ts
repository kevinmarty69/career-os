import { z } from 'zod';

export const MAX_PAGE_COMPOSER_INPUT_BYTES = 64 * 1024;
export const MAX_PAGE_COMPOSER_OUTPUT_BYTES = 16 * 1024;
const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const signalIdSchema = z.string().regex(/^signal-(?:[1-9]|1\d|20)$/);
const uuidSchema = z.string().uuid();

const approvedClaimSchema = z
  .object({
    signalId: signalIdSchema,
    claimId: uuidSchema,
    statement: z.string().min(1).max(5_000),
    provenance: z.enum(['verified', 'declared']),
    evidenceIds: z.array(uuidSchema).min(1).max(2),
  })
  .strict()
  .superRefine((selection, context) => {
    unique(context, selection.evidenceIds, ['evidenceIds']);
  });

const pageComposerV1InputSchema = z
  .object({
    schemaVersion: z.literal(1),
    purpose: z.literal('application'),
    profileSnapshotId: uuidSchema,
    researchArtifactId: uuidSchema,
    researchArtifactHash: hashSchema,
    evidenceArchiveArtifactId: uuidSchema,
    evidenceArchiveArtifactHash: hashSchema,
    strategyArtifactId: uuidSchema,
    strategyArtifactHash: hashSchema,
    strategyApprovalId: uuidSchema,
    candidateName: z.string().min(1).max(200),
    company: z
      .object({
        name: z.string().min(1).max(200),
        role: z.string().min(1).max(200),
        accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      })
      .strict(),
    lead: approvedClaimSchema,
    supports: z.array(approvedClaimSchema).max(4),
  })
  .strict()
  .superRefine((input, context) => {
    validateSelections(input, context);
  });

const correctionIssueSchema = z
  .object({
    section: z.enum(['hero', 'relevant_experience']),
    message: z.string().min(1).max(400),
    blocking: z.boolean(),
    claimId: uuidSchema,
    evidenceIds: z.array(uuidSchema).min(1).max(2),
  })
  .strict()
  .superRefine((issue, context) => {
    unique(context, issue.evidenceIds, ['evidenceIds']);
  });

const correctionSchema = z
  .object({
    decisionId: uuidSchema,
    parentRunId: uuidSchema,
    pageSpecId: uuidSchema,
    pageSpecHash: hashSchema,
    pageSpecArtifactId: uuidSchema,
    pageSpecArtifactHash: hashSchema,
    reviewId: uuidSchema,
    issueIndex: z.number().int().min(0).max(4),
    issue: correctionIssueSchema,
    pageSpec: z.lazy(() => pageComposerOutputSchema),
  })
  .strict();

const pageComposerV2InputSchema = z
  .object({
    ...pageComposerV1InputSchema.shape,
    schemaVersion: z.literal(2),
    correction: correctionSchema,
  })
  .strict()
  .superRefine((input, context) => {
    validateSelections(input, context);
    const source = input.correction.pageSpec;
    const expectedTitle = `${input.candidateName} × ${input.company.name}`;
    const selected = [input.lead, ...input.supports];
    const selectedClaimIds = new Set(selected.map((proof) => proof.claimId));
    if (
      JSON.stringify(source.company) !== JSON.stringify(input.company) ||
      source.hero.title !== expectedTitle ||
      source.blocks[0].claimIds.some(
        (claimId) => !selectedClaimIds.has(claimId),
      ) ||
      !selected.some(
        (proof) =>
          source.blocks[0].claimIds.includes(proof.claimId) &&
          proof.statement === source.hero.thesis,
      )
    )
      context.addIssue({
        code: 'custom',
        path: ['correction', 'pageSpec'],
        message:
          'The correction source must stay within the approved composer input.',
      });
    if (
      input.correction.issue.section === 'hero' &&
      ![input.lead, ...input.supports].some(
        (proof) =>
          proof.claimId === input.correction.issue.claimId &&
          proof.statement === input.correction.pageSpec.hero.thesis,
      )
    )
      context.addIssue({
        code: 'custom',
        path: ['correction', 'issue', 'claimId'],
        message: 'A hero correction must target the claim used by the hero.',
      });
    if (
      input.correction.issue.section === 'relevant_experience' &&
      !input.correction.pageSpec.blocks[0].claimIds.includes(
        input.correction.issue.claimId,
      )
    )
      context.addIssue({
        code: 'custom',
        path: ['correction', 'issue', 'claimId'],
        message: 'The corrected claim must exist in the targeted section.',
      });
  });

export const pageComposerInputSchema = z.discriminatedUnion('schemaVersion', [
  pageComposerV1InputSchema,
  pageComposerV2InputSchema,
]);

export const pageComposerOutputSchema = z
  .object({
    version: z.literal(1),
    company: z
      .object({
        name: z.string().min(1).max(200),
        role: z.string().min(1).max(200),
        accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      })
      .strict(),
    hero: z
      .object({
        eyebrow: z.literal('Private application'),
        title: z.string().min(1).max(403),
        thesis: z.string().min(1).max(5_000),
      })
      .strict(),
    blocks: z
      .tuple([
        z
          .object({
            type: z.literal('fit'),
            title: z.literal('Relevant experience'),
            claimIds: z.array(uuidSchema).min(1).max(5),
          })
          .strict(),
      ])
      .superRefine((blocks, context) => {
        unique(context, blocks[0].claimIds, [0, 'claimIds']);
      }),
  })
  .strict();

export type PageComposerInput = z.infer<typeof pageComposerInputSchema>;
export type PageComposerOutput = z.infer<typeof pageComposerOutputSchema>;

export function parsePageComposerInput(value: unknown): PageComposerInput {
  const input = pageComposerInputSchema.parse(value);
  if (utf8Bytes(JSON.stringify(input)) > MAX_PAGE_COMPOSER_INPUT_BYTES)
    throw new Error('Page composer input exceeds its size limit.');
  return input;
}

export function composeApprovedStrategyPage(
  value: unknown,
): PageComposerOutput {
  const input = parsePageComposerInput(value);
  if (input.schemaVersion === 2) return composeCorrection(input);
  return composeInitialPage(input);
}

function composeInitialPage(
  input: Omit<z.infer<typeof pageComposerV1InputSchema>, 'schemaVersion'> & {
    schemaVersion: 1 | 2;
  },
): PageComposerOutput {
  const claimIds = Array.from(
    new Set(
      [input.lead, ...input.supports].map((selection) => selection.claimId),
    ),
  );

  return pageComposerOutputSchema.parse({
    version: 1,
    company: input.company,
    hero: {
      eyebrow: 'Private application',
      title: `${input.candidateName} × ${input.company.name}`,
      thesis: input.lead.statement,
    },
    blocks: [
      {
        type: 'fit',
        title: 'Relevant experience',
        claimIds,
      },
    ],
  });
}

function composeCorrection(
  input: z.infer<typeof pageComposerV2InputSchema>,
): PageComposerOutput {
  const source = input.correction.pageSpec;
  const target = input.correction.issue;
  let output: PageComposerOutput;
  if (target.section === 'hero') {
    const replacement = input.supports.find(
      (support) => support.claimId !== target.claimId,
    );
    if (!replacement)
      throw new Error('No different approved support can replace the hero.');
    output = pageComposerOutputSchema.parse({
      ...source,
      hero: { ...source.hero, thesis: replacement.statement },
    });
  } else {
    const claimIds = source.blocks[0].claimIds.filter(
      (claimId) => claimId !== target.claimId,
    );
    if (claimIds.length === 0)
      throw new Error('A corrected experience section cannot be empty.');
    const remainingProofs = [input.lead, ...input.supports].filter((proof) =>
      claimIds.includes(proof.claimId),
    );
    if (
      !remainingProofs.some((proof) => proof.statement === source.hero.thesis)
    )
      throw new Error('The correction would detach the hero from its proof.');
    output = pageComposerOutputSchema.parse({
      ...source,
      blocks: [{ ...source.blocks[0], claimIds }],
    });
  }
  if (JSON.stringify(output) === JSON.stringify(source))
    throw new Error('The correction did not change the PageSpec.');
  return output;
}

function validateSelections(
  input: {
    lead: z.infer<typeof approvedClaimSchema>;
    supports: Array<z.infer<typeof approvedClaimSchema>>;
  },
  context: z.RefinementCtx,
) {
  const selections = [input.lead, ...input.supports];
  unique(
    context,
    selections,
    ['lead', 'supports'],
    (selection) => selection.signalId,
  );

  const claims = new Map<string, string>();
  const claimUse = new Map<string, number>();
  selections.forEach((selection, index) => {
    const canonical = JSON.stringify({
      statement: selection.statement,
      provenance: selection.provenance,
      evidenceIds: selection.evidenceIds,
    });
    const previous = claims.get(selection.claimId);
    if (previous !== undefined && previous !== canonical)
      context.addIssue({
        code: 'custom',
        path: selectionPath(index, 'claimId'),
        message: 'Claim IDs must have consistent canonical content.',
      });
    else claims.set(selection.claimId, canonical);

    const uses = (claimUse.get(selection.claimId) ?? 0) + 1;
    if (uses > 2)
      context.addIssue({
        code: 'custom',
        path: selectionPath(index, 'claimId'),
        message: 'Approved claims may be selected at most twice.',
      });
    claimUse.set(selection.claimId, uses);
  });
}

function selectionPath(index: number, field: string): PropertyKey[] {
  return index === 0 ? ['lead', field] : ['supports', index - 1, field];
}

function unique<T>(
  context: z.RefinementCtx,
  values: T[],
  path: PropertyKey[],
  key: (value: T) => string = (value) => String(value),
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

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
