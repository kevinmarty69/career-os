'use client';

import { useState } from 'react';
import { useI18n, useLocalizer } from '@/components/i18n/i18n-provider';
import { dossierMessages } from '@/lib/i18n/dictionaries/dossier';
import type { PersistedRun } from '@/lib/run-contract';

type Research = NonNullable<PersistedRun['research']>;

export function ApplicationResearchCheckpoint({
  error,
  pending,
  research,
  onConfirm,
}: {
  error: boolean;
  pending: boolean;
  research: Research;
  onConfirm: (signalIds: string[]) => void;
}) {
  const { locale } = useI18n();
  const localize = useLocalizer([dossierMessages]);
  const [selected, setSelected] = useState(() =>
    research.signals.map(({ signalId }) => signalId),
  );
  const sources =
    'sources' in research
      ? research.sources.flatMap((source) =>
          'finalUrl' in source ? [source] : [],
        )
      : [];

  return localize(
    <section className="co-panel co-research-checkpoint">
      <header>
        <div>
          <p>Décision humaine requise</p>
          <h2>Quels signaux doivent cadrer la candidature ?</h2>
        </div>
        <span>
          {locale === 'en'
            ? `${research.signals.length} sourced signal${research.signals.length > 1 ? 's' : ''}`
            : `${research.signals.length} signal${research.signals.length > 1 ? 'aux' : ''} sourcé${research.signals.length > 1 ? 's' : ''}`}
        </span>
      </header>
      <p>
        L’agent a extrait ces éléments. Vérifiez-les avant qu’ils influencent la
        sélection des preuves et la stratégie.
      </p>
      {sources.length ? (
        <div className="co-research-sources">
          {sources.map((source) => (
            <a
              href={source.finalUrl}
              key={source.sourceId}
              rel="noreferrer"
              target="_blank"
            >
              {new URL(source.finalUrl).hostname}
            </a>
          ))}
        </div>
      ) : research.source.url ? (
        <div className="co-research-sources">
          <a href={research.source.url} rel="noreferrer" target="_blank">
            {new URL(research.source.url).hostname}
          </a>
        </div>
      ) : null}
      <div className="co-research-signals">
        {research.signals.map((signal) => (
          <label key={signal.signalId}>
            <input
              checked={selected.includes(signal.signalId)}
              disabled={pending}
              onChange={(event) =>
                setSelected((current) =>
                  event.target.checked
                    ? [...current, signal.signalId]
                    : current.filter((id) => id !== signal.signalId),
                )
              }
              type="checkbox"
            />
            <span>
              <small>
                {categoryLabel(signal.category, locale)} ·{' '}
                {priorityLabel(signal.priority, locale)}
              </small>
              <strong>{signal.statement}</strong>
              <q>{signal.excerpt}</q>
            </span>
          </label>
        ))}
      </div>
      {error ? (
        <p role="alert">
          La validation n’a pas été enregistrée. Vos choix sont conservés.
        </p>
      ) : null}
      <footer>
        <span>Données web non fiables jusqu’à votre validation.</span>
        <button
          className="co-button"
          disabled={pending || selected.length === 0}
          onClick={() => onConfirm(selected)}
          type="button"
        >
          {pending
            ? locale === 'en'
              ? 'Saving…'
              : 'Enregistrement…'
            : locale === 'en'
              ? `Confirm ${selected.length} signal${selected.length > 1 ? 's' : ''}`
              : `Confirmer ${selected.length} signal${selected.length > 1 ? 'aux' : ''}`}
        </button>
      </footer>
    </section>,
  );
}

function categoryLabel(category: string, locale: 'en' | 'fr') {
  const labels: Record<string, [string, string]> = {
    responsibility: ['Responsibility', 'Responsabilité'],
    requirement: ['Requirement', 'Exigence'],
    culture: ['Culture', 'Culture'],
    constraint: ['Constraint', 'Contrainte'],
  };
  return labels[category]?.[locale === 'en' ? 0 : 1] ?? category;
}

function priorityLabel(priority: string, locale: 'en' | 'fr') {
  const labels: Record<string, [string, string]> = {
    high: ['High priority', 'Priorité haute'],
    medium: ['Medium priority', 'Priorité moyenne'],
    low: ['Low priority', 'Priorité basse'],
  };
  return labels[priority]?.[locale === 'en' ? 0 : 1] ?? priority;
}
