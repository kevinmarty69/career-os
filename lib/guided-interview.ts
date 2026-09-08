import { z } from 'zod';
import { profileSchema, type Profile } from './schemas';

export const interviewSourceLocator = 'career-os:guided-interview:v1';
export const interviewDraftSchema = z
  .object({
    version: z.literal(1),
    step: z.number().int().min(0).max(5),
    answers: z.array(z.string().max(1000)).length(5),
    statement: z.string().max(3000),
    signedAt: z.iso.datetime().optional(),
  })
  .strict();
export type InterviewDraft = z.infer<typeof interviewDraftSchema>;
export const emptyInterview: InterviewDraft = {
  version: 1,
  step: 0,
  answers: ['', '', '', '', ''],
  statement: '',
};

export function readInterview(profile: Profile): InterviewDraft {
  const source = profile.sources.find(
    (item) => item.locator === interviewSourceLocator,
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

/** A user testimony stays declared: this never grants verified status or bypasses publication review. */
export function saveInterview(
  profile: Profile,
  input: InterviewDraft,
  ids: { source: string; evidence: string; claim: string },
  signedAt?: string,
): Profile {
  // Signed evidence is immutable here; repeated submissions must not create another claim.
  if (readInterview(profile).signedAt) return profile;
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
    (item) => item.locator === interviewSourceLocator,
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
        locator: interviewSourceLocator,
        sensitivity: 'private',
        allowedUses: ['interview'],
        trust: 'untrusted-data',
      },
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
    ],
    claims: signedAt
      ? [
          ...profile.claims,
          {
            id: ids.claim,
            kind: 'experience',
            statement: draft.statement.trim(),
            level: 'declared',
            evidenceIds: [evidenceId],
            sensitivity: 'private',
            allowedUses: ['interview'],
          },
        ]
      : profile.claims,
  });
}
