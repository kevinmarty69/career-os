'use client';

import { useState, type CSSProperties } from 'react';
import { useI18n, useLocalizer } from '@/components/i18n/i18n-provider';
import { dossierMessages } from '@/lib/i18n/dictionaries/dossier';
import type { PersistedRun } from '@/lib/run-contract';

type PageSpec = NonNullable<PersistedRun['spec']>;

export function ApplicationPageDraftCheckpoint({
  error,
  onConfirm,
  pending,
  profile,
  spec,
  logoUrl,
}: {
  error: boolean;
  onConfirm: () => void;
  pending: boolean;
  profile: PersistedRun['profile'];
  spec: PageSpec;
  logoUrl?: string;
}) {
  const { locale } = useI18n();
  const localize = useLocalizer([dossierMessages]);
  const claims = new Map(profile.claims.map((claim) => [claim.id, claim]));
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');

  return localize(
    <section className="co-panel co-research-checkpoint co-page-draft-checkpoint">
      <header>
        <div>
          <p>Page structurée</p>
          <h2>Relisez le brouillon avant les reviews</h2>
        </div>
        <span>
          {locale === 'en'
            ? `${spec.blocks.length} deterministic block${spec.blocks.length === 1 ? '' : 's'}`
            : `${spec.blocks.length} bloc${spec.blocks.length === 1 ? '' : 's'} déterministe${spec.blocks.length === 1 ? '' : 's'}`}
        </span>
      </header>
      <div
        aria-label={locale === 'en' ? 'Preview size' : 'Taille de l’aperçu'}
        className="co-preview-toolbar"
        role="group"
      >
        <button
          aria-pressed={viewport === 'desktop'}
          onClick={() => setViewport('desktop')}
          type="button"
        >
          Desktop
        </button>
        <button
          aria-pressed={viewport === 'mobile'}
          onClick={() => setViewport('mobile')}
          type="button"
        >
          Mobile
        </button>
      </div>
      <section
        className={`co-page-draft-preview ${viewport}`}
        style={{ '--co-preview-accent': spec.company.accent } as CSSProperties}
      >
        <header>
          <div>
            {logoUrl ? (
              // User-supplied remote hosts cannot be declared in Next image config.
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" src={logoUrl} />
            ) : null}
            <small>{spec.hero.eyebrow}</small>
          </div>
          <h3>{spec.hero.title}</h3>
          <p>{spec.hero.thesis}</p>
          <span>
            {spec.company.name} · {spec.company.role}
          </span>
        </header>
        <div>
          {spec.blocks.map((block, index) => (
            <article key={`${block.type}:${index}`}>
              <small>{blockTypeLabel(block.type, locale)}</small>
              <strong>{block.title}</strong>
              {'claimIds' in block ? (
                <ul>
                  {block.claimIds.map((claimId) => (
                    <li key={claimId}>
                      {claims.get(claimId)?.statement ?? claimId}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{block.text}</p>
              )}
            </article>
          ))}
        </div>
      </section>
      <p>
        Les trois reviewers vérifieront maintenant la lisibilité recruteur, la
        pertinence hiring manager et chaque affirmation factuelle.
      </p>
      {error ? (
        <p role="alert">
          Les reviews n’ont pas démarré. Vous pouvez réessayer sans créer de
          doublon.
        </p>
      ) : null}
      <footer>
        <span>La publication reste bloquée pendant les contrôles.</span>
        <button
          className="co-button"
          disabled={pending}
          onClick={onConfirm}
          type="button"
        >
          {pending
            ? locale === 'en'
              ? 'Starting reviews…'
              : 'Démarrage des reviews…'
            : locale === 'en'
              ? 'Start the three reviews'
              : 'Lancer les trois reviews'}
        </button>
      </footer>
    </section>,
  );
}

function blockTypeLabel(
  type: PageSpec['blocks'][number]['type'],
  locale: 'en' | 'fr',
) {
  const labels = {
    fit: ['Role fit', 'Adéquation au rôle'],
    evidence: ['Evidence', 'Preuves'],
    gap: ['Gap', 'Écart'],
  } as const;
  return labels[type][locale === 'en' ? 0 : 1];
}
