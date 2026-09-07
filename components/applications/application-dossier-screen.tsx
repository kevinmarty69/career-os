'use client';

import { useTranslations } from '@/components/i18n/i18n-provider';
import { dossierMessages } from '@/lib/i18n/dictionaries/dossier';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';
import { activeRoutesMessages } from '@/lib/i18n/dictionaries/active-routes';

import { ApplicationEvidenceCheckpoint } from '@/components/applications/application-evidence-checkpoint';
import { ApplicationKitPanel } from '@/components/applications/application-kit-panel';
import { ApplicationPageDraftCheckpoint } from '@/components/applications/application-page-draft-checkpoint';
import { ApplicationPublicationCheckpoint } from '@/components/applications/application-publication-checkpoint';
import { ApplicationResearchCheckpoint } from '@/components/applications/application-research-checkpoint';
import { ApplicationReviewCheckpoint } from '@/components/applications/application-review-checkpoint';
import { ApplicationStrategyCheckpoint } from '@/components/applications/application-strategy-checkpoint';
import { useApplicationWorkflow } from '@/components/applications/use-application-workflow';
import {
  actorLabel,
  attemptLabel,
  runStageLabel,
  runStatusLabel,
  stageLabel,
  stepStatusLabel,
  workflowErrorLabel,
} from '@/components/applications/workflow-labels';
import { useI18n } from '@/components/i18n/i18n-provider';
import { DossierShell } from '@/components/layout/dossier-shell';
import { Badge, Button, Icon } from '@/components/ui/primitives';
import {
  type Application,
  applicationSchema,
} from '@/lib/application-contract';
import { readApplication, saveApplicationBrand } from '@/lib/career-api';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export function DynamicDossierScreen({
  applicationId,
}: {
  applicationId: string;
}) {
  const t = useTranslations([
    dossierMessages,
    applicationsMessages,
    activeRoutesMessages,
  ]);

  const { locale } = useI18n();
  const workflow = useApplicationWorkflow(applicationId);
  const [result, setResult] = useState<{
    applicationId: string;
    application?: Application;
    error?: 'auth' | 'missing' | 'unavailable';
  }>();
  const [brandState, setBrandState] = useState<
    'ready' | 'saving' | 'saved' | 'error'
  >('ready');
  const current = result?.applicationId === applicationId ? result : undefined;
  const application = current?.application;
  const error = current?.error;

  async function saveBrand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!application || workflow.run || brandState === 'saving') return;
    const form = new FormData(event.currentTarget);
    const logoUrl = String(form.get('logoUrl') ?? '').trim() || undefined;
    const accent = String(form.get('accent') ?? '');
    setBrandState('saving');
    try {
      const response = await saveApplicationBrand(application, logoUrl, accent);
      if (!response.ok) throw new Error();
      const parsed = applicationSchema.parse(await response.json());
      setResult({ applicationId, application: parsed });
      setBrandState('saved');
    } catch {
      setBrandState('error');
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void readApplication(applicationId, controller.signal)
      .then(async (response) => {
        if (response.status === 401)
          return setResult({ applicationId, error: 'auth' });
        if (response.status === 404)
          return setResult({ applicationId, error: 'missing' });
        if (!response.ok)
          return setResult({ applicationId, error: 'unavailable' });
        const parsed = applicationSchema.safeParse(await response.json());
        if (!parsed.success)
          return setResult({ applicationId, error: 'unavailable' });
        setResult({ applicationId, application: parsed.data });
      })
      .catch((requestError: unknown) => {
        if (
          !(requestError instanceof DOMException) ||
          requestError.name !== 'AbortError'
        )
          setResult({ applicationId, error: 'unavailable' });
      });
    return () => controller.abort();
  }, [applicationId]);

  const identity = application
    ? {
        applicationId,
        company: application.company,
        role: application.role,
      }
    : {
        applicationId,
        company: t('dossier.application'),
        role: t('active-routes.loading'),
      };

  return (
    <DossierShell
      actions={
        application && !workflow.run ? (
          <Button
            disabled={workflow.loading || workflow.profileRevision === 0}
            onClick={() => void workflow.start(application)}
          >
            <Icon>bolt</Icon>
            {workflow.starting
              ? t('dossier.starting.workflow')
              : t('dossier.start.agent.workflow')}
          </Button>
        ) : null
      }
      active=""
      identity={identity}
      state={
        application ? (
          <Badge tone="muted">
            {t('dossier.real.application.persisted.data')}
          </Badge>
        ) : undefined
      }
    >
      <div className="co-dossier-content co-live-dossier">
        {!application ? (
          <section className="co-panel co-live-dossier-state">
            <h1>
              {error === 'auth'
                ? t('dossier.sign.in.to.open.this.application')
                : error === 'missing'
                  ? t('dossier.this.application.could.not.be.found')
                  : error === 'unavailable'
                    ? t('dossier.unable.to.load.this.application')
                    : t('dossier.loading.application')}
            </h1>
            {error ? (
              <Link className="co-button" href="/applications">
                {t('dossier.back.to.applications')}{' '}
              </Link>
            ) : null}
          </section>
        ) : (
          <section className="co-panel co-live-dossier-card">
            <p>{t('dossier.real.application.persisted.data')}</p>
            <h1>{application.role}</h1>
            <h2>{application.company}</h2>
            <dl>
              <div>
                <dt>{t('dossier.stage')}</dt>
                <dd>{stageLabel(application.stage, locale)}</dd>
              </div>
              <div>
                <dt>{t('applications.revision')}</dt>
                <dd>{application.revision}</dd>
              </div>
              <div>
                <dt>{t('dossier.last.updated')}</dt>
                <dd>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(application.updatedAt))}
                </dd>
              </div>
            </dl>
            <p>{application.description}</p>
            <section className="co-company-brand">
              <header>
                <div>
                  <h2>{t('dossier.private.page.visual.identity')}</h2>
                  <p>
                    {t(
                      'dossier.the.logo.and.color.personalize.this.application.without.imitating',
                    )}{' '}
                  </p>
                </div>
                <span
                  aria-hidden="true"
                  style={{ background: application.accent }}
                >
                  {application.logoUrl ? (
                    // User-supplied remote hosts cannot be declared in Next image config.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" src={application.logoUrl} />
                  ) : (
                    application.company.slice(0, 2).toUpperCase()
                  )}
                </span>
              </header>
              {workflow.run ? (
                <p>{t('dossier.identity.locked.in.this.run.snapshot')}</p>
              ) : (
                <form onSubmit={saveBrand}>
                  <label>
                    {t('dossier.company.logo')}{' '}
                    <input
                      defaultValue={application.logoUrl ?? ''}
                      name="logoUrl"
                      placeholder="https://…"
                      type="url"
                    />
                  </label>
                  <label>
                    {t('dossier.accessible.primary.color')}{' '}
                    <input
                      defaultValue={application.accent}
                      name="accent"
                      type="color"
                    />
                  </label>
                  <button
                    className="co-button quiet"
                    disabled={brandState === 'saving'}
                    type="submit"
                  >
                    {brandState === 'saving'
                      ? t('applications.saving')
                      : t('dossier.save.identity')}
                  </button>
                </form>
              )}
              {brandState === 'saved' ? (
                <p role="status">
                  {t('dossier.identity.saved.for.the.next.run')}
                </p>
              ) : null}
              {brandState === 'error' ? (
                <p role="alert">
                  {t(
                    'dossier.identity.could.not.be.saved.check.the.url.and',
                  )}{' '}
                </p>
              ) : null}
            </section>
            <section className="co-live-workflow">
              <h2>{t('dossier.agent.workflow')}</h2>
              {workflow.loading ? (
                <p>{t('dossier.looking.for.an.existing.run')}</p>
              ) : workflow.run ? (
                <>
                  <dl>
                    <div>
                      <dt>{t('dossier.run.status')}</dt>
                      <dd>{runStatusLabel(workflow.run.status, locale)}</dd>
                    </div>
                    <div>
                      <dt>{t('dossier.active.stage')}</dt>
                      <dd>{runStageLabel(workflow.run.stage, locale)}</dd>
                    </div>
                    <div>
                      <dt>{t('dossier.persisted.events')}</dt>
                      <dd>{workflow.run.events.length}</dd>
                    </div>
                  </dl>
                  <div className="co-run-journal">
                    <section>
                      <h3>{t('active-routes.progress')}</h3>
                      {workflow.run.steps.map((step) => (
                        <article key={`${step.stage}-${step.attempt}`}>
                          <Icon>
                            {step.status === 'completed'
                              ? 'check_circle'
                              : step.status === 'failed'
                                ? 'error'
                                : 'pending'}
                          </Icon>
                          <span>
                            <strong>{runStageLabel(step.stage, locale)}</strong>
                            <small>
                              {stepStatusLabel(step.status, locale)} ·{' '}
                              {attemptLabel(step.attempt, locale)}
                            </small>
                          </span>
                        </article>
                      ))}
                    </section>
                    <section>
                      <h3>{t('dossier.readable.log')}</h3>
                      {workflow.run.events.length ? (
                        workflow.run.events.slice(-5).map((event, index) => (
                          <article key={`${event.type}-${index}`}>
                            <Icon>notes</Icon>
                            <span>
                              <strong>{actorLabel(event.actor, locale)}</strong>
                              <small>{event.summary}</small>
                            </span>
                          </article>
                        ))
                      ) : (
                        <p>{t('dossier.the.first.event.will.appear.here')}</p>
                      )}
                    </section>
                  </div>
                </>
              ) : workflow.error ? (
                <p role="alert">{workflowErrorLabel(t, workflow.error)}</p>
              ) : (
                <p>
                  {t(
                    'dossier.no.run.yet.the.button.starts.a.bounded.persisted',
                  )}{' '}
                </p>
              )}
              {workflow.error === 'profile-missing' ? (
                <Link href="/memory">
                  {t('dossier.complete.career.memory')}
                </Link>
              ) : workflow.error === 'auth' ? (
                <Link href="/sign-in">{t('active-routes.sign.in')}</Link>
              ) : workflow.error === 'worker-unavailable' ? (
                <Link href="/settings/models">
                  {t('dossier.check.worker.availability')}
                </Link>
              ) : workflow.error === 'conflict' ? (
                <button onClick={() => location.reload()} type="button">
                  {t('dossier.reload.application')}{' '}
                </button>
              ) : workflow.error === 'rate-limited' ||
                workflow.error === 'unavailable' ? (
                <button
                  disabled={workflow.starting}
                  onClick={() => void workflow.start(application)}
                  type="button"
                >
                  {t('applications.try.again')}{' '}
                </button>
              ) : null}
            </section>
            {workflow.run?.research &&
            workflow.run.status === 'paused' &&
            !workflow.run.evidenceArchive ? (
              <ApplicationResearchCheckpoint
                error={workflow.decisionError}
                key={workflow.run.research.artifactId}
                onConfirm={(signalIds) =>
                  void workflow.confirmResearch(signalIds)
                }
                pending={workflow.decisionPending}
                research={workflow.run.research}
              />
            ) : null}
            {workflow.run?.research &&
            workflow.run.evidenceArchive &&
            workflow.run.status === 'paused' &&
            workflow.run.stage === 'strategy' &&
            !workflow.run.strategy ? (
              <ApplicationEvidenceCheckpoint
                archive={workflow.run.evidenceArchive}
                error={workflow.decisionError}
                onConfirm={() => void workflow.startStrategy()}
                pending={workflow.decisionPending}
                profile={workflow.run.profile}
                research={workflow.run.research}
              />
            ) : null}
            {workflow.run?.research &&
            workflow.run.strategy &&
            workflow.run.status === 'paused' &&
            workflow.run.stage === 'strategy_review' ? (
              <ApplicationStrategyCheckpoint
                error={workflow.decisionError}
                onConfirm={() => void workflow.approveStrategy()}
                pending={workflow.decisionPending}
                profile={workflow.run.profile}
                research={workflow.run.research}
                strategy={workflow.run.strategy}
              />
            ) : null}
            {workflow.run?.research && workflow.run.strategy ? (
              <ApplicationKitPanel
                company={application.company}
                profile={workflow.run.profile}
                research={workflow.run.research}
                role={application.role}
                strategy={workflow.run.strategy}
              />
            ) : null}
            {workflow.run?.spec &&
            workflow.run.status === 'paused' &&
            workflow.run.stage === 'page_spec_review' ? (
              <ApplicationPageDraftCheckpoint
                error={workflow.decisionError}
                logoUrl={application.logoUrl}
                onConfirm={() => void workflow.startReviews()}
                pending={workflow.decisionPending}
                profile={workflow.run.profile}
                spec={workflow.run.spec}
              />
            ) : null}
            {workflow.run &&
            workflow.run.reviews.length > 0 &&
            ['awaiting_approval', 'blocked'].includes(workflow.run.status) ? (
              <ApplicationReviewCheckpoint
                error={workflow.reviewError}
                onDecide={(reviewId, issueIndex, decision) =>
                  void workflow.decideReview(reviewId, issueIndex, decision)
                }
                pending={workflow.reviewPending}
                run={workflow.run}
              />
            ) : null}
            {workflow.run?.publicationEligible ? (
              <ApplicationPublicationCheckpoint
                busy={workflow.starting}
                error={workflow.publicationError}
                onCopy={() => void workflow.copyPublicationLink()}
                onNewVersion={() => void workflow.start(application, true)}
                onPublish={() => void workflow.publish()}
                onRevoke={() => void workflow.revoke()}
                pending={workflow.publicationPending}
                publication={workflow.publication}
                revoked={workflow.publicationRevoked}
              />
            ) : null}
            {application.url ? (
              <a
                className="co-button"
                href={application.url}
                rel="noreferrer"
                target="_blank"
              >
                {t('dossier.open.original.job')}{' '}
              </a>
            ) : (
              <span>{t('dossier.no.source.url.saved')}</span>
            )}
            <footer>
              {t(
                'dossier.this.application.is.ready.for.company.research.and.the',
              )}{' '}
            </footer>
          </section>
        )}
      </div>
    </DossierShell>
  );
}
