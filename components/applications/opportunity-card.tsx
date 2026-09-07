'use client';

import styles from '@/components/applications/applications-page.module.css';
import { DecisionEditor } from '@/components/applications/decision-editor';
import {
  atsCopy,
  contractCopy,
  dispositionCopy,
  dispositionStateCopy,
  feedbackRankingCopy,
  formatDate,
  formatDateTime,
  host,
  lifecycleCopy,
  matchCopy,
  observationCopy,
  promotionError,
  qualificationCopy,
  remoteCopy,
  salaryCopy,
  sourceKindCopy,
} from '@/components/applications/opportunity-labels';
import { SemanticAnalysisPanel } from '@/components/applications/semantic-analysis-panel';
import { useI18n, useTranslations } from '@/components/i18n/i18n-provider';
import { Icon } from '@/components/ui/primitives';
import { applicationSchema } from '@/lib/application-contract';
import { promoteOpportunityToApplication } from '@/lib/career-api';
import { type DiscoveredJob } from '@/lib/discovered-job-contract';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';
import { semanticAnalysisMessages } from '@/lib/i18n/dictionaries/semantic-analysis';
import { initials } from '@/lib/initials';
import { type OpportunityDecision } from '@/lib/opportunity-decision';
import { type OpportunityFeedbackRanking } from '@/lib/opportunity-ranking';
import { type SearchProfile } from '@/lib/search-profile';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function OpportunityCard({
  decision,
  onDecisionSaved,
  opportunity,
  ranking,
  searchProfiles,
}: {
  decision?: OpportunityDecision;
  onDecisionSaved: (decision: OpportunityDecision) => void;
  opportunity: DiscoveredJob;
  ranking: OpportunityFeedbackRanking<DiscoveredJob>;
  searchProfiles: SearchProfile[];
}) {
  const { locale } = useI18n();
  const router = useRouter();
  const t = useTranslations([applicationsMessages, semanticAnalysisMessages]);
  const source = opportunity.sources[0];
  const lifecycle = lifecycleCopy(t, opportunity.lifecycle);
  const [editing, setEditing] = useState<
    OpportunityDecision['disposition'] | undefined
  >();
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string>();

  async function startApplication() {
    setStarting(true);
    setStartError(undefined);
    try {
      const response = await promoteOpportunityToApplication(
        opportunity.opportunityId,
      );
      if (!response.ok) {
        setStartError(promotionError(t, response.status));
        return;
      }
      const application = applicationSchema.parse(await response.json());
      router.push(`/applications/${application.applicationId}`);
    } catch {
      setStartError(
        t('applications.the.application.could.not.be.started.try.again'),
      );
    } finally {
      setStarting(false);
    }
  }

  return (
    <article
      className={`${styles.opportunityCard} ${styles[`lifecycle-${opportunity.lifecycle}`]}`}
    >
      <div className={styles.companyMark} aria-hidden="true">
        {initials(
          opportunity.company ?? opportunity.role ?? t('applications.job'),
        )}
      </div>
      <div className={styles.opportunityBody}>
        <div className={styles.opportunityTitle}>
          <div>
            <small>
              {opportunity.company ?? t('applications.needs.verification')}
            </small>
            <h3>{opportunity.role ?? t('applications.needs.verification')}</h3>
          </div>
          <span className={styles.lifecycle}>
            <i />
            {lifecycle}
          </span>
        </div>
        <dl className={styles.jobFacts}>
          <Fact
            icon="location_on"
            label={t('applications.location')}
            value={opportunity.location ?? t('applications.needs.verification')}
            unknown={opportunity.location === null}
          />
          <Fact
            icon="home_work"
            label={t('applications.work.mode')}
            value={remoteCopy(t, opportunity.remoteMode)}
            unknown={opportunity.remoteMode === 'unknown'}
          />
          <Fact
            icon="contract"
            label={t('applications.contract')}
            value={contractCopy(t, opportunity.contractType)}
            unknown={opportunity.contractType === 'unknown'}
          />
          <Fact
            icon="payments"
            label={t('applications.salary')}
            value={salaryCopy(t, opportunity, locale)}
            unknown={
              !opportunity.salaryCurrency ||
              (opportunity.salaryMin === null && opportunity.salaryMax === null)
            }
          />
          <Fact
            icon="dataset_linked"
            label={t('applications.ats.source')}
            value={atsCopy(t, opportunity.sourceKind)}
          />
        </dl>
        <a href={opportunity.sourceUrl} rel="noreferrer" target="_blank">
          <Icon>open_in_new</Icon>
          {t('applications.view.original.job')}{' '}
        </a>
        <details>
          <summary>
            <Icon>verified</Icon>
            {t('applications.provenance.and.history')}{' '}
            {opportunity.observations.length}{' '}
            {opportunity.observations.length > 1
              ? t('applications.observations')
              : t('applications.observation')}
          </summary>
          <div className={styles.provenance}>
            <section>
              <h4>{t('applications.source.reviewed')}</h4>
              <dl>
                <div>
                  <dt>{t('applications.requested.url')}</dt>
                  <dd>
                    <a
                      href={source.requestedUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {host(source.requestedUrl)}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>{t('applications.final.url')}</dt>
                  <dd>
                    <a href={source.finalUrl} rel="noreferrer" target="_blank">
                      {host(source.finalUrl)}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>{t('applications.collector')}</dt>
                  <dd>{sourceKindCopy(t, source.sourceKind)}</dd>
                </div>
                <div>
                  <dt>{t('applications.source.identifier')}</dt>
                  <dd>
                    {source.externalId ?? t('applications.needs.verification')}
                  </dd>
                </div>
                <div>
                  <dt>{t('applications.fetched')}</dt>
                  <dd>{formatDateTime(source.fetchedAt, locale)}</dd>
                </div>
                <div>
                  <dt>{t('applications.fingerprint')}</dt>
                  <dd>
                    <code>{source.sha256.slice(0, 12)}…</code>
                  </dd>
                </div>
              </dl>
            </section>
            <section>
              <h4>{t('applications.observation.history')}</h4>
              <ol className={styles.timeline}>
                {opportunity.observations.map((observation) => (
                  <li
                    className={styles[`change-${observation.change}`]}
                    key={observation.observationId}
                  >
                    <i aria-hidden="true" />
                    <div>
                      <strong>{observationCopy(t, observation.change)}</strong>
                      <time dateTime={observation.observedAt}>
                        {formatDateTime(observation.observedAt, locale)}
                      </time>
                    </div>
                    <small>
                      {matchCopy(t, observation.matchedBy)} ·{' '}
                      {observation.sha256.slice(0, 8)}…
                    </small>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </details>
      </div>
      <div className={styles.opportunityActions}>
        <span>
          {t('applications.discovered')}{' '}
          {formatDate(opportunity.firstSeenAt, locale)}
        </span>
        {ranking.direction ? (
          <small className={styles.feedbackSignal}>
            {feedbackRankingCopy(ranking, locale)}
          </small>
        ) : null}
        {decision ? (
          <span
            className={`${styles.decisionBadge} ${styles[decision.disposition]}`}
          >
            {dispositionStateCopy(t, decision.disposition)} ·{' '}
            {qualificationCopy(t, decision.qualification)}
          </span>
        ) : null}
        <button
          aria-controls={`semantic-analysis-${opportunity.opportunityId}`}
          aria-expanded={analysisOpen}
          className={styles.semanticAction}
          onClick={() => {
            setEditing(undefined);
            setAnalysisOpen((current) => !current);
          }}
          type="button"
        >
          <Icon>manage_search</Icon>
          {analysisOpen
            ? t('semantic-analysis.close.analysis')
            : t('semantic-analysis.analyze.fit')}
        </button>
        <div className={styles.decisionActions}>
          {(['saved', 'ignored', 'archived'] as const).map((disposition) => (
            <button
              className={
                decision?.disposition === disposition
                  ? styles.currentAction
                  : undefined
              }
              key={disposition}
              onClick={() => {
                setAnalysisOpen(false);
                setEditing(disposition);
              }}
              type="button"
            >
              {dispositionCopy(t, disposition)}
            </button>
          ))}
        </div>
        <button
          aria-busy={starting || undefined}
          disabled={starting}
          onClick={() => void startApplication()}
          type="button"
        >
          {starting
            ? t('applications.starting.application')
            : t('applications.start.application')}
        </button>
        {startError ? (
          <p className={styles.decisionError} role="alert">
            {startError}
          </p>
        ) : null}
      </div>
      {editing ? (
        <DecisionEditor
          decision={decision}
          initialDisposition={editing}
          key={editing}
          onCancel={() => setEditing(undefined)}
          onSaved={(saved) => {
            onDecisionSaved(saved);
            setEditing(undefined);
          }}
          opportunityId={opportunity.opportunityId}
          searchProfiles={searchProfiles}
        />
      ) : null}
      {analysisOpen ? (
        <SemanticAnalysisPanel
          initialSearchProfileId={decision?.searchProfileId}
          onClose={() => setAnalysisOpen(false)}
          opportunityId={opportunity.opportunityId}
          searchProfiles={searchProfiles}
        />
      ) : null}
    </article>
  );
}

export function Fact({
  unknown = false,
  icon,
  label,
  value,
}: {
  unknown?: boolean;
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div>
      <Icon>{icon}</Icon>
      <span>
        <dt>{label}</dt>
        <dd className={unknown ? styles.unknown : undefined}>{value}</dd>
      </span>
    </div>
  );
}
