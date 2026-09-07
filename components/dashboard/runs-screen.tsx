'use client';

import {
  actorLabel,
  attemptLabel,
  runSources,
  runStageLabel,
  runStatusLabel,
  runStatusTone,
  stepIcon,
  stepStatusLabel,
} from '@/components/applications/workflow-labels';
import { useWorkflowDashboard } from '@/components/dashboard/use-workflow-dashboard';
import { useI18n, useTranslations } from '@/components/i18n/i18n-provider';
import { AppShell } from '@/components/layout/app-shell';
import { OnboardingEmptyState } from '@/components/ui/onboarding-empty-state';
import { Badge, Company, Icon, PageHeader } from '@/components/ui/primitives';
import { operationalMessages } from '@/lib/i18n/dictionaries/operational';
import { initials } from '@/lib/initials';
import Link from 'next/link';

const FAILED_STATUSES = new Set(['blocked', 'budget_exhausted', 'failed']);

export function RunsScreen() {
  const { locale } = useI18n();
  const t = useTranslations([operationalMessages]);
  const { dashboard, error } = useWorkflowDashboard();
  const items = dashboard?.items.filter(({ run }) => run) ?? [];
  const failedItems = items.filter(({ run }) =>
    FAILED_STATUSES.has(run!.status),
  );
  const highlighted = failedItems[0];

  return (
    <AppShell path="/runs">
      <div className="co-runs-screen">
        <PageHeader
          title={t('operations.runs.title')}
          copy={
            dashboard
              ? t('operations.runs.summary', {
                  count: items.length,
                  failed: failedItems.length,
                })
              : t('operations.runs.loading')
          }
        />

        {error ? (
          <div className="co-note" role="alert">
            <Icon>cloud_off</Icon>
            {error === 'auth'
              ? t('operations.runs.sign.in')
              : t('operations.runs.unavailable')}
          </div>
        ) : null}

        {dashboard && !error && !items.length ? (
          <OnboardingEmptyState kind="runs" />
        ) : null}

        {highlighted?.run ? (
          <section className="co-run-failure-panel" role="alert">
            <div className="co-run-failure-main">
              <header>
                <span className="co-run-failure-icon">
                  <Icon>error</Icon>
                </span>
                <div>
                  <p>
                    {t('operations.runs.interrupted')} ·{' '}
                    {runStageLabel(highlighted.run.stage, locale)}
                  </p>
                  <h2>
                    {highlighted.application.company} ·{' '}
                    {highlighted.application.role}
                  </h2>
                  <code>run {highlighted.run.runId.slice(0, 8)}</code>
                </div>
              </header>
              <p>{t('operations.runs.interrupted.detail')}</p>
              <div className="co-run-recovery-grid">
                <section>
                  <h3>{t('operations.runs.saved.steps')}</h3>
                  {highlighted.run.steps
                    .filter(({ status }) => status === 'completed')
                    .map((step) => (
                      <div key={`${step.stage}-${step.attempt}`}>
                        <Icon>check_circle</Icon>
                        <span>
                          <strong>{runStageLabel(step.stage, locale)}</strong>
                          <small>{stepStatusLabel(step.status, locale)}</small>
                        </span>
                      </div>
                    ))}
                </section>
                <section>
                  <h3>{t('operations.runs.failed.step')}</h3>
                  {highlighted.run.steps
                    .filter(({ status }) => status === 'failed')
                    .map((step) => (
                      <div
                        className="is-failed"
                        key={`${step.stage}-${step.attempt}`}
                      >
                        <Icon>error</Icon>
                        <span>
                          <strong>{runStageLabel(step.stage, locale)}</strong>
                          <small>
                            {step.failureCode ??
                              stepStatusLabel(step.status, locale)}
                          </small>
                        </span>
                      </div>
                    ))}
                  {!highlighted.run.steps.some(
                    ({ status }) => status === 'failed',
                  ) ? (
                    <p>{t('operations.runs.no.failed.step')}</p>
                  ) : null}
                </section>
              </div>
              <footer>
                <Link
                  className="co-button"
                  href={`/applications/${highlighted.application.applicationId}`}
                >
                  {t('operations.runs.open')}
                  <Icon>arrow_forward</Icon>
                </Link>
              </footer>
            </div>
            <aside>
              <h3>{t('operations.runs.recorded.usage')}</h3>
              <dl>
                <div>
                  <dt>{t('operations.runs.cost')}</dt>
                  <dd>
                    {(
                      highlighted.run.usedCostMicros / 1_000_000
                    ).toLocaleString(locale, {
                      style: 'currency',
                      currency: 'EUR',
                    })}
                  </dd>
                </div>
                <div>
                  <dt>{t('operations.runs.tokens')}</dt>
                  <dd>{highlighted.run.usedTokens.toLocaleString(locale)}</dd>
                </div>
                <div>
                  <dt>{t('operations.runs.sources')}</dt>
                  <dd>
                    {
                      runSources(highlighted.application, highlighted.run)
                        .length
                    }
                  </dd>
                </div>
              </dl>
            </aside>
          </section>
        ) : null}

        {items.length ? (
          <section className="co-run-history">
            <header>
              <h2>{t('operations.runs.other')}</h2>
              <span>{items.length}</span>
            </header>
            <div className="co-run-ledger">
              {items.map(({ application, run }) => {
                const sources = runSources(application, run!);
                const failures = run!.steps.filter(
                  ({ status }) => status === 'failed',
                );
                return (
                  <article className="co-panel" key={run!.runId}>
                    <header>
                      <Company
                        initials={initials(application.company)}
                        name={`${application.company} · ${application.role}`}
                        sub={`run ${run!.runId.slice(0, 8)}`}
                      />
                      <Badge tone={runStatusTone(run!.status)}>
                        {runStatusLabel(run!.status, locale)}
                      </Badge>
                    </header>
                    <dl className="co-run-facts">
                      <div>
                        <dt>{t('operations.runs.stage')}</dt>
                        <dd>{runStageLabel(run!.stage, locale)}</dd>
                      </div>
                      <div>
                        <dt>{t('operations.runs.cost')}</dt>
                        <dd>
                          {(run!.usedCostMicros / 1_000_000).toLocaleString(
                            locale,
                            { style: 'currency', currency: 'EUR' },
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>{t('operations.runs.tokens')}</dt>
                        <dd>{run!.usedTokens.toLocaleString(locale)}</dd>
                      </div>
                      <div>
                        <dt>{t('operations.runs.sources')}</dt>
                        <dd>{sources.length}</dd>
                      </div>
                    </dl>
                    <div className="co-run-journal">
                      <section>
                        <h3>{t('operations.runs.steps')}</h3>
                        {run!.steps.length ? (
                          run!.steps.map((step) => (
                            <article key={`${step.stage}-${step.attempt}`}>
                              <Icon>{stepIcon(step.status)}</Icon>
                              <span>
                                <strong>
                                  {runStageLabel(step.stage, locale)}
                                </strong>
                                <small>
                                  {stepStatusLabel(step.status, locale)} ·{' '}
                                  {attemptLabel(step.attempt, locale)}
                                </small>
                              </span>
                            </article>
                          ))
                        ) : (
                          <p>{t('operations.runs.no.steps')}</p>
                        )}
                      </section>
                      <section>
                        <h3>{t('operations.runs.events')}</h3>
                        {run!.events.length ? (
                          run!.events.slice(-6).map((event, index) => (
                            <article key={`${event.type}-${index}`}>
                              <Icon>notes</Icon>
                              <span>
                                <strong>
                                  {actorLabel(event.actor, locale)}
                                </strong>
                                <small>{event.summary}</small>
                              </span>
                            </article>
                          ))
                        ) : (
                          <p>{t('operations.runs.no.events')}</p>
                        )}
                        {run!.reviewDecisions.length ? (
                          <p>
                            {run!.reviewDecisions.length}{' '}
                            {run!.reviewDecisions.length === 1
                              ? t('operations.runs.human.decision')
                              : t('operations.runs.human.decisions')}
                          </p>
                        ) : null}
                      </section>
                      <section>
                        <h3>{t('operations.runs.sources')}</h3>
                        {sources.length ? (
                          sources.map((source) => (
                            <article key={source}>
                              <Icon>link</Icon>
                              <span>
                                <strong>{new URL(source).hostname}</strong>
                                <small>{source}</small>
                              </span>
                            </article>
                          ))
                        ) : (
                          <p>{t('operations.runs.no.sources')}</p>
                        )}
                      </section>
                      <section>
                        <h3>{t('operations.runs.errors')}</h3>
                        {failures.length ? (
                          failures.map((step) => (
                            <article key={`${step.stage}-${step.attempt}`}>
                              <Icon>error</Icon>
                              <span>
                                <strong>
                                  {runStageLabel(step.stage, locale)}
                                </strong>
                                <small>
                                  {step.failureCode ??
                                    stepStatusLabel(step.status, locale)}
                                </small>
                              </span>
                            </article>
                          ))
                        ) : (
                          <p>{t('operations.runs.no.errors')}</p>
                        )}
                      </section>
                    </div>
                    <footer>
                      <Link
                        className="co-button quiet"
                        href={`/applications/${application.applicationId}`}
                      >
                        {t('operations.runs.open')}
                      </Link>
                    </footer>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
