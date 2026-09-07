'use client';

import { useState, type CSSProperties } from 'react';
import { useI18n, useTranslations } from '@/components/i18n/i18n-provider';
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
  mode = 'draft',
}: {
  error: boolean;
  onConfirm: () => void;
  pending: boolean;
  profile: PersistedRun['profile'];
  spec: PageSpec;
  logoUrl?: string;
  mode?: 'draft' | 'preview';
}) {
  const { locale } = useI18n();
  const t = useTranslations([dossierMessages]);
  const claims = new Map(profile.claims.map((claim) => [claim.id, claim]));
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');

  return (
    <section className="co-panel co-research-checkpoint co-page-draft-checkpoint">
      <header>
        <div>
          <p>{t('dossier.structured.page')}</p>
          <h2>
            {mode === 'preview'
              ? locale === 'en'
                ? 'Review before creating the private link'
                : 'Vérifiez avant de créer le lien privé'
              : t('dossier.review.the.draft.before.the.checks')}
          </h2>
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
        {mode === 'preview'
          ? locale === 'en'
            ? 'This is the exact immutable snapshot the recipient will see. Evidence remains inspectable and the page is not indexed.'
            : 'Voici l’instantané immuable exact que verra le destinataire. Les preuves restent consultables et la page n’est pas indexée.'
          : t(
              'dossier.three.reviewers.will.now.check.recruiter.readability.hiring.manager',
            )}
      </p>
      {error ? (
        <p role="alert">
          {t(
            'dossier.reviews.did.not.start.you.can.retry.without.creating',
          )}{' '}
        </p>
      ) : null}
      <footer>
        <span>
          {mode === 'preview'
            ? t('dossier.no.link.is.created.without.this.action')
            : t('dossier.publishing.remains.blocked.during.the.checks')}
        </span>
        <button
          className="co-button"
          disabled={pending}
          onClick={onConfirm}
          type="button"
        >
          {pending
            ? locale === 'en'
              ? mode === 'preview'
                ? 'Creating link…'
                : 'Starting reviews…'
              : mode === 'preview'
                ? 'Création du lien…'
                : 'Démarrage des reviews…'
            : locale === 'en'
              ? mode === 'preview'
                ? 'Approve and create private link'
                : 'Start the three reviews'
              : mode === 'preview'
                ? 'Valider et créer le lien privé'
                : 'Lancer les trois reviews'}
        </button>
      </footer>
    </section>
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
