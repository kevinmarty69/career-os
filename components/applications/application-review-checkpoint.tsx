'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useI18n, useTranslations } from '@/components/i18n/i18n-provider';
import { Badge, Icon } from '@/components/ui/primitives';
import { dossierMessages } from '@/lib/i18n/dictionaries/dossier';
import type { PersistedRun } from '@/lib/run-contract';
import styles from './application-flow.module.css';
import { useDecisionOutbox } from '@/components/decision-outbox-provider';

export type ReviewDecision = 'keep' | 'correct';

export function ApplicationReviewIssueActions({
  issue,
  issueIndex,
  onDecide,
  pending,
  review,
}: {
  issue: PersistedRun['reviews'][number]['issues'][number];
  issueIndex: number;
  onDecide: (
    reviewId: string,
    issueIndex: number,
    decision: ReviewDecision,
  ) => void;
  pending?: string;
  review: PersistedRun['reviews'][number];
}) {
  const { locale } = useI18n();
  const queued = useDecisionOutbox().items.some(
    (item) =>
      item.input.reviewId === review.reviewId &&
      item.input.issueIndex === issueIndex,
  );
  const key = `${review.reviewId}:${issueIndex}`;
  const removesClaim = issue.section === 'relevant_experience';
  return (
    <div className="co-review-actions">
      {review.reviewer !== 'factuality' ? (
        <button
          disabled={Boolean(pending)}
          onClick={() => onDecide(review.reviewId, issueIndex, 'keep')}
          type="button"
        >
          {locale === 'en' ? 'Keep as written' : 'Garder tel quel'}
        </button>
      ) : null}
      <Link
        className="co-button quiet"
        href={issue.claimId ? `/memory#claim-${issue.claimId}` : '/memory'}
      >
        {locale === 'en' ? 'Source in memory' : 'Sourcer dans la mémoire'}
      </Link>
      <button
        className="co-button"
        disabled={Boolean(pending)}
        onClick={() => onDecide(review.reviewId, issueIndex, 'correct')}
        type="button"
      >
        {queued
          ? locale === 'en'
            ? 'Waiting to sync'
            : 'En attente d’envoi'
          : pending === key
            ? locale === 'en'
              ? 'Correcting…'
              : 'Correction…'
            : removesClaim
              ? locale === 'en'
                ? 'Remove claim'
                : 'Supprimer l’affirmation'
              : locale === 'en'
                ? 'Correct section'
                : 'Corriger la section'}
      </button>
    </div>
  );
}

export function ApplicationReviewCheckpoint({
  applicationId,
  error,
  onDecide,
  pending,
  run,
}: {
  applicationId: string;
  error: boolean;
  onDecide: (
    reviewId: string,
    issueIndex: number,
    decision: ReviewDecision,
  ) => void;
  pending?: string;
  run: PersistedRun;
}) {
  const router = useRouter();
  const { locale } = useI18n();
  const t = useTranslations([dossierMessages]);
  const decisions = new Map(
    run.reviewDecisions.map((decision) => [
      `${decision.reviewId}:${decision.issueIndex}`,
      decision.decision,
    ]),
  );
  const issueCount = run.reviews.reduce(
    (count, review) => count + review.issues.length,
    0,
  );
  const unresolved = run.reviews.reduce(
    (count, review) =>
      count +
      review.issues.filter(
        (_, index) => !decisions.has(`${review.reviewId}:${index}`),
      ).length,
    0,
  );
  const active = run.reviews
    .flatMap((review) =>
      review.issues.map((issue, issueIndex) => ({ issue, issueIndex, review })),
    )
    .find(
      ({ issueIndex, review }) =>
        !decisions.has(`${review.reviewId}:${issueIndex}`),
    );
  const current = Math.min(issueCount, issueCount - unresolved + 1);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!active || pending) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, a')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        router.push(`/applications/${applicationId}`);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        onDecide(active.review.reviewId, active.issueIndex, 'correct');
      } else if (
        event.key === 'Backspace' &&
        active.review.reviewer !== 'factuality'
      ) {
        event.preventDefault();
        onDecide(active.review.reviewId, active.issueIndex, 'keep');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, applicationId, onDecide, pending, router]);

  return (
    <section className={styles.reviewWizard}>
      {active ? (
        <div
          className={styles.reviewDecision}
          key={`${active.review.reviewId}:${active.issueIndex}`}
        >
          <header className={styles.reviewIntro}>
            <Badge tone={active.issue.blocking ? 'crit' : 'warn'}>
              <Icon>{active.issue.blocking ? 'gpp_maybe' : 'rate_review'}</Icon>
              {active.issue.blocking
                ? t('dossier.blocking')
                : t('dossier.suggestion')}
            </Badge>
            <h1>{active.issue.message}</h1>
            <p>
              {t(
                'dossier.every.objection.remains.visible.with.its.author.a.correction',
              )}
            </p>
          </header>

          <div className={styles.reviewComparison}>
            <article>
              <span className={styles.reviewTile}>
                <Icon>description</Icon>
              </span>
              <div>
                <strong>
                  {locale === 'en' ? 'Attached evidence' : 'Preuve rattachée'}
                </strong>
                <small>{active.issue.section}</small>
              </div>
              <p>
                {(active.issue.evidenceIds?.length ?? 0) > 0
                  ? locale === 'en'
                    ? `${active.issue.evidenceIds?.length ?? 0} supporting source${active.issue.evidenceIds?.length === 1 ? '' : 's'}`
                    : `${active.issue.evidenceIds?.length ?? 0} source${active.issue.evidenceIds?.length === 1 ? '' : 's'} justificative${active.issue.evidenceIds?.length === 1 ? '' : 's'}`
                  : locale === 'en'
                    ? 'No supporting evidence is attached.'
                    : 'Aucune preuve justificative n’est rattachée.'}
              </p>
              <Link
                href={
                  active.issue.claimId
                    ? `/memory#claim-${active.issue.claimId}`
                    : '/memory'
                }
              >
                <Icon>visibility</Icon>
                {locale === 'en' ? 'Open career memory' : 'Ouvrir la mémoire'}
              </Link>
            </article>

            <article className={styles.reviewPerspective}>
              <span className={styles.reviewTile}>
                <Icon>how_to_reg</Icon>
              </span>
              <div>
                <strong>{reviewerLabel(active.review.reviewer, locale)}</strong>
                <small>
                  {locale === 'en'
                    ? `Decision ${current} of ${issueCount}`
                    : `Décision ${current} sur ${issueCount}`}
                </small>
              </div>
              <p>
                {active.issue.blocking
                  ? locale === 'en'
                    ? 'Publishing stays locked until you correct or remove this claim.'
                    : 'La publication reste verrouillée tant que cette affirmation n’est pas corrigée ou retirée.'
                  : locale === 'en'
                    ? 'You retain final authority over this reviewer suggestion.'
                    : 'Vous gardez l’autorité finale sur cette suggestion du reviewer.'}
              </p>
            </article>
          </div>

          {active.review.reviewer === 'factuality' ? (
            <aside className={styles.reviewConstraint}>
              <Icon>shield</Icon>
              <span>
                {locale === 'en'
                  ? 'There is no “publish without evidence” option. Factual objections must be resolved first.'
                  : 'Il n’existe pas d’option « publier sans preuve ». Les objections factuelles doivent d’abord être résolues.'}
              </span>
            </aside>
          ) : null}

          <footer className={styles.reviewFooter}>
            <span>
              {locale === 'en'
                ? '↵ correct · ⌫ keep · esc exit'
                : '↵ corriger · ⌫ garder · échap quitter'}
            </span>
            <ApplicationReviewIssueActions
              issue={active.issue}
              issueIndex={active.issueIndex}
              onDecide={onDecide}
              pending={pending}
              review={active.review}
            />
          </footer>
        </div>
      ) : (
        <div className={styles.reviewComplete}>
          <Icon>verified</Icon>
          <h1>
            {t('dossier.all.checks.are.resolved.ready.for.your.final.approval')}
          </h1>
          <Link
            className="co-button"
            href={`/applications/${applicationId}/page`}
          >
            {t('dossier.review.the.draft.before.the.checks')}
          </Link>
        </div>
      )}
      {error ? (
        <p className={styles.error} role="alert">
          {t('dossier.the.decision.was.not.saved.you.can.retry.without')}{' '}
        </p>
      ) : null}
    </section>
  );
}

function reviewerLabel(
  reviewer: PersistedRun['reviews'][number]['reviewer'],
  locale: 'en' | 'fr',
) {
  const labels = {
    recruiter: ['Recruiter review', 'Revue recruteur'],
    'hiring-manager': ['Hiring manager review', 'Revue hiring manager'],
    factuality: ['Factual review', 'Revue factuelle'],
  } as const;
  return labels[reviewer][locale === 'en' ? 0 : 1];
}
