import { z } from 'zod';

const MAX_INPUT_BYTES = 96 * 1024;
const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const signalIdSchema = z.string().regex(/^signal-(?:[1-9]|1\d|20)$/);
const uuidSchema = z.string().uuid();

const evidenceSchema = z
  .object({
    evidenceId: uuidSchema,
    label: z.string().min(1).max(500),
    excerpt: z.string().min(1).max(2_000),
  })
  .strict();

const matchSchema = z
  .object({
    claimId: uuidSchema,
    statement: z.string().min(1).max(5_000),
    provenance: z.enum(['verified', 'declared']),
    evidence: z.array(evidenceSchema).min(1).max(3),
  })
  .strict()
  .superRefine((match, context) => {
    unique(context, match.evidence, (item) => item.evidenceId, ['evidence']);
  });

const strategySignalSchema = z
  .object({
    signalId: signalIdSchema,
    statement: z.string().min(1).max(500),
    excerpt: z.string().min(1).max(1_000),
    category: z.enum([
      'responsibility',
      'requirement',
      'culture',
      'constraint',
    ]),
    priority: z.enum(['high', 'medium', 'low']),
    coverage: z.enum(['verified_candidate', 'declared_candidate', 'unmatched']),
    matches: z.array(matchSchema).max(3),
  })
  .strict()
  .superRefine((signal, context) => {
    unique(context, signal.matches, (match) => match.claimId, ['matches']);
    const first = signal.matches[0];
    if ((signal.coverage === 'unmatched') !== !first)
      context.addIssue({
        code: 'custom',
        path: ['coverage'],
        message: 'Coverage must agree with its matches.',
      });
    if (first && signal.coverage !== `${first.provenance}_candidate`)
      context.addIssue({
        code: 'custom',
        path: ['coverage'],
        message: 'Coverage must agree with the first match provenance.',
      });
  });

export const recruiterStrategyInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    purpose: z.literal('application'),
    profileSnapshotId: uuidSchema,
    researchArtifactId: uuidSchema,
    researchArtifactHash: hashSchema,
    evidenceArchiveArtifactId: uuidSchema,
    evidenceArchiveArtifactHash: hashSchema,
    company: z.string().min(1).max(200),
    role: z.string().min(1).max(200),
    signals: z.array(strategySignalSchema).min(1).max(20),
  })
  .strict()
  .superRefine((input, context) => {
    unique(context, input.signals, (signal) => signal.signalId, ['signals']);
    const claims = new Map<string, string>();
    const evidence = new Map<string, string>();
    input.signals.forEach((signal, signalIndex) =>
      signal.matches.forEach((match, matchIndex) => {
        consistent(
          context,
          claims,
          match.claimId,
          JSON.stringify({
            statement: match.statement,
            provenance: match.provenance,
          }),
          ['signals', signalIndex, 'matches', matchIndex, 'claimId'],
          'Claim IDs must have consistent canonical content.',
        );
        match.evidence.forEach((item, evidenceIndex) =>
          consistent(
            context,
            evidence,
            item.evidenceId,
            JSON.stringify({ label: item.label, excerpt: item.excerpt }),
            [
              'signals',
              signalIndex,
              'matches',
              matchIndex,
              'evidence',
              evidenceIndex,
              'evidenceId',
            ],
            'Evidence IDs must have consistent canonical content.',
          ),
        );
      }),
    );
  });

const proofSelectionSchema = z
  .object({
    signalId: signalIdSchema,
    claimId: uuidSchema,
    evidenceIds: z.array(uuidSchema).min(1).max(2),
    rationale: z.string().min(1).max(240),
  })
  .strict()
  .superRefine((selection, context) => {
    unique(context, selection.evidenceIds, (id) => id, ['evidenceIds']);
  });

const gapSchema = z
  .object({
    signalId: signalIdSchema,
    treatment: z.enum(['acknowledge', 'interview_topic']),
    rationale: z.string().min(1).max(240),
  })
  .strict();

export const recruiterStrategyModelOutputSchema = z
  .object({
    positioning: z
      .object({
        message: z.string().min(20).max(320),
        sourceSignalIds: z.array(signalIdSchema).min(1).max(3),
      })
      .strict(),
    lead: proofSelectionSchema,
    supports: z.array(proofSelectionSchema).max(4),
    gaps: z.array(gapSchema).max(4),
    omittedSignalIds: z.array(signalIdSchema).max(20),
  })
  .strict()
  .superRefine((output, context) => {
    unique(context, output.positioning.sourceSignalIds, (id) => id, [
      'positioning',
      'sourceSignalIds',
    ]);
    unique(context, output.supports, (selection) => selection.signalId, [
      'supports',
    ]);
    unique(context, output.gaps, (gap) => gap.signalId, ['gaps']);
    unique(context, output.omittedSignalIds, (id) => id, ['omittedSignalIds']);
  });

export const recruiterStrategyArtifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    purpose: z.literal('application'),
    profileSnapshotId: uuidSchema,
    researchArtifactId: uuidSchema,
    researchArtifactHash: hashSchema,
    evidenceArchiveArtifactId: uuidSchema,
    evidenceArchiveArtifactHash: hashSchema,
    copyPolicy: z.literal('internal-editorial-direction'),
    positioning: recruiterStrategyModelOutputSchema.shape.positioning,
    lead: proofSelectionSchema,
    supports: z.array(proofSelectionSchema).max(4),
    gaps: z.array(gapSchema).max(4),
    omittedSignalIds: z.array(signalIdSchema).max(20),
  })
  .strict();

export type RecruiterStrategyInput = z.infer<
  typeof recruiterStrategyInputSchema
>;
export type RecruiterStrategyModelOutput = z.infer<
  typeof recruiterStrategyModelOutputSchema
>;
export type RecruiterStrategyArtifact = z.infer<
  typeof recruiterStrategyArtifactSchema
>;

export function parseRecruiterStrategyInput(
  value: unknown,
): RecruiterStrategyInput {
  const input = recruiterStrategyInputSchema.parse(value);
  if (utf8Bytes(JSON.stringify(input)) > MAX_INPUT_BYTES)
    throw new Error('Recruiter strategy input exceeds its size limit.');
  return input;
}

export function buildRecruiterStrategyArtifact(
  rawInput: RecruiterStrategyInput,
  rawOutput: RecruiterStrategyModelOutput,
): RecruiterStrategyArtifact {
  const input = parseRecruiterStrategyInput(rawInput);
  const output = recruiterStrategyModelOutputSchema.parse(rawOutput);
  const signalById = new Map(
    input.signals.map((signal) => [signal.signalId, signal]),
  );
  const proofSelections = [output.lead, ...output.supports];
  const categorizedSignalIds = [
    ...proofSelections.map((selection) => selection.signalId),
    ...output.gaps.map((gap) => gap.signalId),
    ...output.omittedSignalIds,
  ];

  assertExactPartition(
    input.signals.map((signal) => signal.signalId),
    categorizedSignalIds,
  );
  if (
    new Set(proofSelections.map((selection) => selection.signalId)).size !==
    proofSelections.length
  )
    throw new Error('Recruiter strategy proof signals must be unique.');

  const proofSignalIds = new Set(
    proofSelections.map((selection) => selection.signalId),
  );
  if (
    output.positioning.sourceSignalIds[0] !== output.lead.signalId ||
    output.positioning.sourceSignalIds.some((id) => !proofSignalIds.has(id))
  )
    throw new Error('Positioning must be anchored to selected proof signals.');

  const claimUse = new Map<string, number>();
  for (const selection of proofSelections) {
    const signal = signalById.get(selection.signalId);
    if (!signal)
      throw new Error('Recruiter strategy references an unknown signal.');
    const match = signal.matches.find(
      (candidate) => candidate.claimId === selection.claimId,
    );
    if (!match)
      throw new Error('Recruiter strategy references an ineligible claim.');
    const eligibleEvidence = new Set(
      match.evidence.map((item) => item.evidenceId),
    );
    if (selection.evidenceIds.some((id) => !eligibleEvidence.has(id)))
      throw new Error('Recruiter strategy references ineligible evidence.');
    const uses = (claimUse.get(selection.claimId) ?? 0) + 1;
    if (uses > 2)
      throw new Error('Recruiter strategy repeats a claim too often.');
    claimUse.set(selection.claimId, uses);
    assertNumbersGrounded(selection.rationale, [
      signal.statement,
      signal.excerpt,
      match.statement,
      ...match.evidence
        .filter((item) => selection.evidenceIds.includes(item.evidenceId))
        .flatMap((item) => [item.label, item.excerpt]),
    ]);
  }

  for (const gap of output.gaps) {
    const signal = signalById.get(gap.signalId);
    if (!signal)
      throw new Error('Recruiter strategy references an unknown gap.');
    assertNumbersGrounded(gap.rationale, [signal.statement, signal.excerpt]);
  }

  const positioningSources = output.positioning.sourceSignalIds.flatMap(
    (signalId) => {
      const signal = signalById.get(signalId);
      if (!signal) return [];
      const selection = proofSelections.find(
        (candidate) => candidate.signalId === signalId,
      );
      const match = signal.matches.find(
        (candidate) => candidate.claimId === selection?.claimId,
      );
      return [
        signal.statement,
        signal.excerpt,
        match?.statement ?? '',
        ...(match?.evidence.flatMap((item) => [item.label, item.excerpt]) ??
          []),
      ];
    },
  );
  assertNumbersGrounded(output.positioning.message, positioningSources);

  return recruiterStrategyArtifactSchema.parse({
    schemaVersion: 1,
    purpose: input.purpose,
    profileSnapshotId: input.profileSnapshotId,
    researchArtifactId: input.researchArtifactId,
    researchArtifactHash: input.researchArtifactHash,
    evidenceArchiveArtifactId: input.evidenceArchiveArtifactId,
    evidenceArchiveArtifactHash: input.evidenceArchiveArtifactHash,
    copyPolicy: 'internal-editorial-direction',
    ...output,
  });
}

function assertExactPartition(expected: string[], actual: string[]) {
  if (
    actual.length !== expected.length ||
    new Set(actual).size !== actual.length ||
    expected.some((id) => !actual.includes(id))
  )
    throw new Error('Recruiter strategy must classify every signal once.');
}

function assertNumbersGrounded(value: string, sources: string[]) {
  const allowed = new Set(sources.flatMap(numericTokens));
  if (numericTokens(value).some((token) => !allowed.has(token)))
    throw new Error('Recruiter strategy contains an unsupported number.');
}

function numericTokens(value: string): string[] {
  return (
    value
      .normalize('NFKC')
      .match(/\d+(?:[.,]\d+)?\s*%?/g)
      ?.map((token) => token.replace(/\s+/g, '').replace(',', '.')) ?? []
  );
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

function consistent(
  context: z.RefinementCtx,
  seen: Map<string, string>,
  id: string,
  canonical: string,
  path: PropertyKey[],
  message: string,
) {
  const previous = seen.get(id);
  if (previous !== undefined && previous !== canonical)
    context.addIssue({ code: 'custom', path, message });
  else seen.set(id, canonical);
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
