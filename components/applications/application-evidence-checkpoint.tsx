'use client';

import { useI18n, useLocalizer } from '@/components/i18n/i18n-provider';
import { dossierMessages } from '@/lib/i18n/dictionaries/dossier';
import type { PersistedRun } from '@/lib/run-contract';

type EvidenceArchive = NonNullable<PersistedRun['evidenceArchive']>;
type Research = NonNullable<PersistedRun['research']>;

export function ApplicationEvidenceCheckpoint({
  archive,
  error,
  onConfirm,
  pending,
  profile,
  research,
}: {
  archive: EvidenceArchive;
  error: boolean;
  onConfirm: () => void;
  pending: boolean;
  profile: PersistedRun['profile'];
  research: Research;
}) {
  const { locale } = useI18n();
  const localize = useLocalizer([dossierMessages]);
  const claims = new Map(profile.claims.map((claim) => [claim.id, claim]));
  const evidence = new Map(profile.evidence.map((item) => [item.id, item]));
  const signals = new Map(
    research.signals.map((signal) => [signal.signalId, signal]),
  );
  const matched = archive.signals.filter((signal) => signal.matches.length);

  return localize(
    <section className="co-panel co-research-checkpoint co-evidence-checkpoint">
      <header>
        <div>
          <p>Preuves candidates</p>
          <h2>Ce que votre parcours démontre pour ce poste</h2>
        </div>
        <span>
          {locale === 'en'
            ? `${matched.length} of ${archive.signals.length} signals covered`
            : `${matched.length} signal${matched.length > 1 ? 'aux' : ''} couvert${matched.length > 1 ? 's' : ''} sur ${archive.signals.length}`}
        </span>
      </header>
      <p>
        Le matching est limité aux affirmations autorisées pour une candidature.
        Vérifiez la sélection avant de lancer la stratégie.
      </p>
      <div className="co-evidence-groups">
        {archive.signals.map((signal) => {
          const source = signals.get(signal.signalId);
          return (
            <article key={signal.signalId}>
              <header>
                <strong>{source?.statement ?? signal.signalId}</strong>
                <span data-coverage={signal.coverage}>
                  {coverageLabel(signal.coverage, locale)}
                </span>
              </header>
              {signal.matches.length ? (
                <ul>
                  {signal.matches.map((match) => {
                    const claim = claims.get(match.claimId);
                    return (
                      <li key={match.claimId}>
                        <strong>{claim?.statement ?? match.claimId}</strong>
                        <small>
                          {match.evidenceIds
                            .map((id) => evidence.get(id)?.label ?? id)
                            .join(' · ')}
                        </small>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p>
                  Aucune preuve éligible trouvée. Cet écart restera visible.
                </p>
              )}
            </article>
          );
        })}
      </div>
      {error ? (
        <p role="alert">
          La stratégie n’a pas démarré. Vous pouvez réessayer sans risque de
          doublon.
        </p>
      ) : null}
      <footer>
        <span>Vos faits restent inchangés. Seul leur ordre sera proposé.</span>
        <button
          className="co-button"
          disabled={pending}
          onClick={onConfirm}
          type="button"
        >
          {pending
            ? locale === 'en'
              ? 'Starting…'
              : 'Démarrage…'
            : locale === 'en'
              ? 'Start application strategy'
              : 'Lancer la stratégie de candidature'}
        </button>
      </footer>
    </section>,
  );
}

function coverageLabel(
  coverage: EvidenceArchive['signals'][number]['coverage'],
  locale: 'en' | 'fr',
) {
  const labels = {
    verified_candidate: ['Verified evidence', 'Preuve vérifiée'],
    declared_candidate: ['Declared evidence', 'Preuve déclarée'],
    unmatched: ['Gap', 'Écart'],
  } as const;
  return labels[coverage][locale === 'en' ? 0 : 1];
}
