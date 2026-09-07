'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useI18n, useTranslations } from '@/components/i18n/i18n-provider';
import { dossierMessages } from '@/lib/i18n/dictionaries/dossier';
import type { PersistedRun } from '@/lib/run-contract';

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
        {pending === key
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
    <section className="co-panel co-research-checkpoint co-review-checkpoint">
      <header>
        <div>
          <p>{t('dossier.independent.checks')}</p>
          <h2>{t('dossier.three.perspectives.before.publishing')}</h2>
        </div>
        <span>
          {locale === 'en'
            ? `${unresolved} decision${unresolved === 1 ? '' : 's'} remaining`
            : `${unresolved} décision${unresolved === 1 ? '' : 's'} restante${unresolved === 1 ? '' : 's'}`}
        </span>
      </header>
      <p>
        {t(
          'dossier.every.objection.remains.visible.with.its.author.a.correction',
        )}{' '}
      </p>
      <div className="co-review-list">
        {active ? (
          <article key={`${active.review.reviewId}:${active.issueIndex}`}>
            <header>
              <strong>{reviewerLabel(active.review.reviewer, locale)}</strong>
              <span data-passed={false}>
                {active.issue.blocking
                  ? t('dossier.blocking')
                  : t('dossier.suggestion')}
              </span>
            </header>
            <section>
              <small>{active.issue.section}</small>
              <h3>{active.issue.message}</h3>
              {(active.issue.evidenceIds?.length ?? 0) > 0 ? (
                <p>
                  {locale === 'en'
                    ? `${active.issue.evidenceIds?.length ?? 0} attached evidence source${active.issue.evidenceIds?.length === 1 ? '' : 's'}`
                    : `${active.issue.evidenceIds?.length ?? 0} source${active.issue.evidenceIds?.length === 1 ? '' : 's'} de preuve rattachée${active.issue.evidenceIds?.length === 1 ? '' : 's'}`}
                </p>
              ) : (
                <p>
                  {locale === 'en'
                    ? 'No supporting evidence is attached.'
                    : 'Aucune preuve justificative n’est rattachée.'}
                </p>
              )}
              <ApplicationReviewIssueActions
                issue={active.issue}
                issueIndex={active.issueIndex}
                onDecide={onDecide}
                pending={pending}
                review={active.review}
              />
            </section>
          </article>
        ) : (
          <article>
            <h3>
              {t(
                'dossier.all.checks.are.resolved.ready.for.your.final.approval',
              )}
            </h3>
            <Link
              className="co-button"
              href={`/applications/${applicationId}/page`}
            >
              {t('dossier.review.the.draft.before.the.checks')}
            </Link>
          </article>
        )}
      </div>
      {error ? (
        <p role="alert">
          {t('dossier.the.decision.was.not.saved.you.can.retry.without')}{' '}
        </p>
      ) : null}
      <footer>
        <span>
          {issueCount === 0 || (unresolved === 0 && run.publicationEligible)
            ? t('dossier.all.checks.are.resolved.ready.for.your.final.approval')
            : t(
                'dossier.publishing.remains.blocked.while.a.decision.is.missing',
              )}
        </span>
      </footer>
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
