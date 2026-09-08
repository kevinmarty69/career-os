'use client';

import { ImportDialog } from '@/components/applications/import-dialog';
import { OpportunityCard } from '@/components/applications/opportunity-card';
import { ProcessedOpportunities } from '@/components/applications/processed-opportunities';
import { useApplicationsPipeline } from '@/components/applications/use-applications-pipeline';
import { useI18n, useTranslations } from '@/components/i18n/i18n-provider';
import { AppShell } from '@/components/layout/app-shell';
import { useCareerMemory } from '@/components/memory/use-career-memory';
import { Badge, Icon } from '@/components/ui/primitives';
import { OnboardingEmptyState } from '@/components/onboarding/empty-states';
import { LoadingRows } from '@/components/applications/pipeline-empty-state';
import { type Application } from '@/lib/application-contract';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';
import { initials } from '@/lib/initials';
import { matchesSearchTerms } from '@/lib/global-search';
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
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const empty =
    pipeline.loadState === 'ready' &&
    !pipeline.applications.length &&
    !pipeline.opportunities.length;

  const decisionsByOpportunity = new Map(
    pipeline.decisions.map((decision) => [decision.opportunityId, decision]),
  );
  const filteredApplications = pipeline.applications.filter(
    (application) =>
      (stageFilter === 'all' || application.stage === stageFilter) &&
      matchesSearchTerms(
        query,
        application.company,
        application.role,
        application.description,
      ),
  );
  const matchesOpportunity = (
    opportunity: (typeof pipeline.opportunities)[number],
  ) =>
    matchesSearchTerms(
      query,
      opportunity.company ?? '',
      opportunity.role ?? '',
      opportunity.location ?? '',
      opportunity.description ?? '',
      opportunity.sourceUrl,
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
      return (
        (disposition === 'ignored' || disposition === 'archived') &&
        matchesOpportunity(opportunity)
      );
    },
  );
  const rankedOpportunities = rankOpportunitiesByHumanFeedback(
    activeOpportunities.filter(matchesOpportunity),
    pipeline.opportunities,
    pipeline.decisions,
    pipeline.rankingProfileId,
  );
  const alertThreshold =
    pipeline.searchProfiles.find(
      ({ searchProfileId }) => searchProfileId === pipeline.rankingProfileId,
    )?.alertThreshold ?? null;
  const alertCount =
    alertThreshold === null
      ? 0
      : rankedOpportunities.filter(
          ({ humanFeedbackSignal }) =>
            humanFeedbackSignal !== null &&
            humanFeedbackSignal >= alertThreshold,
        ).length;
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
            <form
              className={styles.filters}
              role="search"
              aria-label={t('applications.search.the.pipeline')}
              onSubmit={(event) => event.preventDefault()}
            >
              <label className={styles.searchField}>
                <span>{t('applications.search.the.pipeline')}</span>
                <Icon>search</Icon>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t(
                    'applications.search.a.company.role.or.location',
                  )}
                />
              </label>
              <label>
                {t('applications.type')}
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                >
                  <option value="all">
                    {t('applications.entire.pipeline')}
                  </option>
                  <option value="applications">
                    {t('applications.applications')}
                  </option>
                  <option value="opportunities">
                    {t('applications.opportunities')}
                  </option>
                </select>
              </label>
              <label>
                {t('applications.application.stage')}
                <select
                  value={stageFilter}
                  onChange={(event) => setStageFilter(event.target.value)}
                  disabled={type === 'opportunities'}
                >
                  <option value="all">{t('applications.all.stages')}</option>
                  {stages.map(({ stage }) => (
                    <option key={stage} value={stage}>
                      {stageLabel(stage, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('applications.ranking.profile')}
                <select
                  value={pipeline.rankingProfileId}
                  onChange={(event) =>
                    pipeline.setRankingProfileId(event.target.value)
                  }
                  disabled={type === 'applications'}
                >
                  <option value="">{t('applications.discovery.order')}</option>
                  {pipeline.searchProfiles.map((profile) => (
                    <option
                      key={profile.searchProfileId}
                      value={profile.searchProfileId}
                    >
                      {profile.name}
                    </option>
                  ))}
                </select>
              </label>
            </form>
            {type !== 'opportunities' ? (
              <>
                <section
                  className={styles.board}
                  aria-label={t('applications.pipeline.board')}
                >
                  {stages.map(({ stage, icon }) => {
                    const items = filteredApplications.filter(
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
                {!filteredApplications.length ? (
                  <p role="status">
                    {t('applications.no.application.matches.these.filters')}
                  </p>
                ) : null}
              </>
            ) : null}

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

        {activeOpportunities.length && type !== 'applications' ? (
          <section className={styles.savedJobs}>
            <header>
              <div>
                <p>{t('applications.opportunities')}</p>
                <h2>{t('applications.discovered.opportunities')}</h2>
              </div>
              <span>{rankedOpportunities.length}</span>
            </header>
            {alertCount > 0 ? (
              <div className={styles.alertSummary} role="status">
                <Icon>notifications_active</Icon>
                <div>
                  <strong>
                    {locale === 'fr'
                      ? `${alertCount} opportunité${alertCount > 1 ? 's ont' : ' a'} atteint votre seuil d’alerte de ${alertThreshold} % fondé sur vos décisions.`
                      : `${alertCount} opportunit${alertCount > 1 ? 'ies have' : 'y has'} reached your ${alertThreshold}% human-feedback alert threshold.`}
                  </strong>
                  <span>
                    {locale === 'fr'
                      ? 'Ce signal utilise vos décisions liées à ce profil, pas une probabilité d’embauche.'
                      : 'This signal uses your related decisions for this profile, not a hiring probability.'}
                  </span>
                </div>
              </div>
            ) : null}
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
              {!rankedOpportunities.length ? (
                <p className={styles.emptyEvidence} role="status">
                  {t('applications.no.opportunity.matches.these.filters')}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        {processedOpportunities.length && type !== 'applications' ? (
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
