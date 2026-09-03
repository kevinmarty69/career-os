'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { type PageSpec, type Profile } from '@/lib/schemas';
import type { PersistedRun } from '@/lib/run-contract';
import {
  reviewProcessState,
  reviewsComplete,
  type ReviewDecision,
  type WorkspaceReview,
} from '@/lib/workspace-state';
import {
  levelLabel,
  reviewerLabel,
  sectionLabel,
} from './workspace-view-labels';
import { WorkerAvailabilityNotice } from './journey-views';

export function DraftView({
  onOpenEvidence,
  onOpenReview,
  onRefresh,
  onRetry,
  onStartReviews,
  profile,
  reviewError,
  retryError,
  retryPending,
  reviewsAvailable,
  reviewPending,
  reviewState,
  spec,
  workerAvailability,
}: {
  onOpenEvidence: (claimId: string) => void;
  onOpenReview: () => void;
  onRefresh: () => void;
  onRetry: () => void;
  onStartReviews: () => void;
  profile: Profile;
  reviewError: string;
  retryError: string;
  retryPending: boolean;
  reviewsAvailable: boolean;
  reviewPending: boolean;
  reviewState: ReturnType<typeof reviewProcessState>;
  spec: PageSpec;
  workerAvailability?: PersistedRun['workerAvailability'];
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const claims = new Map(profile.claims.map((claim) => [claim.id, claim]));
  const usedClaimIds = new Set(
    spec.blocks.flatMap((block) => ('claimIds' in block ? block.claimIds : [])),
  );
  const sourcedCount = profile.claims.filter(
    (claim) => usedClaimIds.has(claim.id) && claim.evidenceIds.length,
  ).length;
  const reviewStarted = reviewState === 'running';
  const reviewFailed = reviewState === 'failed';
  useEffect(() => heading.current?.focus(), []);
  return (
    <article
      className="document draft-document"
      style={{ '--company-accent': spec.company.accent } as React.CSSProperties}
    >
      <div className="draft-accent" aria-hidden="true" />
      <header className="draft-heading">
        <p>{spec.company.role}</p>
        <span>Brouillon généré</span>
      </header>
      <section
        className="draft-review-note"
        aria-label="Relecture du brouillon"
      >
        <div>
          <h2 ref={heading} tabIndex={-1}>
            Relisez exactement ce que l’entreprise verra.
          </h2>
          <p>Rien ne sera partagé sans votre validation.</p>
          {!reviewsAvailable ? (
            <p className="draft-review-state">
              {reviewStarted
                ? 'Les trois vérifications sont en cours.'
                : reviewFailed
                  ? 'Les vérifications se sont arrêtées. Le brouillon reste intact.'
                  : 'Brouillon prêt. Lancez les vérifications après votre relecture.'}
            </p>
          ) : null}
        </div>
        <span>
          {spec.blocks.length} section{spec.blocks.length > 1 ? 's' : ''} ·{' '}
          {usedClaimIds.size} affirmation{usedClaimIds.size > 1 ? 's' : ''} ·{' '}
          {sourcedCount}/{usedClaimIds.size} sourcées
        </span>
      </section>
      <WorkerAvailabilityNotice
        availability={workerAvailability}
        onRefresh={onRefresh}
      />
      <p className="section-label">{spec.hero.eyebrow}</p>
      <h2>{spec.hero.title}</h2>
      <p className="draft-thesis">{spec.hero.thesis}</p>
      {spec.blocks.map((block, index) => (
        <section className="proof-section" key={`${block.type}-${index}`}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <div>
            <h3>{block.title}</h3>
            {'claimIds' in block ? (
              block.claimIds.map((id) => {
                const claim = claims.get(id);
                return claim ? (
                  <button
                    className="statement"
                    key={id}
                    onClick={() => onOpenEvidence(id)}
                    type="button"
                  >
                    <span>{claim.statement}</span>
                    <small>{levelLabel(claim.level)} · Voir la preuve</small>
                  </button>
                ) : null;
              })
            ) : (
              <p>{block.text}</p>
            )}
          </div>
        </section>
      ))}
      {reviewError ? <p role="alert">{reviewError}</p> : null}
      <div className="document-actions">
        <p>
          {reviewsAvailable
            ? 'Les trois vérifications sont terminées.'
            : reviewFailed
              ? 'Relancez la candidature pour créer un nouveau run vérifiable.'
              : reviewStarted
                ? 'Le traitement continue en arrière-plan. Vous pouvez quitter cette page.'
                : 'Trois agents vérifieront la pertinence, la lisibilité et les preuves.'}
        </p>
        {reviewsAvailable ? (
          <button onClick={onOpenReview}>Ouvrir la revue</button>
        ) : reviewFailed ? (
          <button disabled={retryPending} onClick={onRetry}>
            {retryPending ? 'Relance en cours…' : 'Relancer la candidature'}
          </button>
        ) : (
          <button
            disabled={reviewPending || reviewStarted}
            onClick={onStartReviews}
          >
            {reviewPending
              ? 'Lancement…'
              : reviewStarted
                ? 'Vérifications en cours'
                : 'Lancer les 3 vérifications'}
          </button>
        )}
        {reviewFailed && retryError ? (
          <p className="inline-error" role="alert">
            {retryError}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function EvidenceInspector({
  onClose,
  open,
  profile,
  selectedClaimId,
  spec,
}: {
  onClose: () => void;
  open: boolean;
  profile: Profile;
  selectedClaimId: string;
  spec?: PageSpec;
}) {
  const inspector = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const selectedIds = new Set(
    spec?.blocks.flatMap((block) =>
      'claimIds' in block ? block.claimIds : [],
    ) ?? [],
  );

  useEffect(() => {
    if (!open || !inspector.current) return;
    const node = inspector.current;
    const mobile = matchMedia('(max-width: 1023px)');
    let inerted: HTMLElement[] = [];

    function resetModalState() {
      inerted.forEach((element) => (element.inert = false));
      inerted = [];
      node.removeAttribute('role');
      node.removeAttribute('aria-modal');
    }

    function syncModalState() {
      resetModalState();
      if (mobile.matches) {
        node.setAttribute('role', 'dialog');
        node.setAttribute('aria-modal', 'true');
        let current: HTMLElement = node;
        while (current.parentElement) {
          const parent = current.parentElement;
          for (const sibling of parent.children)
            if (sibling !== current && sibling instanceof HTMLElement) {
              sibling.inert = true;
              inerted.push(sibling);
            }
          current = parent;
          if (parent.matches('main.app-shell')) break;
        }
      }
      closeButton.current?.focus();
    }

    syncModalState();
    mobile.addEventListener('change', syncModalState);
    return () => {
      mobile.removeEventListener('change', syncModalState);
      resetModalState();
    };
  }, [open]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !inspector.current?.hasAttribute('aria-modal'))
      return;
    const focusable = [
      ...inspector.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ),
    ];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <aside
      className={`evidence-inspector ${open ? 'open' : ''}`}
      id="evidence-inspector"
      aria-labelledby="evidence-inspector-title"
      onKeyDown={handleKeyDown}
      ref={inspector}
    >
      <header>
        <div>
          <p className="section-label">Preuves</p>
          <h2 id="evidence-inspector-title">Pourquoi ces affirmations ?</h2>
        </div>
        <button
          className="inspector-close quiet"
          onClick={onClose}
          aria-label="Fermer l’inspecteur de preuves"
          ref={closeButton}
        >
          Fermer
        </button>
      </header>
      {profile.claims
        .filter((claim) =>
          selectedClaimId
            ? claim.id === selectedClaimId
            : selectedIds.has(claim.id),
        )
        .map((claim) => (
          <section className="evidence-item" key={claim.id}>
            <div className="evidence-status">
              <span>{levelLabel(claim.level)}</span>
              <code translate="no">{claim.id}</code>
            </div>
            <h3>{claim.statement}</h3>
            {claim.evidenceIds.map((evidenceId) => {
              const evidence = profile.evidence.find(
                (item) => item.id === evidenceId,
              );
              const source = profile.sources.find(
                (item) => item.id === evidence?.sourceId,
              );
              return evidence ? (
                <blockquote key={evidence.id}>
                  <strong>{source?.title}</strong>
                  <p>“{evidence.excerpt}”</p>
                </blockquote>
              ) : null;
            })}
          </section>
        ))}
    </aside>
  );
}

export function ReviewView({
  approved,
  canRerun,
  decisionError,
  decisionMessage,
  decisionPending,
  decisions,
  onApprove,
  onContinue,
  onDecide,
  onReturnToBrief,
  onReview,
  paused,
  publicationEligible,
  reviews,
}: {
  approved: boolean;
  canRerun: boolean;
  decisionError: string;
  decisionMessage: string;
  decisionPending: string;
  decisions?: ReviewDecision[];
  onApprove: (approved: boolean) => void;
  onContinue: () => void;
  onReturnToBrief: () => void;
  onDecide: (
    review: WorkspaceReview,
    issueIndex: number,
    decision: ReviewDecision['decision'],
  ) => void;
  onReview: () => void;
  paused: boolean;
  publicationEligible: boolean;
  reviews: WorkspaceReview[];
}) {
  const ready = reviewsComplete(reviews) && publicationEligible;
  return (
    <section className="document review-document">
      <header className="document-heading">
        <p className="section-label">Revue</p>
        <h2>Confirmer la pertinence et les preuves</h2>
        <p>
          Assumez explicitement une objection non factuelle, ou revenez au brief
          pour produire une nouvelle version. Un point factuel ne peut jamais
          être ignoré.
        </p>
      </header>
      {decisionError ? <p role="alert">{decisionError}</p> : null}
      {decisionMessage ? <p role="status">{decisionMessage}</p> : null}
      <div className="review-list">
        {reviews.map((item) => {
          const issues = item.issues ?? [];
          const unresolved = issues.some(
            (_, issueIndex) =>
              !decisions?.some(
                (decision) =>
                  decision.reviewId === item.reviewId &&
                  decision.issueIndex === issueIndex,
              ),
          );
          const kept = !item.passed && issues.length > 0 && !unresolved;
          return (
            <article className="review-card" key={item.reviewer}>
              <header>
                <div>
                  <strong>{reviewerLabel(item.reviewer)}</strong>
                  <small>
                    {item.passed
                      ? 'Aucun blocage détecté.'
                      : `${item.findings.length} point${item.findings.length > 1 ? 's' : ''} à examiner.`}
                  </small>
                </div>
                <span className={item.passed || kept ? 'passed' : 'blocked'}>
                  {item.passed ? 'Validé' : kept ? 'Assumé' : 'À trancher'}
                </span>
              </header>
              {issues.map((issue, issueIndex) => {
                const choice = decisions?.find(
                  (decision) =>
                    decision.reviewId === item.reviewId &&
                    decision.issueIndex === issueIndex,
                );
                const issueKey = `${item.reviewId}:${issueIndex}`;
                return (
                  <section className="review-issue" key={issueKey}>
                    <p>{issue.message}</p>
                    <small>{sectionLabel(issue.section)}</small>
                    {choice ? (
                      <span className="decision-recorded">
                        Version gardée · décision enregistrée
                      </span>
                    ) : (
                      <div className="review-actions">
                        <button onClick={onReturnToBrief}>
                          Revenir au brief
                        </button>
                        {item.reviewer !== 'factuality' ? (
                          <button
                            className="quiet"
                            disabled={Boolean(decisionPending)}
                            onClick={() => onDecide(item, issueIndex, 'keep')}
                          >
                            Garder cette version
                          </button>
                        ) : (
                          <small className="decision-policy">
                            Une affirmation factuelle ne peut pas être conservée
                            sans correction.
                          </small>
                        )}
                        {decisionPending === issueKey ? (
                          <small className="decision-saving" role="status">
                            Enregistrement de votre décision…
                          </small>
                        ) : null}
                      </div>
                    )}
                  </section>
                );
              })}
              {!item.passed && !issues.length ? (
                <p className="review-legacy-note">
                  {item.findings.join(' ')} Cette ancienne revue doit être
                  régénérée pour devenir actionnable.
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
      {canRerun ? (
        <button className="quiet" disabled={paused} onClick={onReview}>
          Relancer la revue
        </button>
      ) : null}
      <label className="approval">
        <input
          checked={approved}
          disabled={!ready}
          onChange={(event) => onApprove(event.target.checked)}
          type="checkbox"
        />
        <span>
          <strong>Valider cette candidature</strong>
          J’ai vérifié les preuves et je valide cette candidature.
        </span>
      </label>
      <div className="document-actions">
        <p>
          {ready
            ? 'Les contrôles et vos décisions autorisent la validation.'
            : 'Résolvez d’abord les blocages de la revue.'}
        </p>
        <button disabled={!approved} onClick={onContinue}>
          Continuer vers le partage
        </button>
      </div>
    </section>
  );
}

export function ShareView({
  canPublish,
  error,
  onCopy,
  onPublish,
  onRevoke,
  publishing,
  shareMessage,
  shareUrl,
  publicationExists,
  hasPersistedRun,
  signedIn,
}: {
  canPublish: boolean;
  error: string;
  onCopy: () => void;
  onPublish: () => void;
  onRevoke: () => void;
  publishing: boolean;
  shareMessage: string;
  shareUrl: string;
  publicationExists: boolean;
  hasPersistedRun: boolean;
  signedIn: boolean;
}) {
  return (
    <section className="document share-document">
      <header className="document-heading">
        <p className="section-label">Partage</p>
        <h2>Un lien privé, sous votre contrôle</h2>
        <p>
          Le lien expire après 7 jours. Il ouvre uniquement cette candidature et
          peut être révoqué à tout moment.
        </p>
      </header>
      {shareUrl ? (
        <div className="share-result" role="status" aria-live="polite">
          <span className="passed">Actif · Expire dans 7 jours</span>
          <code translate="no">{shareUrl}</code>
          <div className="share-actions">
            <button onClick={onCopy}>Copier le lien privé</button>
            <a href={shareUrl}>Ouvrir la page privée</a>
            <button className="danger-link" onClick={onRevoke}>
              Révoquer le lien privé
            </button>
          </div>
        </div>
      ) : (
        <div className="share-empty">
          <strong>Non partagée</strong>
          <p>Créez le lien uniquement lorsque la page relue est prête.</p>
        </div>
      )}
      {error ? (
        <div className="inline-error" role="alert">
          <strong>Lien privé non créé</strong>
          <p>{error}</p>
        </div>
      ) : null}
      <p className="sr-status" aria-live="polite">
        {shareMessage}
      </p>
      {!shareUrl ? (
        <div className="document-actions">
          <p>
            {publicationExists
              ? 'Le lien existant est masqué sur cet appareil. Le remplacer invalidera tous les anciens liens.'
              : !hasPersistedRun
                ? 'Connectez-vous, puis relancez la génération pour enregistrer cette candidature avant de la partager.'
                : 'La mémoire enregistrée, votre validation et trois contrôles réussis sont requis.'}
          </p>
          {!signedIn ? (
            <Link className="button-link" href="/sign-in?next=/">
              Se connecter pour{' '}
              {publicationExists ? 'gérer le lien' : 'créer le lien'}
            </Link>
          ) : publicationExists ? (
            <div className="share-actions">
              {hasPersistedRun ? (
                <button
                  disabled={!canPublish || publishing}
                  onClick={onPublish}
                >
                  {publishing
                    ? 'Remplacement du lien…'
                    : 'Remplacer le lien privé'}
                </button>
              ) : null}
              <button className="danger-link" onClick={onRevoke}>
                Révoquer tous les liens
              </button>
            </div>
          ) : (
            <button disabled={!canPublish || publishing} onClick={onPublish}>
              {publishing ? 'Création du lien privé…' : 'Créer le lien privé'}
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
