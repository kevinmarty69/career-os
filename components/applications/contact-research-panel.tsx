'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/components/i18n/i18n-provider';
import { contactResearchResponseSchema } from '@/lib/contact-research';
import {
  applicationContactSchema,
  type ApplicationContact,
  type ApplicationContactDraft,
} from '@/lib/application-contact';
import { createApplicationContact } from '@/lib/career-api';

type Research = NonNullable<
  ReturnType<typeof contactResearchResponseSchema.parse>['research']
>;

export function ContactResearchPanel({
  applicationId,
  contacts,
  onAccepted,
}: {
  applicationId: string;
  contacts: ApplicationContact[];
  onAccepted: (contact: ApplicationContact) => void;
}) {
  const { locale } = useI18n();
  const en = locale === 'en';
  const [research, setResearch] = useState<Research | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState('');
  const [urls, setUrls] = useState('');
  const request = useRef<AbortController | null>(null);
  const endpoint = `/api/applications/${applicationId}/contacts/research`;

  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        if (response.ok)
          setResearch(
            contactResearchResponseSchema.parse(await response.json()).research,
          );
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, [endpoint]);

  async function launch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setWaiting(true);
    setError('');
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          urls: urls.split(/\s+/).filter(Boolean),
          locale,
        }),
      });
      if (!response.ok)
        throw new Error(response.status === 429 ? 'limit' : 'unavailable');
      setResearch(
        contactResearchResponseSchema.parse(await response.json()).research,
      );
    } catch (failure) {
      setError(
        controller.signal.aborted
          ? en
            ? 'Waiting stopped. The bounded server search may finish; reopen contacts to retrieve it. It will not be sent twice.'
            : 'Attente arrêtée. La recherche serveur peut terminer ; rouvrez les contacts pour la retrouver. Aucun double envoi.'
          : failure instanceof Error && failure.message === 'limit'
            ? en
              ? 'Daily limit reached: three searches per workspace.'
              : 'Limite atteinte : trois recherches par espace et par jour.'
            : en
              ? 'Research unavailable. Check the configured model and public source URLs. No contact was added.'
              : 'Recherche indisponible. Vérifiez le modèle configuré et les URL publiques. Aucun contact ajouté.',
      );
    } finally {
      request.current = null;
      setWaiting(false);
      setBusy(false);
    }
  }

  async function accept(draft: ApplicationContactDraft) {
    const rank = [1, 2, 3].find(
      (value) => !contacts.some((contact) => contact.rank === value),
    );
    if (!rank) return;
    setBusy(true);
    setError('');
    try {
      const response = await createApplicationContact(applicationId, {
        ...draft,
        rank,
      });
      if (!response.ok) throw new Error();
      onAccepted(applicationContactSchema.parse(await response.json()));
    } catch {
      setError(
        en
          ? 'Contact could not be saved. Reload to check for another edit.'
          : 'Contact non enregistré. Rechargez pour vérifier les modifications concurrentes.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label={
        en ? 'Public contact research' : 'Recherche de contacts publics'
      }
    >
      <form onSubmit={launch}>
        <h3>{en ? 'Find relevant people' : 'Trouver les bonnes personnes'}</h3>
        <p>
          {en
            ? 'Research the company sources and linked team pages. At most six public pages, one model call and three searches per workspace per day. Remote provider budget: at most $0.10 per search ($0.30/day), billed to your configured provider account. No messages are sent.'
            : 'Recherche dans les sources entreprise et les pages équipe liées. Six pages publiques maximum, un appel modèle et trois recherches par espace et par jour. Budget fournisseur distant : 0,10 $ maximum par recherche (0,30 $/jour), sur votre compte fournisseur configuré. Aucun message envoyé.'}
        </p>
        <label className="co-contact-message">
          {en
            ? 'Additional public team or profile URLs (optional, maximum three)'
            : 'URL publiques équipe ou profil supplémentaires (facultatif, trois maximum)'}
          <textarea
            rows={2}
            value={urls}
            maxLength={6_146}
            onChange={(event) => setUrls(event.target.value)}
          />
        </label>
        <button
          type="submit"
          className="co-button"
          disabled={busy || contacts.length === 3}
        >
          {busy
            ? en
              ? 'Researching…'
              : 'Recherche…'
            : en
              ? 'Research public sources'
              : 'Rechercher les sources publiques'}
        </button>
        {waiting && (
          <button type="button" onClick={() => request.current?.abort()}>
            {en ? 'Stop waiting' : 'Arrêter l’attente'}
          </button>
        )}
      </form>
      {error && <p role="alert">{error}</p>}
      {research && (
        <p role="status">
          {research.status === 'completed'
            ? en
              ? `${research.sourcesRead} sources read. ${research.drafts.length} suggestions — review before adding.`
              : `${research.sourcesRead} sources lues. ${research.drafts.length} suggestions — à relire avant ajout.`
            : research.status === 'retryable'
              ? en
                ? 'No model call was dispatched. You can retry this search.'
                : 'Aucun appel modèle effectué. Vous pouvez relancer cette recherche.'
              : en
                ? 'This search has not produced a verified result. It will not automatically retry a possibly dispatched model call. Change the sources for a new search.'
                : 'Cette recherche n’a pas produit de résultat contrôlé. Un appel potentiellement effectué n’est pas relancé automatiquement. Modifiez les sources pour une nouvelle recherche.'}
        </p>
      )}
      {research?.cost && (
        <p>
          {research.cost.basis === 'reserved_upper_bound'
            ? en
              ? 'Reserved provider ceiling (final outcome unknown): '
              : 'Plafond fournisseur réservé (résultat final inconnu) : '
            : en
              ? 'Provider cost estimate: '
              : 'Coût fournisseur estimé : '}
          {new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 4,
          }).format(research.cost.amountMicros / 1_000_000)}
        </p>
      )}
      {research?.drafts
        .filter(
          (draft) =>
            !contacts.some(
              (contact) => contact.profileUrl === draft.profileUrl,
            ),
        )
        .map((draft) => (
          <article className="co-contact-card" key={draft.profileUrl}>
            <h3>
              {draft.rank}. {draft.name} · {draft.role}
            </h3>
            <p>{draft.rationale}</p>
            {draft.sources.map((source) => (
              <blockquote key={source.url}>
                <p>{source.excerpt}</p>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>{' '}
                <time dateTime={source.collectedAt}>
                  {source.collectedAt.slice(0, 10)}
                </time>
              </blockquote>
            ))}
            <p>
              {en
                ? 'Proposed connection note:'
                : 'Note de connexion proposée :'}{' '}
              {draft.connectionNote}
            </p>
            <button
              className="co-button"
              disabled={busy || contacts.length === 3}
              type="button"
              onClick={() => accept(draft)}
            >
              {en
                ? 'I reviewed the source — add contact'
                : 'J’ai relu la source — ajouter le contact'}
            </button>
          </article>
        ))}
    </section>
  );
}
