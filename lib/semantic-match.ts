import { z } from 'zod';
import { searchSoftPreferencesSchema } from './search-profile';
import { profileSchema } from './schemas';

const MAX_RAW_INPUT_BYTES = 512 * 1024;
const MAX_MODEL_INPUT_BYTES = 128 * 1024;
const boundedId = z.string().min(1).max(200);
const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);

const semanticJobSchema = z
  .object({
    opportunityId: z.string().uuid(),
    revision: z.number().int().positive(),
    company: z.string().min(1).max(200).nullable(),
    role: z.string().min(1).max(200).nullable(),
    description: z.string().min(1).max(60_000),
    source: z
      .object({
        sourceRecordId: z.string().uuid(),
        url: z.string().url().max(2_048),
        fetchedAt: z.string().datetime({ offset: true }),
        contentSha256: hashSchema,
        trust: z.literal('untrusted-data'),
      })
      .strict(),
  })
  .strict();

const eligibleEvidenceSchema = z
  .object({
    evidenceId: boundedId,
    label: z.string().min(1).max(500),
    excerpt: z.string().min(1).max(10_000),
    source: z
      .object({
        sourceId: boundedId,
        kind: z.enum(['document', 'web', 'manual', 'linkedin']),
        title: z.string().min(1).max(500),
        locator: z.string().max(2_048).optional(),
        sensitivity: z.enum(['public', 'private']),
        allowedUses: z
          .array(z.enum(['application', 'resume', 'linkedin', 'interview']))
          .min(1)
          .refine((uses) => uses.includes('application')),
        trust: z.literal('untrusted-data'),
      })
      .strict(),
  })
  .strict();

const eligibleClaimSchema = z
  .object({
    claimId: boundedId,
    statement: z.string().min(1).max(5_000),
    kind: z.enum([
      'summary',
      'experience',
      'project',
      'skill',
      'education',
      'result',
      'preference',
      'other',
    ]),
    level: z.enum(['verified', 'declared', 'inferred', 'unsupported']),
    sensitivity: z.enum(['public', 'private']),
    allowedUses: z
      .array(z.enum(['application', 'resume', 'linkedin', 'interview']))
      .min(1)
      .refine((uses) => uses.includes('application')),
    evidence: z.array(eligibleEvidenceSchema).max(50),
  })
  .strict();

export const semanticAnalysisPreparationSchema = z
  .object({
    schemaVersion: z.literal(1),
    purpose: z.literal('application'),
    job: semanticJobSchema,
    softPreferences: searchSoftPreferencesSchema,
    livingProfile: z
      .object({
        profileSnapshotId: z.string().uuid(),
        revision: z.number().int().positive(),
        profile: profileSchema,
      })
      .strict(),
  })
  .strict();

export const semanticAnalysisInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    purpose: z.literal('application'),
    job: semanticJobSchema,
    softPreferences: searchSoftPreferencesSchema,
    profile: z
      .object({
        profileSnapshotId: z.string().uuid(),
        revision: z.number().int().positive(),
        claims: z.array(eligibleClaimSchema).max(100),
      })
      .strict(),
  })
  .strict()
  .superRefine((input, context) => {
    unique(context, input.profile.claims, (claim) => claim.claimId, [
      'profile',
      'claims',
    ]);
    input.profile.claims.forEach((claim, claimIndex) =>
      unique(context, claim.evidence, (evidence) => evidence.evidenceId, [
        'profile',
        'claims',
        claimIndex,
        'evidence',
      ]),
    );
  });

export const semanticFactorSchema = z.enum([
  'strong',
  'partial',
  'gap',
  'unknown',
]);

const profileReferenceSchema = z
  .object({
    claimId: boundedId,
    evidenceIds: z.array(boundedId).min(1).max(5),
  })
  .strict()
  .superRefine((reference, context) => {
    unique(context, reference.evidenceIds, (id) => id, ['evidenceIds']);
  });

function itemSchema<T extends readonly [string, ...string[]]>(factors: T) {
  return z
    .object({
      statement: z.string().min(1).max(500),
      factor: z.enum(factors),
      jobExcerpt: z.string().min(8).max(1_500),
      profileReferences: z.array(profileReferenceSchema).max(3),
    })
    .strict()
    .superRefine((item, context) => {
      unique(
        context,
        item.profileReferences,
        (reference) => reference.claimId,
        ['profileReferences'],
      );
      if (
        (item.factor === 'strong' || item.factor === 'partial') &&
        item.profileReferences.length === 0
      )
        context.addIssue({
          code: 'custom',
          path: ['profileReferences'],
          message: 'Strong and partial factors require profile evidence.',
        });
    });
}

const positiveItemSchema = itemSchema(['strong', 'partial']);
const gapItemSchema = itemSchema(['gap']);
const unknownItemSchema = itemSchema(['unknown']);
const riskItemSchema = itemSchema(['partial', 'gap', 'unknown']);

export const semanticModelOutputSchema = z
  .object({
    skills: z.array(positiveItemSchema).max(6),
    responsibilities: z.array(positiveItemSchema).max(6),
    transfers: z.array(positiveItemSchema).max(6),
    gaps: z.array(gapItemSchema).max(6),
    unknowns: z.array(unknownItemSchema).max(6),
    risks: z.array(riskItemSchema).max(6),
  })
  .strict()
  .superRefine((output, context) => {
    if (semanticItems(output).length === 0)
      context.addIssue({
        code: 'custom',
        message: 'Semantic analysis must contain at least one factor.',
      });
    if (semanticItems(output).length > 24)
      context.addIssue({
        code: 'custom',
        message: 'Semantic analysis cannot exceed 24 factors.',
      });
    if (primaryItems(output).length + output.unknowns.length === 0)
      context.addIssue({
        code: 'custom',
        message: 'Semantic analysis requires a scored or unknown requirement.',
      });
    unique(
      context,
      primaryItems(output),
      (item) =>
        `${normalize(item.jobExcerpt)}\u0000${normalize(item.statement)}`,
      ['primaryFactors'],
    );
  });

const scoredItemSchema = z
  .object({
    statement: z.string().min(1).max(500),
    factor: semanticFactorSchema,
    jobExcerpt: z.string().min(8).max(1_500),
    profileReferences: z.array(profileReferenceSchema).max(3),
  })
  .strict();

export const semanticAnalysisArtifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    purpose: z.literal('application'),
    opportunityId: z.string().uuid(),
    jobRevision: z.number().int().positive(),
    profileSnapshotId: z.string().uuid(),
    profileRevision: z.number().int().positive(),
    analysis: z
      .object({
        skills: z.array(scoredItemSchema).max(6),
        responsibilities: z.array(scoredItemSchema).max(6),
        transfers: z.array(scoredItemSchema).max(6),
        gaps: z.array(scoredItemSchema).max(6),
        unknowns: z.array(scoredItemSchema).max(6),
        risks: z.array(scoredItemSchema).max(6),
      })
      .strict(),
    decomposition: z
      .object({
        factors: z
          .object({
            strong: z.number().int().nonnegative().max(24),
            partial: z.number().int().nonnegative().max(24),
            gap: z.number().int().nonnegative().max(24),
            unknown: z.number().int().nonnegative().max(24),
          })
          .strict(),
        weights: z
          .object({
            strong: z.literal(100),
            partial: z.literal(55),
            gap: z.literal(0),
            unknown: z.null(),
          })
          .strict(),
        knownFactorCount: z.number().int().nonnegative().max(24),
        requirementCount: z.number().int().positive().max(24),
        coveragePercent: z.number().int().min(0).max(100),
        confidence: z.enum(['low', 'medium', 'high']),
        explanatoryRiskCount: z.number().int().nonnegative().max(6),
        score: z.number().int().min(0).max(100).nullable(),
        recommendation: z.enum([
          'priority',
          'interesting',
          'exploratory',
          'ignore',
        ]),
        method: z.literal('bounded-factor-decomposition-v1'),
      })
      .strict(),
  })
  .strict();

export type SemanticAnalysisPreparation = z.infer<
  typeof semanticAnalysisPreparationSchema
>;
export type SemanticAnalysisInput = z.infer<typeof semanticAnalysisInputSchema>;
export type SemanticModelOutput = z.infer<typeof semanticModelOutputSchema>;
export type SemanticAnalysisArtifact = z.infer<
  typeof semanticAnalysisArtifactSchema
>;

export function prepareSemanticAnalysisInput(
  raw: unknown,
): SemanticAnalysisInput {
  assertBytes(raw, MAX_RAW_INPUT_BYTES, 'Semantic preparation input');
  const input = semanticAnalysisPreparationSchema.parse(raw);
  const evidenceById = new Map(
    input.livingProfile.profile.evidence.map((item) => [item.id, item]),
  );
  const sourceById = new Map(
    input.livingProfile.profile.sources.map((item) => [item.id, item]),
  );
  const claims = input.livingProfile.profile.claims
    .filter(
      (claim) =>
        claim.sensitivity !== 'restricted' &&
        claim.allowedUses.includes('application'),
    )
    .map((claim) => {
      const evidence = claim.evidenceIds.flatMap((evidenceId) => {
        const item = evidenceById.get(evidenceId);
        const source = item ? sourceById.get(item.sourceId) : undefined;
        if (
          !item ||
          !source ||
          source.sensitivity === 'restricted' ||
          !source.allowedUses.includes('application')
        )
          return [];
        return [
          {
            evidenceId: item.id,
            label: item.label,
            excerpt: item.excerpt,
            source: {
              sourceId: source.id,
              kind: source.kind,
              title: source.title,
              ...(source.locator ? { locator: source.locator } : {}),
              sensitivity: source.sensitivity,
              allowedUses: source.allowedUses,
              trust: source.trust,
            },
          },
        ];
      });
      return {
        claimId: claim.id,
        statement: claim.statement,
        kind: claim.kind,
        level: claim.level,
        sensitivity: claim.sensitivity as 'public' | 'private',
        allowedUses: claim.allowedUses,
        evidence,
      };
    })
    .filter((claim) => claim.evidence.length > 0);
  return parseSemanticAnalysisInput({
    schemaVersion: input.schemaVersion,
    purpose: input.purpose,
    job: input.job,
    softPreferences: input.softPreferences,
    profile: {
      profileSnapshotId: input.livingProfile.profileSnapshotId,
      revision: input.livingProfile.revision,
      claims,
    },
  });
}

export function parseSemanticAnalysisInput(
  raw: unknown,
): SemanticAnalysisInput {
  const input = semanticAnalysisInputSchema.parse(raw);
  assertBytes(input, MAX_MODEL_INPUT_BYTES, 'Semantic model input');
  return input;
}

export function buildSemanticAnalysis(
  rawInput: unknown,
  rawOutput: unknown,
): SemanticAnalysisArtifact {
  const input = parseSemanticAnalysisInput(rawInput);
  const output = semanticModelOutputSchema.parse(rawOutput);
  const claims = new Map(
    input.profile.claims.map((claim) => [claim.claimId, claim]),
  );
  for (const [section, items] of Object.entries(output))
    items.forEach((item, index) => {
      if (!input.job.description.includes(item.jobExcerpt))
        throw new Error(
          `Semantic ${section}[${index}] excerpt is not present in the job source.`,
        );
      for (const reference of item.profileReferences) {
        const claim = claims.get(reference.claimId);
        if (!claim)
          throw new Error(
            `Semantic ${section}[${index}] references an unknown claim.`,
          );
        const evidenceIds = new Set(
          claim.evidence.map((evidence) => evidence.evidenceId),
        );
        if (reference.evidenceIds.some((id) => !evidenceIds.has(id)))
          throw new Error(
            `Semantic ${section}[${index}] references evidence outside its claim.`,
          );
      }
    });
  const items = primaryItems(output);
  const factors = {
    strong: items.filter((item) => item.factor === 'strong').length,
    partial: items.filter((item) => item.factor === 'partial').length,
    gap: items.filter((item) => item.factor === 'gap').length,
    unknown: output.unknowns.length,
  };
  const knownFactorCount = factors.strong + factors.partial + factors.gap;
  const requirementCount = knownFactorCount + factors.unknown;
  const coveragePercent = Math.round(
    (knownFactorCount / requirementCount) * 100,
  );
  const confidence =
    knownFactorCount >= 3 && coveragePercent >= 75
      ? ('high' as const)
      : knownFactorCount >= 2 && coveragePercent >= 50
        ? ('medium' as const)
        : ('low' as const);
  const score = knownFactorCount
    ? Math.round(
        (factors.strong * 100 + factors.partial * 55) / knownFactorCount,
      )
    : null;
  const recommendation = recommendationFor(
    factors,
    score,
    knownFactorCount,
    coveragePercent,
  );
  return semanticAnalysisArtifactSchema.parse({
    schemaVersion: 1,
    purpose: 'application',
    opportunityId: input.job.opportunityId,
    jobRevision: input.job.revision,
    profileSnapshotId: input.profile.profileSnapshotId,
    profileRevision: input.profile.revision,
    analysis: output,
    decomposition: {
      factors,
      weights: { strong: 100, partial: 55, gap: 0, unknown: null },
      knownFactorCount,
      requirementCount,
      coveragePercent,
      confidence,
      explanatoryRiskCount: output.risks.length,
      score,
      recommendation,
      method: 'bounded-factor-decomposition-v1',
    },
  });
}

function recommendationFor(
  factors: { strong: number; partial: number; gap: number; unknown: number },
  score: number | null,
  knownFactorCount: number,
  coveragePercent: number,
) {
  if (score === null) return 'exploratory' as const;
  if (
    score >= 80 &&
    factors.strong >= 3 &&
    factors.gap === 0 &&
    coveragePercent >= 75
  )
    return 'priority' as const;
  if (
    score >= 60 &&
    factors.gap <= 1 &&
    knownFactorCount >= 2 &&
    coveragePercent >= 50
  )
    return 'interesting' as const;
  if (score >= 35) return 'exploratory' as const;
  return 'ignore' as const;
}

function semanticItems(output: SemanticModelOutput) {
  return [
    ...output.skills,
    ...output.responsibilities,
    ...output.transfers,
    ...output.gaps,
    ...output.unknowns,
    ...output.risks,
  ];
}

function primaryItems(output: SemanticModelOutput) {
  return [
    ...output.skills,
    ...output.responsibilities,
    ...output.transfers,
    ...output.gaps,
  ];
}

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('fr');
}

function assertBytes(value: unknown, maximum: number, label: string) {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error(`${label} is not serializable.`);
  }
  if (new TextEncoder().encode(serialized).byteLength > maximum)
    throw new Error(`${label} exceeds its size limit.`);
}

function unique<T>(
  context: z.RefinementCtx,
  values: T[],
  identity: (value: T) => string,
  path: PropertyKey[],
) {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const id = identity(value);
    if (seen.has(id))
      context.addIssue({
        code: 'custom',
        path: [...path, index],
        message: 'References must be unique.',
      });
    seen.add(id);
  });
}
