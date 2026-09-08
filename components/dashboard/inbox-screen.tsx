'use client';

import { useTranslations } from '@/components/i18n/i18n-provider';
import { inboxMessages } from '@/lib/i18n/dictionaries/inbox';

import {
  type ReviewDecision,
  ApplicationReviewIssueActions,
} from '@/components/applications/application-review-checkpoint';
import { reviewerLabel } from '@/components/applications/application-versions-screen';
import { homePriorityRow } from '@/components/dashboard/home-screen';
import { OnboardingEmptyState } from '@/components/onboarding/empty-states';
import { useWorkflowDashboard } from '@/components/dashboard/use-workflow-dashboard';
import { useI18n } from '@/components/i18n/i18n-provider';
import { AppShell } from '@/components/layout/app-shell';
import { Icon, PageHeader } from '@/components/ui/primitives';
import { decideRunReviewIssue } from '@/lib/career-api';
import { dashboardActions } from '@/lib/dashboard-priority';
import { reviewIssueDecisionResultSchema } from '@/lib/run-contract';
import { persistedRunOperation } from '@/lib/run-operation';
import Link from 'next/link';
import { useState } from 'react';

export function InboxScreen() {
  const t = useTranslations([inboxMessages]);

  const { locale } = useI18n();
  const { dashboard, error, refresh } = useWorkflowDashboard();
  const [pending, setPending] = useState<string>();
  const [decisionError, setDecisionError] = useState(false);
  const decisions = dashboardActions(dashboard?.items ?? []).filter(
    ({ kind }) => kind === 'review' || kind === 'decision',
  );
  const reviewIssues = decisions.flatMap((decision) => {
    if (decision.kind !== 'review' || !decision.run) return [];
    const decided = new Set(
      decision.run.reviewDecisions.map(
        ({ reviewId, issueIndex }) => `${reviewId}:${issueIndex}`,
      ),
    );
    return decision.run.reviews.flatMap((review) =>
      review.issues.flatMap((issue, issueIndex) =>
        decided.has(`${review.reviewId}:${issueIndex}`)
          ? []
          : [{ decision, issue, issueIndex, review }],
      ),
    );
  });
  const paused = decisions.filter(({ kind }) => kind === 'decision');
  const decisionCount = reviewIssues.length + paused.length;
  const copy =
    locale === 'fr'
      ? decisionCount
        ? `${decisionCount} arbitrage${decisionCount > 1 ? 's' : ''} humain${decisionCount > 1 ? 's' : ''} bloque${decisionCount > 1 ? 'nt' : ''} une candidature.`
        : 'Aucun arbitrage humain ne bloque vos candidatures.'
      : decisionCount
        ? `${decisionCount} human decision${decisionCount > 1 ? 's are' : ' is'} blocking an application.`
        : 'No human decision is blocking your applications.';

  async function decide(
    runId: string,
    reviewId: string,
    issueIndex: number,
    decision: ReviewDecision,
  ) {
    if (pending) return;
    const key = `${reviewId}:${issueIndex}`;
    setPending(key);
    setDecisionError(false);
    try {
      const input = JSON.stringify({ reviewId, issueIndex, decision });
      const operation = persistedRunOperation(
        localStorage,
        `career-os-review-decision:${runId}:${key}:${decision}`,
        input,
      );
      const response = await decideRunReviewIssue(runId, input, operation.key);
      if (!response.ok) return setDecisionError(true);
      reviewIssueDecisionResultSchema.parse(await response.json());
      refresh();
    } catch {
      setDecisionError(true);
    } finally {
      setPending(undefined);
    }
  }

  return (
    <AppShell
      path="/inbox"
      aside={
        dashboard?.applications.length ? (
          <section className="co-stack">
            <h2>
              {locale === 'fr' ? 'Ce qui apparaît ici' : 'What appears here'}
            </h2>
            <p>
              {locale === 'fr'
                ? 'Uniquement les retours de review non tranchés et les workflows explicitement mis en pause pour votre décision.'
                : 'Only unresolved review feedback and workflows explicitly paused for your decision.'}
            </p>
            <div className="co-note">
              <Icon>shield</Icon>
              {locale === 'fr'
                ? 'Aucun agent ne peut valider sa propre affirmation ni publier à votre place.'
                : 'No agent can approve its own claim or publish on your behalf.'}
            </div>
          </section>
        ) : undefined
      }
    >
      <PageHeader title={t('inbox.needs.review')} copy={copy} />
      {dashboard && !error && !dashboard.applications.length ? (
        <OnboardingEmptyState kind="review" />
      ) : null}
      <div className="co-inbox-list">
        {reviewIssues.map(({ decision, issue, issueIndex, review }) => (
          <article key={`${review.reviewId}:${issueIndex}`}>
            <span className={issue.blocking ? 'crit' : 'warn'}>
              <Icon>{issue.blocking ? 'gpp_maybe' : 'rate_review'}</Icon>
            </span>
            <div>
              <small>
                {decision.application.company} ·{' '}
                {reviewerLabel(review.reviewer, locale)} · {issue.section}
              </small>
              <h2>{issue.message}</h2>
              <p>{decision.application.role}</p>
            </div>
            <ApplicationReviewIssueActions
              issue={issue}
              issueIndex={issueIndex}
              onDecide={(reviewId, targetIssueIndex, reviewDecision) =>
                void decide(
                  decision.run!.runId,
                  reviewId,
                  targetIssueIndex,
                  reviewDecision,
                )
              }
              pending={pending}
              review={review}
            />
          </article>
        ))}
        {paused.map((decision) => (
          <article key={decision.application.applicationId}>
            <span className="warn">
              <Icon>front_hand</Icon>
            </span>
            <div>
              <small>{decision.application.company}</small>
              <h2>
                {locale === 'fr'
                  ? 'Décision humaine requise'
                  : 'Human decision required'}
              </h2>
              <p>{homePriorityRow(decision, locale)}</p>
            </div>
            <Link
              className="co-button"
              href={`/applications/${decision.application.applicationId}`}
            >
              {locale === 'fr' ? 'Ouvrir le dossier' : 'Open application'}
            </Link>
          </article>
        ))}
        {decisionError ? (
          <p className="co-error" role="alert">
            {locale === 'fr'
              ? 'La décision n’a pas été enregistrée. Réessayez sans risque de doublon.'
              : 'The decision was not saved. You can retry safely.'}
          </p>
        ) : null}
        {!dashboard && !error ? (
          <div className="co-note">
            <Icon>hourglass_top</Icon>
            {locale === 'fr'
              ? 'Chargement des arbitrages…'
              : 'Loading decisions…'}
          </div>
        ) : null}
        {error ? (
          <div className="co-note">
            <Icon>cloud_off</Icon>
            {error === 'auth'
              ? locale === 'fr'
                ? 'Connectez-vous pour retrouver vos arbitrages.'
                : 'Sign in to access your decisions.'
              : locale === 'fr'
                ? 'La file d’arbitrage est momentanément indisponible.'
                : 'The decision queue is temporarily unavailable.'}
          </div>
        ) : null}
        {dashboard &&
        !error &&
        dashboard.applications.length > 0 &&
        !decisionCount ? (
          <div className="co-note">
            <Icon>check_circle</Icon>
            {locale === 'fr'
              ? 'Aucune décision en attente. Les points à vérifier apparaîtront ici après une revue.'
              : 'No pending decisions. Items to check will appear here after a review.'}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
