import { z } from 'zod';

const MAX_INPUT_BYTES = 64 * 1024;
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

export const pageComposerInputSchema = z
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
  });

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
  if (utf8Bytes(JSON.stringify(input)) > MAX_INPUT_BYTES)
    throw new Error('Page composer input exceeds its size limit.');
  return input;
}

export function composeApprovedStrategyPage(
  value: unknown,
): PageComposerOutput {
  const input = parsePageComposerInput(value);
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
