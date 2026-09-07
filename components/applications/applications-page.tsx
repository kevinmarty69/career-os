'use client';

import { useTranslations } from '@/components/i18n/i18n-provider';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';
import { useApplicationsPipeline } from './use-applications-pipeline';

import { ApplicationRow } from '@/components/applications/application-row';
import styles from '@/components/applications/applications-page.module.css';
import { ImportDialog } from '@/components/applications/import-dialog';
import { OpportunityCard } from '@/components/applications/opportunity-card';
import { alertCopy } from '@/components/applications/opportunity-labels';
import {
  EmptyState,
  LoadingRows,
} from '@/components/applications/pipeline-empty-state';
import { ProcessedOpportunities } from '@/components/applications/processed-opportunities';
import { useI18n } from '@/components/i18n/i18n-provider';
import { AppShell } from '@/components/layout/app-shell';
import { Icon } from '@/components/ui/primitives';
import { type Application } from '@/lib/application-contract';
import { matchesSearchTerms } from '@/lib/global-search';
import { rankOpportunitiesByHumanFeedback } from '@/lib/opportunity-ranking';
import { useState } from 'react';

export function ApplicationsPage() {
  const t = useTranslations([applicationsMessages]);

  const { locale } = useI18n();
  const {
    opportunities,
    applications,
    decisions,
    searchProfiles,
    rankingProfileId,
    setRankingProfileId,
    loadState,
    error,
    retry,
    addOpportunity,
    decisionSaved,
  } = useApplicationsPipeline();
  const [importOpen, setImportOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'opportunities' | 'applications'>(
    'all',
  );
  const [stage, setStage] = useState<Application['stage'] | 'all'>('all');

  const decisionsByOpportunity = new Map(
    decisions.map((decision) => [decision.opportunityId, decision]),
  );
  const activeOpportunities = opportunities.filter((opportunity) => {
    const disposition = decisionsByOpportunity.get(
      opportunity.opportunityId,
    )?.disposition;
    return disposition !== 'ignored' && disposition !== 'archived';
  });
  const processedOpportunities = opportunities.filter((opportunity) => {
    const disposition = decisionsByOpportunity.get(
      opportunity.opportunityId,
    )?.disposition;
    return disposition === 'ignored' || disposition === 'archived';
  });
  const visibleActiveOpportunities = rankOpportunitiesByHumanFeedback(
    activeOpportunities,
    opportunities,
    decisions,
    rankingProfileId,
  ).filter(
    ({ opportunity }) =>
      scope !== 'applications' &&
      matchesSearchTerms(
        query,
        opportunity.company ?? '',
        opportunity.role ?? '',
        opportunity.description ?? '',
        opportunity.location ?? '',
      ),
  );
  const visibleProcessedOpportunities = processedOpportunities.filter(
    (opportunity) =>
      scope !== 'applications' &&
      matchesSearchTerms(
        query,
        opportunity.company ?? '',
        opportunity.role ?? '',
        opportunity.description ?? '',
        opportunity.location ?? '',
      ),
  );
  const rankingProfile = searchProfiles.find(
    ({ searchProfileId }) => searchProfileId === rankingProfileId,
  );
  const alertThreshold = rankingProfile?.alertThreshold ?? null;
  const alertRankings =
    alertThreshold === null
      ? []
      : visibleActiveOpportunities.filter(
          ({ humanFeedbackSignal }) =>
            humanFeedbackSignal !== null &&
            humanFeedbackSignal >= alertThreshold,
        );
  const visibleApplications = applications.filter(
    (application) =>
      scope !== 'opportunities' &&
      (stage === 'all' || application.stage === stage) &&
      matchesSearchTerms(
        query,
        application.company,
        application.role,
        application.description,
      ),
  );

  return (
    <AppShell
      path="/applications"
      sidebarContext={
        <div className={styles.sidebarNote}>
          <Icon>source</Icon>
          <strong>{t('applications.two.distinct.stages')}</strong>
          <span>
            {t(
              'applications.an.imported.job.remains.an.opportunity.until.you.start',
            )}{' '}
          </span>
        </div>
      }
      sidebarFooter={<></>}
    >
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <p>{t('applications.job.search.pipeline')}</p>
            <h1>{t('applications.applications')}</h1>
            <span>
              {t(
                'applications.review.collected.jobs.then.track.the.applications.you.actually',
              )}{' '}
            </span>
          </div>
          <button
            className="co-button"
            onClick={() => setImportOpen(true)}
            type="button"
          >
            <Icon>add_link</Icon>
            {t('applications.paste.a.job.url')}{' '}
          </button>
        </header>

        <div className={styles.filters} role="search">
          <label className={styles.searchField}>
            <Icon>search</Icon>
            <span className={styles.srOnly}>
              {t('applications.search.the.pipeline')}
            </span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('applications.search.a.company.role.or.location')}
              type="search"
              value={query}
            />
          </label>
          <label>
            <span>{t('applications.type')}</span>
            <select
              aria-label={t('applications.type')}
              onChange={(event) =>
                setScope(
                  event.target.value as
                    'all' | 'opportunities' | 'applications',
                )
              }
              value={scope}
            >
              <option value="all">{t('applications.entire.pipeline')}</option>
              <option value="opportunities">
                {t('applications.opportunities')}
              </option>
              <option value="applications">
                {t('applications.applications')}
              </option>
            </select>
          </label>
          <label>
            <span>{t('applications.application.stage')}</span>
            <select
              aria-label={t('applications.application.stage')}
              disabled={scope === 'opportunities'}
              onChange={(event) =>
                setStage(event.target.value as Application['stage'] | 'all')
              }
              value={stage}
            >
              <option value="all">{t('applications.all.stages')}</option>
              <option value="draft">{t('applications.draft')}</option>
              <option value="applied">{t('applications.sent')}</option>
              <option value="interview">{t('applications.interview')}</option>
              <option value="offer">{t('applications.offer.received')}</option>
              <option value="closed">{t('applications.closed.2')}</option>
            </select>
          </label>
          <label>
            <span>{t('applications.ranking')}</span>
            <select
              aria-label={t('applications.ranking.profile')}
              onChange={(event) => setRankingProfileId(event.target.value)}
              value={rankingProfileId}
            >
              <option value="">{t('applications.discovery.order')}</option>
              {searchProfiles
                .filter(({ active }) => active)
                .map((profile) => (
                  <option
                    key={profile.searchProfileId}
                    value={profile.searchProfileId}
                  >
                    {profile.name}
                  </option>
                ))}
            </select>
          </label>
        </div>

        {error ? (
          <div className={styles.error} role="alert">
            <Icon>error</Icon>
            <span>{error}</span>
            <button onClick={retry} type="button">
              {t('applications.try.again')}{' '}
            </button>
          </div>
        ) : null}

        {alertRankings.length ? (
          <div className={styles.alertSummary} role="status">
            <Icon>notifications_active</Icon>
            <div>
              <strong>
                {alertCopy(alertRankings.length, alertThreshold!, locale)}
              </strong>
              <span>{rankingProfile?.name}</span>
            </div>
          </div>
        ) : null}

        <section
          className={styles.workspace}
          aria-label={t('applications.opportunities.and.applications')}
        >
          <header className={styles.sectionHeader}>
            <div className={styles.sectionIcon}>
              <Icon>travel_explore</Icon>
            </div>
            <div>
              <h2>{t('applications.discovered.opportunities')}</h2>
              <p>
                {t(
                  'applications.jobs.saved.with.their.source.not.yet.turned.into',
                )}{' '}
              </p>
            </div>
          </header>
          {loadState === 'loading' ? (
            <LoadingRows label={t('applications.loading.opportunities')} />
          ) : visibleActiveOpportunities.length ? (
            <div className={styles.opportunityList}>
              {visibleActiveOpportunities.map((ranking) => (
                <OpportunityCard
                  decision={decisionsByOpportunity.get(
                    ranking.opportunity.opportunityId,
                  )}

                  key={ranking.opportunity.opportunityId}
                  onDecisionSaved={decisionSaved}
                  opportunity={ranking.opportunity}
                  ranking={ranking}
                  searchProfiles={searchProfiles}
                />
              ))}
            </div>
          ) : loadState === 'ready' ? (
            <EmptyState
              action={
                query || scope === 'applications'
                  ? undefined
                  : t('applications.paste.a.job.url')
              }
              copy={
                query || scope === 'applications'
                  ? t('applications.no.opportunity.matches.these.filters')
                  : t('applications.add.a.job.url.to.preserve.its.content.and')
              }

              icon="link"
              onAction={
                query || scope === 'applications'
                  ? undefined
                  : () => setImportOpen(true)
              }
              title={
                query || scope === 'applications'
                  ? t('applications.no.results')
                  : t('applications.no.saved.opportunities')
              }
            />
          ) : null}
        </section>

        {loadState === 'ready' && visibleProcessedOpportunities.length ? (
          <ProcessedOpportunities
            decisionsByOpportunity={decisionsByOpportunity}

            onDecisionSaved={decisionSaved}
            opportunities={visibleProcessedOpportunities}
            searchProfiles={searchProfiles}
          />
        ) : null}

        <section
          className={styles.workspace}
          aria-label={t('applications.started.applications')}
        >
          <header className={styles.sectionHeader}>
            <div className={`${styles.sectionIcon} ${styles.applicationIcon}`}>
              <Icon>work_history</Icon>
            </div>
            <div>
              <h2>{t('applications.applications')}</h2>
              <p>
                {t(
                  'applications.only.the.applications.you.chose.to.prepare.or.send',
                )}{' '}
              </p>
            </div>
          </header>
          {loadState === 'loading' ? (
            <LoadingRows label={t('applications.loading.applications')} />
          ) : visibleApplications.length ? (
            <div className={styles.applicationList}>
              {visibleApplications.map((application) => (
                <ApplicationRow
                  application={application}
                  key={application.applicationId}
                />
              ))}
            </div>
          ) : loadState === 'ready' ? (
            <EmptyState
              copy={
                query || scope === 'opportunities' || stage !== 'all'
                  ? t('applications.no.application.matches.these.filters')
                  : t(
                      'applications.no.application.has.been.started.yet.your.opportunities.remain',
                    )
              }

              icon="work_outline"
              title={
                query || scope === 'opportunities' || stage !== 'all'
                  ? t('applications.no.results')
                  : t('applications.no.active.applications')
              }
            />
          ) : null}
        </section>
      </div>
      {importOpen ? (
        <ImportDialog
          onClose={() => setImportOpen(false)}
          onImported={(opportunity) => {
            addOpportunity(opportunity);
            setImportOpen(false);
          }}
        />
      ) : null}
    </AppShell>
  );
}
