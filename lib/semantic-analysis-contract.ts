import { z } from 'zod';
import { jobMatchSchema } from './hard-match';
import {
  semanticAnalysisArtifactSchema,
  semanticAnalysisInputSchema,
} from './semantic-match';

export const semanticProofIndexSchema = z
  .array(
    z
      .object({
        claimId: z.string().min(1).max(200),
        statement: z.string().min(1).max(5_000),
        evidence: z
          .array(
            z
              .object({
                evidenceId: z.string().min(1).max(200),
                label: z.string().min(1).max(500),
                sourceTitle: z.string().min(1).max(500),
                sourceLocator: z.string().max(2_048).optional(),
              })
              .strict(),
          )
          .min(1)
          .max(50),
      })
      .strict(),
  )
  .max(72);

export const persistedSemanticAnalysisSchema = z
  .object({
    analysisId: z.string().uuid(),
    version: z.number().int().positive(),
    jobMatchId: z.string().uuid(),
    opportunityId: z.string().uuid(),
    jobRevision: z.number().int().positive(),
    searchProfileId: z.string().uuid(),
    searchProfileRevision: z.number().int().positive(),
    livingProfile: z
      .object({
        profileId: z.string().uuid(),
        revision: z.number().int().positive(),
      })
      .strict(),
    inputHash: z.string().regex(/^[0-9a-f]{64}$/),
    artifact: semanticAnalysisArtifactSchema,
    proofIndex: semanticProofIndexSchema,
    usage: z
      .object({
        provider: z.literal('openai-compatible-local'),
        model: z.string().min(1).max(200),
        providerRequestId: z.string().min(1).max(200).optional(),
        reservedTokens: z.number().int().nonnegative(),
        inputTokens: z.number().int().nonnegative().max(1_000_000),
        outputTokens: z.number().int().nonnegative().max(1_000_000),
        costBudgetMicros: z.literal(0),
        costMicros: z.literal(0),
        latencyMs: z.number().int().nonnegative(),
      })
      .strict(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const semanticAnalysisResultSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('blocked'),
      reason: z.literal('hard_constraints'),
      match: jobMatchSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('completed'),
      analysis: persistedSemanticAnalysisSchema,
    })
    .strict(),
]);

export type SemanticAnalysisResult = z.infer<
  typeof semanticAnalysisResultSchema
>;
export type PersistedSemanticAnalysis = z.infer<
  typeof persistedSemanticAnalysisSchema
>;

export function buildSemanticProofIndex(
  rawInput: unknown,
  rawArtifact: unknown,
) {
  const input = semanticAnalysisInputSchema.parse(rawInput);
  const artifact = semanticAnalysisArtifactSchema.parse(rawArtifact);
  if (
    artifact.opportunityId !== input.job.opportunityId ||
    artifact.jobRevision !== input.job.revision ||
    artifact.profileSnapshotId !== input.profile.profileSnapshotId ||
    artifact.profileRevision !== input.profile.revision
  )
    throw new Error('Semantic proof lineage is inconsistent.');

  const claims = new Map(
    input.profile.claims.map((claim) => [claim.claimId, claim]),
  );
  const used = new Map<string, Set<string>>();
  for (const items of Object.values(artifact.analysis))
    for (const item of items)
      for (const reference of item.profileReferences) {
        const claim = claims.get(reference.claimId);
        if (!claim)
          throw new Error('Semantic analysis references an unknown claim.');
        const allowedEvidence = new Set(
          claim.evidence.map((evidence) => evidence.evidenceId),
        );
        if (reference.evidenceIds.some((id) => !allowedEvidence.has(id)))
          throw new Error(
            'Semantic analysis references evidence outside its claim.',
          );
        const evidence = used.get(reference.claimId) ?? new Set<string>();
        reference.evidenceIds.forEach((id) => evidence.add(id));
        used.set(reference.claimId, evidence);
      }

  return semanticProofIndexSchema.parse(
    [...used].map(([claimId, evidenceIds]) => {
      const claim = claims.get(claimId)!;
      const evidence = new Map(
        claim.evidence.map((item) => [item.evidenceId, item]),
      );
      return {
        claimId,
        statement: claim.statement,
        evidence: [...evidenceIds].map((evidenceId) => {
          const item = evidence.get(evidenceId)!;
          return {
            evidenceId,
            label: item.label,
            sourceTitle: item.source.title,
            ...(item.source.locator
              ? { sourceLocator: item.source.locator }
              : {}),
          };
        }),
      };
    }),
  );
}
