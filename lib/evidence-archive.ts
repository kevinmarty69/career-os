import { z } from 'zod';

const evidenceCandidateSchema = z
  .object({
    evidenceId: z.string().uuid(),
    label: z.string().min(1).max(500),
    excerpt: z.string().min(1).max(2_000),
  })
  .strict();

const claimCandidateSchema = z
  .object({
    claimId: z.string().uuid(),
    position: z.number().int().nonnegative().max(99),
    statement: z.string().min(1).max(5_000),
    level: z.enum(['verified', 'declared']),
    evidence: z.array(evidenceCandidateSchema).min(1).max(10),
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

export const evidenceArchiveInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    purpose: z.literal('application'),
    profileSnapshotId: z.string().uuid(),
    researchArtifactId: z.string().uuid(),
    researchArtifactHash: z.string().regex(/^[0-9a-f]{64}$/),
    signals: z.array(researchSignalSchema).min(1).max(20),
    candidates: z.array(claimCandidateSchema).max(100),
  })
  .strict()
  .superRefine((input, context) => {
    unique(context, input.signals, (signal) => signal.signalId, ['signals']);
    unique(context, input.candidates, (candidate) => candidate.claimId, [
      'candidates',
    ]);
    input.candidates.forEach((candidate, index) =>
      unique(context, candidate.evidence, (evidence) => evidence.evidenceId, [
        'candidates',
        index,
        'evidence',
      ]),
    );
  });

const archiveMatchSchema = z
  .object({
    claimId: z.string().uuid(),
    evidenceIds: z.array(z.string().uuid()).min(1).max(3),
    provenance: z.enum(['verified', 'declared']),
    relevanceScore: z.number().int().min(0).max(100),
  })
  .strict();

export const evidenceArchiveOutputSchema = z
  .object({
    schemaVersion: z.literal(1),
    purpose: z.literal('application'),
    profileSnapshotId: z.string().uuid(),
    researchArtifactId: z.string().uuid(),
    researchArtifactHash: z.string().regex(/^[0-9a-f]{64}$/),
    signals: z
      .array(
        z
          .object({
            signalId: z.string().regex(/^signal-(?:[1-9]|1\d|20)$/),
            coverage: z.enum([
              'verified_candidate',
              'declared_candidate',
              'unmatched',
            ]),
            matches: z.array(archiveMatchSchema).max(3),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict()
  .superRefine((output, context) => {
    unique(context, output.signals, (signal) => signal.signalId, ['signals']);
    output.signals.forEach((signal, signalIndex) => {
      unique(context, signal.matches, (match) => match.claimId, [
        'signals',
        signalIndex,
        'matches',
      ]);
      signal.matches.forEach((match, matchIndex) =>
        unique(context, match.evidenceIds, (evidenceId) => evidenceId, [
          'signals',
          signalIndex,
          'matches',
          matchIndex,
          'evidenceIds',
        ]),
      );
      if ((signal.coverage === 'unmatched') !== (signal.matches.length === 0))
        context.addIssue({
          code: 'custom',
          path: ['signals', signalIndex, 'coverage'],
          message: 'Coverage must agree with its matches.',
        });
    });
  });

export type EvidenceArchiveInput = z.infer<typeof evidenceArchiveInputSchema>;
export type EvidenceArchiveOutput = z.infer<typeof evidenceArchiveOutputSchema>;

const ignoredWords = new Set([
  'and',
  'avec',
  'aux',
  'build',
  'chez',
  'dans',
  'des',
  'for',
  'from',
  'les',
  'pour',
  'que',
  'qui',
  'sur',
  'the',
  'une',
  'with',
]);

export function buildEvidenceArchive(
  rawInput: EvidenceArchiveInput,
): EvidenceArchiveOutput {
  const input = evidenceArchiveInputSchema.parse(rawInput);
  return evidenceArchiveOutputSchema.parse({
    schemaVersion: 1,
    purpose: input.purpose,
    profileSnapshotId: input.profileSnapshotId,
    researchArtifactId: input.researchArtifactId,
    researchArtifactHash: input.researchArtifactHash,
    signals: input.signals.map((signal) => {
      const signalWords = keywords(`${signal.statement} ${signal.excerpt}`);
      const threshold = signalWords.size <= 3 ? 1 : 2;
      const matches = input.candidates
        .map((candidate) => scoreCandidate(signalWords, candidate))
        .filter((candidate) => candidate.sharedWords >= threshold)
        .sort(compareCandidates)
        .slice(0, 3)
        .map(({ candidate, evidenceIds, relevanceScore }) => ({
          claimId: candidate.claimId,
          evidenceIds,
          provenance: candidate.level,
          relevanceScore,
        }));
      return {
        signalId: signal.signalId,
        coverage: matches.length
          ? matches[0].provenance === 'verified'
            ? ('verified_candidate' as const)
            : ('declared_candidate' as const)
          : ('unmatched' as const),
        matches,
      };
    }),
  });
}

function scoreCandidate(
  signalWords: Set<string>,
  candidate: EvidenceArchiveInput['candidates'][number],
) {
  const statementShared = overlap(signalWords, keywords(candidate.statement));
  const rankedEvidence = candidate.evidence
    .map((evidence) => ({
      evidence,
      sharedWords: overlap(
        signalWords,
        keywords(`${evidence.label} ${evidence.excerpt}`),
      ),
    }))
    .sort(
      (left, right) =>
        right.sharedWords - left.sharedWords ||
        left.evidence.evidenceId.localeCompare(right.evidence.evidenceId),
    );
  const evidenceShared = rankedEvidence[0]?.sharedWords ?? 0;
  const denominator = Math.max(1, signalWords.size);
  return {
    candidate,
    evidenceIds: rankedEvidence
      .slice(0, 3)
      .map(({ evidence }) => evidence.evidenceId),
    sharedWords: new Set([
      ...sharedTerms(signalWords, keywords(candidate.statement)),
      ...rankedEvidence.flatMap(({ evidence }) =>
        sharedTerms(
          signalWords,
          keywords(`${evidence.label} ${evidence.excerpt}`),
        ),
      ),
    ]).size,
    relevanceScore: Math.min(
      100,
      Math.round(
        (statementShared / denominator) * 60 +
          (evidenceShared / denominator) * 40,
      ),
    ),
  };
}

function compareCandidates(
  left: ReturnType<typeof scoreCandidate>,
  right: ReturnType<typeof scoreCandidate>,
) {
  return (
    right.relevanceScore - left.relevanceScore ||
    Number(right.candidate.level === 'verified') -
      Number(left.candidate.level === 'verified') ||
    right.candidate.evidence.length - left.candidate.evidence.length ||
    left.candidate.position - right.candidate.position ||
    left.candidate.claimId.localeCompare(right.candidate.claimId)
  );
}

function keywords(value: string) {
  return new Set(
    value
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLocaleLowerCase('fr')
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((word) => word.length > 2 && !ignoredWords.has(word)) ?? [],
  );
}

function overlap(left: Set<string>, right: Set<string>) {
  return sharedTerms(left, right).length;
}

function sharedTerms(left: Set<string>, right: Set<string>) {
  return [...left].filter((word) => right.has(word));
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
        message: 'IDs must be unique.',
      });
    seen.add(id);
  });
}
