'use client';

import styles from '@/components/applications/applications-page.module.css';
import { DecisionEditor } from '@/components/applications/decision-editor';
import {
  dispositionStateCopy,
  processedFilterCopy,
  qualificationCopy,
} from '@/components/applications/opportunity-labels';
import { SemanticAnalysisPanel } from '@/components/applications/semantic-analysis-panel';
import { useTranslations } from '@/components/i18n/i18n-provider';
import { Icon } from '@/components/ui/primitives';
import { type DiscoveredJob } from '@/lib/discovered-job-contract';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';
import { semanticAnalysisMessages } from '@/lib/i18n/dictionaries/semantic-analysis';
import { initials } from '@/lib/initials';
import { type OpportunityDecision } from '@/lib/opportunity-decision';
import { type SearchProfile } from '@/lib/search-profile';
import { useState } from 'react';

export function ProcessedOpportunities({
  decisionsByOpportunity,
  onDecisionSaved,
  opportunities,
  searchProfiles,
}: {
  decisionsByOpportunity: Map<string, OpportunityDecision>;
  onDecisionSaved: (decision: OpportunityDecision) => void;
  opportunities: DiscoveredJob[];
  searchProfiles: SearchProfile[];
}) {
  const t = useTranslations([applicationsMessages, semanticAnalysisMessages]);
  const [filter, setFilter] = useState<'all' | 'ignored' | 'archived'>('all');
  const visible = opportunities.filter(
    (opportunity) =>
      filter === 'all' ||
      decisionsByOpportunity.get(opportunity.opportunityId)?.disposition ===
        filter,
  );
  return (
    <section className={`${styles.workspace} ${styles.processedWorkspace}`}>
      <header className={styles.processedHeader}>
        <div>
          <Icon>inventory_2</Icon>
          <span>
            <strong>{t('applications.processed.opportunities')}</strong>
            <small>
              {opportunities.length}{' '}
              {opportunities.length > 1
                ? t('applications.retained.jobs')
                : t('applications.retained.job')}
            </small>
          </span>
        </div>
        <div
          className={styles.processedFilters}
          role="group"
          aria-label={t('applications.filter.processed.opportunities')}
        >
          {(['all', 'ignored', 'archived'] as const).map((candidate) => (
            <button
              aria-pressed={filter === candidate}
              key={candidate}
              onClick={() => setFilter(candidate)}
              type="button"
            >
              {processedFilterCopy(t, candidate)}
            </button>
          ))}
        </div>
      </header>
      <div className={styles.processedList}>
        {visible.map((opportunity) => (
          <ProcessedOpportunityRow
            decision={decisionsByOpportunity.get(opportunity.opportunityId)!}

            key={opportunity.opportunityId}
            onDecisionSaved={onDecisionSaved}
            opportunity={opportunity}
            searchProfiles={searchProfiles}
          />
        ))}
      </div>
    </section>
  );
}

export function ProcessedOpportunityRow({
  decision,
  onDecisionSaved,
  opportunity,
  searchProfiles,
}: {
  decision: OpportunityDecision;
  onDecisionSaved: (decision: OpportunityDecision) => void;
  opportunity: DiscoveredJob;
  searchProfiles: SearchProfile[];
}) {
  const t = useTranslations([applicationsMessages, semanticAnalysisMessages]);
  const [editing, setEditing] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  return (
    <article className={styles.processedRow}>
      <div className={styles.companyMark} aria-hidden="true">
        {initials(
          opportunity.company ?? opportunity.role ?? t('applications.job'),
        )}
      </div>
      <div>
        <small>
          {opportunity.company ?? t('applications.needs.verification')}
        </small>
        <strong>
          {opportunity.role ?? t('applications.needs.verification')}
        </strong>
      </div>
      <span
        className={`${styles.decisionBadge} ${styles[decision.disposition]}`}
      >
        {dispositionStateCopy(t, decision.disposition)}
      </span>
      <span>{qualificationCopy(t, decision.qualification)}</span>
      <button
        className={styles.processedEdit}
        onClick={() => {
          setAnalysisOpen(false);
          setEditing((current) => !current);
        }}
        type="button"
      >
        {editing ? t('applications.close') : t('applications.edit')}
      </button>
      <button
        aria-controls={`semantic-analysis-${opportunity.opportunityId}`}
        aria-expanded={analysisOpen}
        className={styles.processedAnalyze}
        onClick={() => {
          setEditing(false);
          setAnalysisOpen((current) => !current);
        }}
        type="button"
      >
        {analysisOpen
          ? t('semantic-analysis.close.analysis')
          : t('semantic-analysis.analyze')}
      </button>
      {editing ? (
        <DecisionEditor
          decision={decision}
          initialDisposition={decision.disposition}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            onDecisionSaved(saved);
            setEditing(false);
          }}
          opportunityId={opportunity.opportunityId}
          searchProfiles={searchProfiles}
        />
      ) : null}
      {analysisOpen ? (
        <SemanticAnalysisPanel
          initialSearchProfileId={decision.searchProfileId}
          onClose={() => setAnalysisOpen(false)}
          opportunityId={opportunity.opportunityId}
          searchProfiles={searchProfiles}
        />
      ) : null}
    </article>
  );
}
