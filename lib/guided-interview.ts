import { z } from 'zod';
import { profileSchema, type Profile } from './schemas';
import { interviewQuestionIdSchema } from './interview-questions';

export const interviewSourceLocator = 'career-os:guided-interview:v1';
export const interviewDraftSchema = z
  .object({
    version: z.literal(1),
    step: z.number().int().min(0).max(5),
    answers: z.array(z.string().max(1000)).length(5),
    statement: z.string().max(3000),
    signedAt: z.iso.datetime().optional(),
    sessionId: z.uuid().optional(),
    targetStatement: z.string().min(1).max(5000).optional(),
    shareStatement: z.boolean().optional(),
    questionIds: z.array(interviewQuestionIdSchema).length(5).optional(),
  })
  .strict();
export type InterviewDraft = z.infer<typeof interviewDraftSchema>;
export const emptyInterview: InterviewDraft = {
  version: 1,
  step: 0,
  answers: ['', '', '', '', ''],
  statement: '',
};

export function readInterview(
  profile: Profile,
  sessionId?: string,
): InterviewDraft {
  const source = profile.sources.find(
    (item) => item.locator === interviewLocator(sessionId),
  );
  const evidence = profile.evidence.find(
    (item) => item.sourceId === source?.id,
  );
  if (!evidence) return emptyInterview;
  try {
    const parsed = interviewDraftSchema.safeParse(JSON.parse(evidence.excerpt));
    return parsed.success ? parsed.data : emptyInterview;
  } catch {
    return emptyInterview;
  }
}

export function interviewLocator(sessionId?: string) {
  return sessionId
    ? `${interviewSourceLocator}:${sessionId}`
    : interviewSourceLocator;
}

export function listInterviews(profile: Profile) {
  return profile.sources.flatMap((source) => {
    if (!source.locator?.startsWith(interviewSourceLocator)) return [];
    const sessionId =
      source.locator === interviewSourceLocator
        ? undefined
        : source.locator.slice(interviewSourceLocator.length + 1);
    if (sessionId && !z.uuid().safeParse(sessionId).success) return [];
    return [{ source, draft: readInterview(profile, sessionId) }];
  });
}

/** A user testimony stays declared: this never grants verified status or bypasses publication review. */
export function saveInterview(
  profile: Profile,
  input: InterviewDraft,
  ids: { source: string; evidence: string; claim: string },
  signedAt?: string,
): Profile {
  // Signed evidence is immutable here; repeated submissions must not create another claim.
  if (readInterview(profile, input.sessionId).signedAt) return profile;
  const draft = interviewDraftSchema.parse({
    ...input,
    signedAt,
  });
  if (
    signedAt &&
    (!draft.statement.trim() || !draft.answers.some((answer) => answer.trim()))
  )
    throw new Error('A testimony requires answers and an explicit statement.');
  const previousSource = profile.sources.find(
    (item) => item.locator === interviewLocator(draft.sessionId),
  );
  const sourceId = previousSource?.id ?? ids.source;
  const previousEvidence = profile.evidence.find(
    (item) => item.sourceId === sourceId,
  );
  const evidenceId = previousEvidence?.id ?? ids.evidence;
  return profileSchema.parse({
    ...profile,
    sources: [
      ...profile.sources.filter((s) => s.id !== sourceId),
      {
        id: sourceId,
        kind: 'manual',
        title: signedAt
          ? `Signed testimony · ${profile.name} · ${signedAt.slice(0, 10)}`
          : 'Guided interview · private draft',
        locator: interviewLocator(draft.sessionId),
        sensitivity: 'private',
        allowedUses: ['interview'],
        trust: 'untrusted-data',
      },
      ...(signedAt && draft.shareStatement
        ? [
            {
              id: `${ids.source}:statement`,
              kind: 'manual' as const,
              title: `Signed testimony · ${profile.name} · ${signedAt.slice(0, 10)}`,
              sensitivity: 'private' as const,
              allowedUses: [
                'application' as const,
                'resume' as const,
                'interview' as const,
              ],
              trust: 'untrusted-data' as const,
            },
          ]
        : []),
    ],
    evidence: [
      ...profile.evidence.filter((e) => e.id !== evidenceId),
      {
        id: evidenceId,
        sourceId,
        label: signedAt
          ? 'Declared by you · signed testimony'
          : 'Guided interview · draft',
        excerpt: JSON.stringify(draft),
      },
      ...(signedAt && draft.shareStatement
        ? [
            {
              id: `${ids.evidence}:statement`,
              sourceId: `${ids.source}:statement`,
              label: `Declared by ${profile.name} · ${signedAt.slice(0, 10)}`,
              // The private transcript (including possible references) never leaves interview scope.
              excerpt: draft.statement.trim(),
            },
          ]
        : []),
    ],
    claims: signedAt
      ? [
          ...profile.claims.map((claim) =>
            draft.shareStatement && claim.statement === draft.targetStatement
              ? { ...claim, level: 'unsupported' as const }
              : claim,
          ),
          {
            id: ids.claim,
            kind: 'experience',
            statement: draft.statement.trim(),
            level: 'declared',
            evidenceIds: [
              draft.shareStatement ? `${ids.evidence}:statement` : evidenceId,
            ],
            sensitivity: 'private',
            allowedUses: draft.shareStatement
              ? ['application', 'resume', 'interview']
              : ['interview'],
          },
        ]
      : profile.claims,
  });
}
