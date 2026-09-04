'use client';

import { useI18n, useLocalizer } from '@/components/i18n/i18n-provider';
import { dossierMessages } from '@/lib/i18n/dictionaries/dossier';
import type { PersistedRun } from '@/lib/run-contract';

type Strategy = NonNullable<PersistedRun['strategy']>;
type Research = NonNullable<PersistedRun['research']>;

export function ApplicationStrategyCheckpoint({
  error,
  onConfirm,
  pending,
  profile,
  research,
  strategy,
}: {
  error: boolean;
  onConfirm: () => void;
  pending: boolean;
  profile: PersistedRun['profile'];
  research: Research;
  strategy: Strategy;
}) {
  const { locale } = useI18n();
  const localize = useLocalizer([dossierMessages]);
  const claims = new Map(profile.claims.map((claim) => [claim.id, claim]));
  const signals = new Map(
    research.signals.map((signal) => [signal.signalId, signal]),
  );
  const proofs = [strategy.lead, ...strategy.supports];

  return localize(
    <section className="co-panel co-research-checkpoint co-strategy-checkpoint">
      <header>
        <div>
          <p>Direction éditoriale interne</p>
          <h2>Validez l’angle avant la rédaction</h2>
        </div>
        <span>{locale === 'en' ? 'Human approval' : 'Validation humaine'}</span>
      </header>
      <blockquote>{strategy.positioning.message}</blockquote>
      <p>
        Cet angle guide la future page. Il ne crée aucun nouveau fait et reste
        ancré aux preuves ci-dessous.
      </p>
      <div className="co-strategy-proof-grid">
        {proofs.map((proof, index) => (
          <article key={`${proof.signalId}:${proof.claimId}`}>
            <small>{index === 0 ? 'Preuve principale' : 'Appui'}</small>
            <strong>
              {claims.get(proof.claimId)?.statement ?? proof.claimId}
            </strong>
            <span>{signals.get(proof.signalId)?.statement}</span>
            <p>{proof.rationale}</p>
          </article>
        ))}
      </div>
      {strategy.gaps.length ? (
        <section className="co-strategy-gaps">
          <strong>Sujets à traiter honnêtement</strong>
          {strategy.gaps.map((gap) => (
            <article key={gap.signalId}>
              <span>{signals.get(gap.signalId)?.statement}</span>
              <small>{gap.rationale}</small>
            </article>
          ))}
        </section>
      ) : null}
      <p>
        {locale === 'en'
          ? `${strategy.omittedSignalIds.length} signal${strategy.omittedSignalIds.length === 1 ? '' : 's'} intentionally omitted from the short page.`
          : `${strategy.omittedSignalIds.length} signal${strategy.omittedSignalIds.length === 1 ? '' : 'aux'} volontairement écarté${strategy.omittedSignalIds.length === 1 ? '' : 's'} de la page courte.`}
      </p>
      {error ? (
        <p role="alert">
          La validation n’a pas été enregistrée. Vous pouvez réessayer sans
          risque de doublon.
        </p>
      ) : null}
      <footer>
        <span>La rédaction ne démarrera qu’après votre décision.</span>
        <button
          className="co-button"
          disabled={pending}
          onClick={onConfirm}
          type="button"
        >
          {pending
            ? locale === 'en'
              ? 'Approving…'
              : 'Validation…'
            : locale === 'en'
              ? 'Approve application strategy'
              : 'Valider la stratégie de candidature'}
        </button>
      </footer>
    </section>,
  );
}
