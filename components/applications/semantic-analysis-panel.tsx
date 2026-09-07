'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/primitives';
import { useEffect, useRef, useState } from 'react';
import { readSemanticAnalysis, runSemanticAnalysis } from '@/lib/career-api';
import {
  semanticAnalysisResultSchema,
  type PersistedSemanticAnalysis,
  type SemanticAnalysisResult,
} from '@/lib/semantic-analysis-contract';
import type { SearchProfile } from '@/lib/search-profile';
import { useI18n, useTranslations } from '@/components/i18n/i18n-provider';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';
import { searchProfilesMessages } from '@/lib/i18n/dictionaries/search-profiles';
import { semanticAnalysisMessages } from '@/lib/i18n/dictionaries/semantic-analysis';
import styles from './applications-page.module.css';

type RequestKind = 'read' | 'run';
type AnalysisItem =
  PersistedSemanticAnalysis['artifact']['analysis']['skills'][number];
type Proof = PersistedSemanticAnalysis['proofIndex'][number];

export function SemanticAnalysisPanel({
  initialSearchProfileId,
  onClose,
  opportunityId,
  searchProfiles,
}: {
  initialSearchProfileId?: string | null;
  onClose: () => void;
  opportunityId: string;
  searchProfiles: SearchProfile[];
}) {
  const { locale } = useI18n();
  const t = useTranslations([
    applicationsMessages,
    searchProfilesMessages,
    semanticAnalysisMessages,
  ]);
  const [searchProfileId, setSearchProfileId] = useState(
    initialSearchProfileId ?? '',
  );
  const [result, setResult] = useState<SemanticAnalysisResult>();
  const [loading, setLoading] = useState<RequestKind>();
  const [errorStatus, setErrorStatus] = useState<number>();
  const [unknownProfile, setUnknownProfile] = useState<string>();
  const profileRevision = `${searchProfileId}:${searchProfiles.find((profile) => profile.searchProfileId === searchProfileId)?.revision}`;
  const outcomeUnknown = unknownProfile === profileRevision;
  const [lastRequest, setLastRequest] = useState<RequestKind>('run');
  const request = useRef<AbortController | undefined>(undefined);

  useEffect(() => () => request.current?.abort(), []);

  async function submit(kind: RequestKind) {
    if (!searchProfileId || (kind === 'run' && outcomeUnknown)) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(kind);
    setLastRequest(kind);
    setErrorStatus(undefined);
    try {
      const response = await (kind === 'read'
        ? readSemanticAnalysis(
            opportunityId,
            searchProfileId,
            controller.signal,
          )
        : runSemanticAnalysis(
            opportunityId,
            searchProfileId,
            controller.signal,
          ));
      if (!response.ok) {
        if (response.status === 409) {
          const body: unknown = await response.json().catch(() => null);
          if (
            typeof body === 'object' &&
            body !== null &&
            'code' in body &&
            body.code === 'SEMANTIC_ANALYSIS_OUTCOME_UNKNOWN'
          ) {
            setUnknownProfile(profileRevision);
          }
        }
        throw new SemanticRequestError(response.status);
      }
      setResult(semanticAnalysisResultSchema.parse(await response.json()));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setErrorStatus(error instanceof SemanticRequestError ? error.status : 0);
    } finally {
      if (request.current === controller) setLoading(undefined);
    }
  }

  return (
    <section
      aria-label={t('semantic-analysis.semantic.job.analysis')}
      aria-busy={Boolean(loading)}
      className={`${styles.semanticPanel} ${styles.decisionEditor}`}
      id={`semantic-analysis-${opportunityId}`}
    >
      <header className={styles.semanticHeader}>
        <div>
          <span className={styles.semanticEyebrow}>
            {t('semantic-analysis.explainable.analysis')}
          </span>
          <h4>{t('semantic-analysis.compare.the.job.with.your.memory')}</h4>
          <p>
            {t(
              'semantic-analysis.choose.a.profile.analysis.never.starts.without.your.action',
            )}{' '}
          </p>
        </div>
        <button
          aria-label={t('semantic-analysis.close.analysis')}
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </header>

      {searchProfiles.length ? (
        <div className={`${styles.semanticControls} ${styles.decisionEditor}`}>
          <label>
            <span>{t('applications.search.profile')}</span>
            <select
              disabled={Boolean(loading)}
              onChange={(event) => {
                request.current?.abort();
                setSearchProfileId(event.target.value);
                setResult(undefined);
                setErrorStatus(undefined);
              }}
              value={searchProfileId}
            >
              <option value="">
                {t('semantic-analysis.choose.a.saved.profile')}
              </option>
              {searchProfiles.map((profile) => (
                <option
                  key={profile.searchProfileId}
                  value={profile.searchProfileId}
                >
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.processedFilters}>
            <button
              disabled={!searchProfileId || Boolean(loading)}
              onClick={() => void submit('read')}
              type="button"
            >
              {loading === 'read'
                ? t('semantic-analysis.looking.up')
                : t('semantic-analysis.view.latest.analysis')}
            </button>
            <button
              className="co-button"
              disabled={!searchProfileId || Boolean(loading) || outcomeUnknown}
              onClick={() => void submit('run')}
              type="button"
            >
              <Icon>auto_awesome</Icon>
              {loading === 'run'
                ? t('semantic-analysis.analyzing')
                : t('semantic-analysis.run.analysis')}
            </button>
          </div>
        </div>
      ) : (
        <div className={`${styles.semanticEmpty} ${styles.empty}`}>
          <Icon>manage_search</Icon>
          <div>
            <strong>
              {t('semantic-analysis.create.a.search.profile.first')}
            </strong>
            <p>
              {t(
                'semantic-analysis.the.profile.constraints.and.preferences.frame.every.analysis',
              )}{' '}
            </p>
          </div>
          <Link className="co-button" href="/search-profiles">
            {t('semantic-analysis.create.profile')}{' '}
          </Link>
        </div>
      )}

      {loading ? (
        <div
          aria-live="polite"
          className={styles.semanticLoading}
          role="status"
        >
          <div>
            <strong>
              {loading === 'read'
                ? t('semantic-analysis.looking.up.saved.analysis')
                : t('semantic-analysis.local.analysis.in.progress')}
            </strong>
            <p>{t('semantic-analysis.this.step.may.take.a.moment')}</p>
          </div>
        </div>
      ) : null}

      {errorStatus !== undefined || outcomeUnknown ? (
        <div className={`${styles.semanticError} ${styles.error}`} role="alert">
          <Icon>error</Icon>
          <div>
            <strong>
              {outcomeUnknown
                ? t('semantic-analysis.outcome.unknown.title')
                : semanticErrorTitle(t, errorStatus ?? 0)}
            </strong>
            <p>
              {outcomeUnknown
                ? t('semantic-analysis.outcome.unknown.copy')
                : semanticErrorCopy(t, errorStatus ?? 0)}
            </p>
          </div>
          {!outcomeUnknown ? (
            <button
              className="co-button"
              disabled={!searchProfileId}
              onClick={() =>
                void submit(errorStatus === 404 ? 'run' : lastRequest)
              }
              type="button"
            >
              {errorStatus === 404
                ? t('semantic-analysis.run.analysis')
                : t('applications.try.again')}
            </button>
          ) : null}
        </div>
      ) : null}

      {!loading && result?.status === 'blocked' ? (
        <BlockedAnalysis result={result} />
      ) : null}
      {!loading && result?.status === 'completed' ? (
        <CompletedAnalysis locale={locale} result={result} />
      ) : null}
    </section>
  );
}

function BlockedAnalysis({
  result,
}: {
  result: Extract<SemanticAnalysisResult, { status: 'blocked' }>;
}) {
  const { locale } = useI18n();
  const t = useTranslations([semanticAnalysisMessages]);
  const blocked = result.match.evaluation.criteria.filter(
    (criterion) => criterion.blocks,
  );
  return (
    <div className={styles.blockedAnalysis}>
      <header>
        <Icon>block</Icon>
        <div>
          <span>
            {t('semantic-analysis.analysis.stopped.before.the.model')}
          </span>
          <strong>
            {t('semantic-analysis.a.hard.constraint.blocks.the.recommendation')}
          </strong>
          <p>
            {t(
              'semantic-analysis.no.model.was.called.correct.the.profile.or.job',
            )}{' '}
          </p>
        </div>
      </header>
      <div className={styles.blockedCriteria}>
        {blocked.map((criterion) => (
          <article key={criterion.criterion}>
            <strong>{criterionCopy(t, criterion.criterion)}</strong>
            <p>{criterion.explanation}</p>
            <dl>
              <div>
                <dt>{t('semantic-analysis.expected')}</dt>
                <dd>
                  {criterion.expected
                    .map((value) =>
                      valueCopy(value, criterion.criterion, locale),
                    )
                    .join(', ') || t('semantic-analysis.not.set')}
                </dd>
              </div>
              <div>
                <dt>{t('semantic-analysis.observed')}</dt>
                <dd>
                  {criterion.observed
                    ? valueCopy(criterion.observed, criterion.criterion, locale)
                    : t('semantic-analysis.needs.verification')}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}

function CompletedAnalysis({
  locale,
  result,
}: {
  locale: 'en' | 'fr';
  result: Extract<SemanticAnalysisResult, { status: 'completed' }>;
}) {
  const t = useTranslations([semanticAnalysisMessages]);
  const { analysis } = result;
  const { artifact } = analysis;
  const strongReasons = [
    ...artifact.analysis.skills,
    ...artifact.analysis.responsibilities,
  ];
  const proofIndex = new Map(
    analysis.proofIndex.map((proof) => [proof.claimId, proof]),
  );
  return (
    <div>
      <header className={styles.analysisSummaryHeader}>
        <div>
          <span>{t('semantic-analysis.saved.result')}</span>
          <strong>
            {recommendationCopy(t, artifact.decomposition.recommendation)}
          </strong>
        </div>
        <time dateTime={analysis.createdAt}>
          {new Intl.DateTimeFormat(locale, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(analysis.createdAt))}
        </time>
      </header>
      <dl className={styles.analysisMetrics}>
        <Metric
          label={t('semantic-analysis.known.score')}
          value={
            artifact.decomposition.score === null
              ? t('semantic-analysis.unknown')
              : `${artifact.decomposition.score}/100`
          }
        />
        <Metric
          label={t('semantic-analysis.coverage')}
          value={`${artifact.decomposition.coveragePercent}% · ${artifact.decomposition.knownFactorCount}/${artifact.decomposition.requirementCount}`}
        />
        <Metric
          label={t('semantic-analysis.confidence')}
          value={confidenceCopy(t, artifact.decomposition.confidence)}
        />
        <Metric
          label={t('semantic-analysis.explanatory.risks')}
          value={String(artifact.decomposition.explanatoryRiskCount)}
        />
      </dl>
      <div className={styles.analysisSections}>
        <FactorSection
          initiallyOpen
          items={strongReasons}
          proofIndex={proofIndex}
          title={t('semantic-analysis.strong.reasons')}
        />
        <FactorSection
          items={artifact.analysis.transfers}
          proofIndex={proofIndex}
          title={t('semantic-analysis.transfers')}
        />
        <FactorSection
          items={artifact.analysis.gaps}
          proofIndex={proofIndex}
          title={t('semantic-analysis.real.gaps')}
        />
        <FactorSection
          items={artifact.analysis.unknowns}
          proofIndex={proofIndex}
          title={t('semantic-analysis.unknowns')}
        />
        <FactorSection
          items={artifact.analysis.risks}
          proofIndex={proofIndex}
          title={t('semantic-analysis.risks')}
        />
      </div>
      <footer className={styles.analysisLineage}>
        <Icon>verified_user</Icon>
        <span>
          {locale === 'en'
            ? `Job v${analysis.jobRevision} · search profile v${analysis.searchProfileRevision} · memory v${analysis.livingProfile.revision}`
            : `Offre v${analysis.jobRevision} · profil de recherche v${analysis.searchProfileRevision} · mémoire v${analysis.livingProfile.revision}`}
        </span>
      </footer>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function FactorSection({
  initiallyOpen = false,
  items,
  proofIndex,
  title,
}: {
  initiallyOpen?: boolean;
  items: AnalysisItem[];
  proofIndex: ReadonlyMap<string, Proof>;
  title: string;
}) {
  const t = useTranslations([semanticAnalysisMessages]);
  return (
    <details open={initiallyOpen}>
      <summary>
        <span>{title}</span>
        <small>{items.length}</small>
        <Icon>expand_more</Icon>
      </summary>
      <div className={styles.factorList}>
        {items.length ? (
          items.map((item, index) => (
            <article key={`${item.statement}-${index}`}>
              <header>
                <small>{factorCopy(t, item.factor)}</small>
                <strong>{item.statement}</strong>
              </header>
              <blockquote>{item.jobExcerpt}</blockquote>
              {item.profileReferences.length ? (
                <details className={styles.evidenceReferences}>
                  <summary>
                    {t('semantic-analysis.evidence.references')}{' '}
                    {item.profileReferences.length}
                  </summary>
                  <ul>
                    {item.profileReferences.map((reference) => {
                      const proof = proofIndex.get(reference.claimId);
                      if (!proof) return null;
                      const evidence = proof.evidence.filter((item) =>
                        reference.evidenceIds.includes(item.evidenceId),
                      );
                      return (
                        <li key={reference.claimId}>
                          <strong>{proof.statement}</strong>
                          {evidence.map((item) => (
                            <span key={item.evidenceId}>
                              {item.label} · {item.sourceTitle}
                              {item.sourceLocator ? (
                                <small>{item.sourceLocator}</small>
                              ) : null}
                            </span>
                          ))}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              ) : (
                <p className={styles.noEvidence}>
                  {t('semantic-analysis.no.candidate.evidence.linked')}{' '}
                </p>
              )}
            </article>
          ))
        ) : (
          <p className={styles.emptyFactor}>
            {t('semantic-analysis.no.item.in.this.pass')}
          </p>
        )}
      </div>
    </details>
  );
}

class SemanticRequestError extends Error {
  constructor(readonly status: number) {
    super(`Semantic request failed with ${status}.`);
  }
}

function semanticErrorTitle(
  t: Translator<typeof semanticAnalysisMessages>,
  status: number,
) {
  if (status === 404) return t('semantic-analysis.no.saved.analysis');
  if (status === 409) return t('semantic-analysis.exact.evidence.unavailable');
  if (status === 502) return t('semantic-analysis.invalid.model.response');
  if (status === 503) return t('semantic-analysis.local.model.unavailable');
  return t('semantic-analysis.analysis.unavailable');
}

function semanticErrorCopy(
  t: Translator<typeof semanticAnalysisMessages>,
  status: number,
) {
  if (status === 404)
    return t('semantic-analysis.no.result.exists.yet.for.this.profile.and.job');
  if (status === 409)
    return t('semantic-analysis.the.job.or.memory.does.not.yet.provide.the');
  if (status === 502)
    return t(
      'semantic-analysis.the.result.was.rejected.because.it.did.not.satisfy',
    );
  if (status === 503)
    return t(
      'semantic-analysis.check.the.local.model.configuration.then.run.the.analysis',
    );
  return t('semantic-analysis.the.request.did.not.complete.you.can.try.again');
}

function recommendationCopy(
  t: Translator<typeof semanticAnalysisMessages>,
  recommendation: PersistedSemanticAnalysis['artifact']['decomposition']['recommendation'],
) {
  return {
    priority: t('semantic-analysis.priority'),
    interesting: t('semantic-analysis.interesting'),
    exploratory: t('semantic-analysis.exploratory'),
    ignore: t('semantic-analysis.ignore'),
  }[recommendation];
}

function confidenceCopy(
  t: Translator<typeof semanticAnalysisMessages>,
  confidence: PersistedSemanticAnalysis['artifact']['decomposition']['confidence'],
) {
  return {
    low: t('semantic-analysis.low'),
    medium: t('semantic-analysis.medium'),
    high: t('semantic-analysis.high'),
  }[confidence];
}

function factorCopy(
  t: Translator<typeof semanticAnalysisMessages>,
  factor: AnalysisItem['factor'],
) {
  return {
    strong: t('semantic-analysis.strong'),
    partial: t('semantic-analysis.partial'),
    gap: t('semantic-analysis.gap'),
    unknown: t('semantic-analysis.unknown'),
  }[factor];
}

function criterionCopy(
  t: Translator<typeof semanticAnalysisMessages>,
  criterion: Extract<
    SemanticAnalysisResult,
    { status: 'blocked' }
  >['match']['evaluation']['criteria'][number]['criterion'],
) {
  return {
    availability: t('semantic-analysis.availability'),
    role: t('semantic-analysis.role'),
    seniority: t('semantic-analysis.seniority'),
    location: t('semantic-analysis.location'),
    remoteMode: t('semantic-analysis.work.mode'),
    timezone: t('semantic-analysis.time.zone'),
    language: t('semantic-analysis.language'),
    contractType: t('semantic-analysis.contract'),
    salary: t('semantic-analysis.salary'),
    company: t('semantic-analysis.company'),
    network: t('semantic-analysis.network'),
  }[criterion];
}

function valueCopy(value: string, criterion: string, locale: 'en' | 'fr') {
  if (!['availability', 'remoteMode', 'contractType'].includes(criterion))
    return value;
  if (locale === 'fr') return value;
  return (
    {
      onsite: 'On-site',
      hybrid: 'Hybrid',
      remote: 'Remote',
      unknown: 'Unknown',
      open: 'Open',
      changed: 'Changed',
      closed: 'Closed',
      reposted: 'Reposted',
      full_time: 'Full time',
      part_time: 'Part time',
      internship: 'Internship',
      contract: 'Contract',
      temporary: 'Temporary',
    }[value] ?? value
  );
}

import type { Translator } from '@/lib/i18n/messages';
