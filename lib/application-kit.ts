import type { PersistedRun } from './run-contract';
import { runReviews } from './workflow';

type Strategy = NonNullable<PersistedRun['strategy']>;
type Research = NonNullable<PersistedRun['research']>;

export type ApplicationKit = {
  questions: Array<{ sourceSignalId: string; text: string }>;
  messages: Array<{
    kind: 'contact' | 'application';
    sourceClaimIds: string[];
    text: string;
  }>;
  workSample?: {
    sourceSignalId: string;
    title: string;
    brief: string;
  };
};

export function buildApplicationKit({
  company,
  locale,
  profile,
  spec,
  research,
  role,
  strategy,
}: {
  company: string;
  locale: 'en' | 'fr';
  profile: PersistedRun['profile'];
  spec: PersistedRun['spec'];
  research: Research;
  role: string;
  strategy: Strategy;
}): ApplicationKit {
  const signals = new Map(
    research.signals.map((signal) => [signal.signalId, signal]),
  );
  const selectedIds = new Set(
    spec?.blocks.flatMap((block) =>
      'claimIds' in block ? block.claimIds : [],
    ),
  );
  // The current draft, not the inherited strategy, owns corrected wording.
  const leadClaim = profile.claims.find(
    (claim) =>
      selectedIds.has(claim.id) && claim.statement === spec?.hero.thesis,
  );
  const questionSignalIds = [
    ...strategy.gaps.map((gap) => gap.signalId),
    strategy.lead.signalId,
  ].filter((id, index, ids) => ids.indexOf(id) === index);
  const questions = questionSignalIds.slice(0, 3).flatMap((sourceSignalId) => {
    const signal = signals.get(sourceSignalId);
    if (!signal) return [];
    const subject = trimSentence(signal.statement);
    return [
      {
        sourceSignalId,
        text:
          locale === 'en'
            ? `What would strong ownership of “${subject}” look like during the first 90 days?`
            : `À quoi ressemblerait une vraie prise en main de « ${subject} » pendant les 90 premiers jours ?`,
      },
    ];
  });
  const proof = trimSentence(leadClaim?.statement ?? '');
  const messages =
    leadClaim &&
    spec &&
    runReviews(profile, spec).some(
      (review) => review.reviewer === 'factuality' && review.passed,
    )
      ? [
          {
            kind: 'contact' as const,
            sourceClaimIds: [leadClaim.id],
            text:
              locale === 'en'
                ? `Hi, I’m exploring the ${role} role at ${company}. My experience — ${proof} — looks directly relevant. Would you be open to a short conversation?`
                : `Bonjour, je m’intéresse au poste de ${role} chez ${company}. Mon expérience - ${proof} - me semble directement pertinente. Seriez-vous disponible pour un court échange ?`,
          },
          {
            kind: 'application' as const,
            sourceClaimIds: [leadClaim.id],
            text:
              locale === 'en'
                ? `I’m applying for the ${role} role at ${company}. ${leadClaim.statement} The attached page links every application claim to its supporting evidence and keeps the open questions explicit.`
                : `Je candidate au poste de ${role} chez ${company}. ${leadClaim.statement} La page jointe relie chaque affirmation à sa preuve et expose clairement les questions encore ouvertes.`,
          },
        ]
      : [];
  const sampleSignal = research.signals.find(
    (signal) =>
      signal.priority === 'high' &&
      ['responsibility', 'requirement'].includes(signal.category) &&
      strategy.gaps.some((gap) => gap.signalId === signal.signalId),
  );

  return {
    questions,
    messages,
    ...(sampleSignal
      ? {
          workSample: {
            sourceSignalId: sampleSignal.signalId,
            title:
              locale === 'en'
                ? `A bounded note on ${trimSentence(sampleSignal.statement)}`
                : `Une note ciblée sur ${trimSentence(sampleSignal.statement)}`,
            brief:
              locale === 'en'
                ? 'Maximum two hours: assumptions, boundaries, failure modes and a validation plan. Create it only if the team confirms it would help the decision.'
                : 'Deux heures maximum : hypothèses, limites, modes de défaillance et plan de validation. À produire uniquement si l’équipe confirme que cela aide sa décision.',
          },
        }
      : {}),
  };
}

function trimSentence(value: string) {
  return value.trim().replace(/[.!?]+$/, '');
}
