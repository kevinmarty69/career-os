'use client';

import { ImportDialog } from '@/components/applications/import-dialog';
import { OpportunityCard } from '@/components/applications/opportunity-card';
import { ProcessedOpportunities } from '@/components/applications/processed-opportunities';
import { useApplicationsPipeline } from '@/components/applications/use-applications-pipeline';
import { useI18n, useTranslations } from '@/components/i18n/i18n-provider';
import { AppShell } from '@/components/layout/app-shell';
import { useCareerMemory } from '@/components/memory/use-career-memory';
import { Badge, Icon } from '@/components/ui/primitives';
import { OnboardingEmptyState } from '@/components/ui/onboarding-empty-state';
import { LoadingRows } from '@/components/applications/pipeline-empty-state';
import { type Application } from '@/lib/application-contract';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';
import { initials } from '@/lib/initials';
import { rankOpportunitiesByHumanFeedback } from '@/lib/opportunity-ranking';
import Link from 'next/link';
import { useState } from 'react';
import styles from './applications-page.module.css';

const stages: Array<{ stage: Application['stage']; icon: string }> = [
  { stage: 'draft', icon: 'edit_note' },
  { stage: 'applied', icon: 'send' },
  { stage: 'interview', icon: 'forum' },
  { stage: 'offer', icon: 'celebration' },
  { stage: 'closed', icon: 'archive' },
];

export function ApplicationsPage({
  initialImportUrl,
}: {
  initialImportUrl?: string;
}) {
  const t = useTranslations([applicationsMessages]);
  const { locale } = useI18n();
  const pipeline = useApplicationsPipeline();
  const memory = useCareerMemory();
  const [importOpen, setImportOpen] = useState(initialImportUrl !== undefined);
  const empty =
    pipeline.loadState === 'ready' &&
    !pipeline.applications.length &&
    !pipeline.opportunities.length;

  const decisionsByOpportunity = new Map(
    pipeline.decisions.map((decision) => [decision.opportunityId, decision]),
  );
  const activeOpportunities = pipeline.opportunities.filter((opportunity) => {
    const disposition = decisionsByOpportunity.get(
      opportunity.opportunityId,
    )?.disposition;
    return disposition !== 'ignored' && disposition !== 'archived';
  });
  const processedOpportunities = pipeline.opportunities.filter(
    (opportunity) => {
      const disposition = decisionsByOpportunity.get(
        opportunity.opportunityId,
      )?.disposition;
      return disposition === 'ignored' || disposition === 'archived';
    },
  );
  const rankedOpportunities = rankOpportunitiesByHumanFeedback(
    activeOpportunities,
    pipeline.opportunities,
    pipeline.decisions,
    pipeline.rankingProfileId,
  );
  const reusableClaims = memory.profile.claims
    .filter((claim) => claim.level === 'verified' || claim.level === 'declared')
    .sort((a, b) => b.evidenceIds.length - a.evidenceIds.length)
    .slice(0, 4);

  return (
    <AppShell path="/applications">
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <p>{t('applications.pipeline.eyebrow')}</p>
            <h1>{t('applications.applications')}</h1>
            <span>{t('applications.pipeline.copy')}</span>
          </div>
          {!empty ? (
            <button
              className="co-button"
              onClick={() => setImportOpen(true)}
              type="button"
            >
              <Icon>add_link</Icon>
              {t('applications.paste.a.job.url')}
            </button>
          ) : null}
        </header>

        {pipeline.error ? (
          <div className={styles.error} role="alert">
            <Icon>error</Icon>
            <span>{pipeline.error}</span>
            <button onClick={pipeline.retry} type="button">
              {t('applications.try.again')}
            </button>
          </div>
        ) : null}

        {pipeline.loadState === 'loading' ? (
          <LoadingRows
            label={
              locale === 'fr'
                ? 'Chargement des candidatures'
                : 'Loading applications'
            }
          />
        ) : null}
        {empty ? (
          <OnboardingEmptyState
            kind="applications"
            onAction={() => setImportOpen(true)}
          />
        ) : null}
        {pipeline.loadState === 'ready' && !empty ? (
          <>
            <section
              className={styles.board}
              aria-label={t('applications.pipeline.board')}
            >
              {stages.map(({ stage, icon }) => {
                const items = pipeline.applications.filter(
                  (application) => application.stage === stage,
                );
                return (
                  <section className={styles.column} key={stage}>
                    <header>
                      <span>
                        <Icon>{icon}</Icon>
                        {stageLabel(stage, locale)}
                      </span>
                      <b>{items.length}</b>
                    </header>
                    <div>
                      {items.map((application) => (
                        <Link
                          className={styles.applicationCard}
                          href={`/applications/${application.applicationId}`}
                          key={application.applicationId}
                        >
                          <i aria-hidden="true">
                            {initials(application.company)}
                          </i>
                          <span>
                            <small>{application.company}</small>
                            <strong>{application.role}</strong>
                          </span>
                          <Icon>chevron_right</Icon>
                        </Link>
                      ))}
                      {pipeline.loadState === 'ready' && !items.length ? (
                        <p className={styles.emptyColumn}>
                          {t('applications.pipeline.empty.stage')}
                        </p>
                      ) : null}
                    </div>
                  </section>
                );
              })}
            </section>

            <section className={styles.reusable}>
              <header>
                <div>
                  <p>{t('applications.pipeline.reusable.eyebrow')}</p>
                  <h2>{t('applications.pipeline.reusable.title')}</h2>
                </div>
                <Link href="/memory">
                  {t('applications.pipeline.open.memory')}
                </Link>
              </header>
              <div>
                {reusableClaims.map((claim) => (
                  <article key={claim.id}>
                    <span
                      className={styles.proofDot}
                      data-level={claim.level}
                    />
                    <strong>{claim.statement}</strong>
                    <Badge tone={claim.level === 'verified' ? 'ok' : 'warn'}>
                      {claim.evidenceIds.length}{' '}
                      {t('applications.pipeline.sources')}
                    </Badge>
                  </article>
                ))}
                {memory.state === 'ready' &&
                !memory.loadError &&
                !reusableClaims.length ? (
                  <p className={styles.emptyEvidence}>
                    {t('applications.pipeline.no.reusable.proof')}
                  </p>
                ) : null}
              </div>
            </section>
          </>
        ) : null}

        {activeOpportunities.length ? (
          <section className={styles.savedJobs}>
            <header>
              <div>
                <p>{t('applications.opportunities')}</p>
                <h2>{t('applications.discovered.opportunities')}</h2>
              </div>
              <span>{activeOpportunities.length}</span>
            </header>
            <div className={styles.opportunityList}>
              {rankedOpportunities.map(({ opportunity, ...ranking }) => (
                <OpportunityCard
                  decision={decisionsByOpportunity.get(
                    opportunity.opportunityId,
                  )}
                  key={opportunity.opportunityId}
                  onDecisionSaved={pipeline.decisionSaved}
                  opportunity={opportunity}
                  ranking={{ opportunity, ...ranking }}
                  searchProfiles={pipeline.searchProfiles}
                />
              ))}
            </div>
          </section>
        ) : null}

        {processedOpportunities.length ? (
          <ProcessedOpportunities
            decisionsByOpportunity={decisionsByOpportunity}
            onDecisionSaved={pipeline.decisionSaved}
            opportunities={processedOpportunities}
            searchProfiles={pipeline.searchProfiles}
          />
        ) : null}
      </div>

      {importOpen ? (
        <ImportDialog
          initialUrl={initialImportUrl}
          onClose={() => setImportOpen(false)}
          onImported={(opportunity) => {
            pipeline.addOpportunity(opportunity);
            setImportOpen(false);
          }}
        />
      ) : null}
    </AppShell>
  );
}

function stageLabel(stage: Application['stage'], locale: 'en' | 'fr') {
  const labels: Record<Application['stage'], [string, string]> = {
    draft: ['À préparer', 'To prepare'],
    applied: ['Envoyées', 'Sent'],
    interview: ['Entretiens', 'Interviews'],
    offer: ['Offres', 'Offers'],
    closed: ['Terminées', 'Closed'],
  };
  return labels[stage][locale === 'fr' ? 0 : 1];
}
