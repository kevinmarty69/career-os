'use client';

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
  runStageLabel,
  runStatusLabel,
  runStatusTone,
  stepStatusLabel,
  workflowErrorLabel,
} from '@/components/applications/workflow-labels';
import { useI18n, useTranslations } from '@/components/i18n/i18n-provider';
import { DossierShell } from '@/components/layout/dossier-shell';
import { Badge, Button, Icon } from '@/components/ui/primitives';
import {
  type Application,
  applicationSchema,
} from '@/lib/application-contract';
import { readApplication, saveApplicationBrand } from '@/lib/career-api';
import { activeRoutesMessages } from '@/lib/i18n/dictionaries/active-routes';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';
import { dossierMessages } from '@/lib/i18n/dictionaries/dossier';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import styles from './application-flow.module.css';

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
  const pathname = usePathname();
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
  const route = pathname.endsWith('/review')
    ? 'review'
    : pathname.endsWith('/preview') || pathname.endsWith('/page')
      ? 'preview'
      : pathname.endsWith('/publish') || pathname.endsWith('/published')
        ? 'publish'
        : 'overview';

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
        setResult(
          parsed.success
            ? { applicationId, application: parsed.data }
            : { applicationId, error: 'unavailable' },
        );
      })
      .catch((requestError: unknown) => {
        if (
          !(requestError instanceof DOMException) ||
          requestError.name !== 'AbortError'
        ) {
          setResult({ applicationId, error: 'unavailable' });
        }
      });
    return () => controller.abort();
  }, [applicationId]);

  async function saveBrand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!application || workflow.run || brandState === 'saving') return;
    const form = new FormData(event.currentTarget);
    setBrandState('saving');
    try {
      const response = await saveApplicationBrand(
        application,
        String(form.get('logoUrl') ?? '').trim() || undefined,
        String(form.get('accent') ?? ''),
      );
      if (!response.ok) throw new Error();
      setResult({
        applicationId,
        application: applicationSchema.parse(await response.json()),
      });
      setBrandState('saved');
    } catch {
      setBrandState('error');
    }
  }

  const identity = application
    ? { applicationId, company: application.company, role: application.role }
    : {
        applicationId,
        company: t('dossier.application'),
        role: t('active-routes.loading'),
      };

  if (!application) {
    return (
      <DossierShell active="" identity={identity}>
        <div className={styles.flow}>
          <section className={styles.panel}>
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
                {t('dossier.back.to.applications')}
              </Link>
            ) : null}
          </section>
        </div>
      </DossierShell>
    );
  }

  const run = workflow.run;
  const stopped =
    run &&
    ['failed', 'blocked', 'budget_exhausted', 'cancelled'].includes(run.status);
  if (run && (run.status === 'running' || stopped)) {
    return (
      <DossierShell
        active=""
        identity={identity}
        state={
          <Badge tone={runStatusTone(run.status)}>
            {runStatusLabel(run.status, locale)}
          </Badge>
        }
      >
        <RunningScreen run={run} />
        {stopped ? (
          <div className={styles.flow}>
            <p role="status">
              {locale === 'en'
                ? 'This run stopped. Its evidence and history are preserved; no page was published by this action. Check the instance before starting a new run.'
                : 'Ce run est arrêté. Ses preuves et son historique sont conservés ; cette action n’a publié aucune page. Vérifiez l’instance avant de lancer un nouveau run.'}
            </p>
            {workflow.error ? (
              <p role="alert">{workflowErrorLabel(t, workflow.error)}</p>
            ) : null}
            <footer className={styles.actionBar}>
              <Link href="/settings/models">
                {t('dossier.check.worker.availability')}
              </Link>
              <Button
                disabled={workflow.starting}
                onClick={() => void workflow.start(application, true)}
              >
                {locale === 'en' ? 'Start a new run' : 'Lancer un nouveau run'}
              </Button>
            </footer>
          </div>
        ) : null}
      </DossierShell>
    );
  }
  const checkpoint =
    run?.research && run.status === 'paused' && !run.evidenceArchive
      ? 'research'
      : run?.research &&
          run.evidenceArchive &&
          run.status === 'paused' &&
          run.stage === 'strategy' &&
          !run.strategy
        ? 'evidence'
        : run?.research &&
            run.strategy &&
            run.status === 'paused' &&
            run.stage === 'strategy_review'
          ? 'strategy'
          : undefined;

  if (route === 'review' || checkpoint) {
    const reviewIssueCount =
      run?.reviews.reduce((count, review) => count + review.issues.length, 0) ??
      0;
    const reviewUnresolved = Math.max(
      0,
      reviewIssueCount - (run?.reviewDecisions.length ?? 0),
    );
    const reviewCurrent = Math.min(
      reviewIssueCount,
      reviewIssueCount - reviewUnresolved + 1,
    );
    const fullscreenIdentity =
      !checkpoint && run
        ? {
            ...identity,
            company:
              locale === 'en'
                ? `Review · ${identity.company}`
                : `Arbitrage · ${identity.company}`,
            role:
              locale === 'en'
                ? `Decision ${reviewCurrent} of ${reviewIssueCount}`
                : `Décision ${reviewCurrent} sur ${reviewIssueCount}`,
          }
        : identity;

    return (
      <DossierShell
        active=""
        fullscreen
        identity={fullscreenIdentity}
        state={
          !checkpoint && reviewIssueCount ? (
            <span
              aria-label={
                locale === 'en'
                  ? `${reviewUnresolved} decisions remaining`
                  : `${reviewUnresolved} décisions restantes`
              }
              className={styles.reviewHeaderProgress}
            >
              {Array.from({ length: reviewIssueCount }, (_, index) => (
                <i data-active={index === reviewCurrent - 1} key={index} />
              ))}
              <small>
                ≈ {reviewUnresolved} min{' '}
                {locale === 'en' ? 'remaining' : 'restantes'}
              </small>
            </span>
          ) : (
            <Badge tone="warn">
              {run
                ? runStatusLabel(run.status, locale)
                : t('dossier.needs.review')}
            </Badge>
          )
        }
      >
        <div className={styles.checkpointStage}>
          {checkpoint === 'research' && run?.research ? (
            <ApplicationResearchCheckpoint
              error={workflow.decisionError}
              key={run.research.artifactId}
              onConfirm={(signalIds) =>
                void workflow.confirmResearch(signalIds)
              }
              pending={workflow.decisionPending}
              research={run.research}
            />
          ) : null}
          {checkpoint === 'evidence' && run?.research && run.evidenceArchive ? (
            <ApplicationEvidenceCheckpoint
              archive={run.evidenceArchive}
              error={workflow.decisionError}
              onConfirm={() => void workflow.startStrategy()}
              pending={workflow.decisionPending}
              profile={run.profile}
              research={run.research}
            />
          ) : null}
          {checkpoint === 'strategy' && run?.research && run.strategy ? (
            <ApplicationStrategyCheckpoint
              error={workflow.decisionError}
              onConfirm={() => void workflow.approveStrategy()}
              pending={workflow.decisionPending}
              profile={run.profile}
              research={run.research}
              strategy={run.strategy}
            />
          ) : null}
          {!checkpoint && run?.reviews.length ? (
            <ApplicationReviewCheckpoint
              applicationId={applicationId}
              error={workflow.reviewError}
              onDecide={(reviewId, issueIndex, decision, replacementClaimId) =>
                void workflow.decideReview(
                  reviewId,
                  issueIndex,
                  decision,
                  replacementClaimId,
                )
              }
              pending={workflow.reviewPending}
              run={run}
            />
          ) : null}
          {!checkpoint && !run?.reviews.length ? (
            <section className={styles.panel}>
              <h1>{t('dossier.no.reviews.yet')}</h1>
              <Link
                className="co-button"
                href={`/applications/${applicationId}`}
              >
                {t('dossier.back.to.applications')}
              </Link>
            </section>
          ) : null}
        </div>
      </DossierShell>
    );
  }

  if (
    route === 'preview' &&
    run?.spec &&
    (run.stage === 'page_spec_review' ||
      run.publicationEligible ||
      workflow.publication)
  ) {
    const preview = run.stage !== 'page_spec_review';
    if (workflow.publication) {
      return (
        <DossierShell active="page" identity={identity}>
          <div className={styles.flow}>
            <ApplicationPublicationCheckpoint
              application={application}
              busy={workflow.starting}
              error={workflow.publicationError}
              onCopy={() => void workflow.copyPublicationLink()}
              onNewVersion={() => void workflow.start(application, true)}
              onPublish={() => void workflow.publish()}
              onRevoke={() => void workflow.revoke()}
              pending={workflow.publicationPending}
              profile={run.profile}
              publication={workflow.publication}
              revoked={workflow.publicationRevoked}
              spec={run.spec}
            />
          </div>
        </DossierShell>
      );
    }
    return (
      <DossierShell active="page" identity={identity}>
        <div className={styles.flow}>
          <ApplicationPageDraftCheckpoint
            error={
              preview
                ? Boolean(workflow.publicationError)
                : workflow.decisionError
            }
            logoUrl={application.logoUrl}
            mode={preview ? 'preview' : 'draft'}
            onConfirm={() =>
              void (preview ? workflow.publish() : workflow.startReviews())
            }
            pending={
              preview
                ? workflow.publicationPending === 'publish'
                : workflow.decisionPending
            }
            profile={run.profile}
            spec={run.spec}
          />
        </div>
      </DossierShell>
    );
  }

  if (route === 'publish' && run?.publicationEligible) {
    return (
      <DossierShell active="page" identity={identity}>
        <div className={styles.flow}>
          <ApplicationPublicationCheckpoint
            application={application}
            busy={workflow.starting}
            error={workflow.publicationError}
            onCopy={() => void workflow.copyPublicationLink()}
            onNewVersion={() => void workflow.start(application, true)}
            onPublish={() => void workflow.publish()}
            onRevoke={() => void workflow.revoke()}
            pending={workflow.publicationPending}
            profile={run.profile}
            publication={workflow.publication}
            revoked={workflow.publicationRevoked}
            spec={run.spec}
          />
        </div>
      </DossierShell>
    );
  }

  return (
    <DossierShell
      active=""
      identity={identity}
      state={
        run ? (
          <Badge tone={run.status === 'running' ? 'accent' : 'muted'}>
            {runStatusLabel(run.status, locale)}
          </Badge>
        ) : (
          <Badge tone="muted">
            {t('dossier.real.application.persisted.data')}
          </Badge>
        )
      }
    >
      {!run ? (
        <FramingScreen
          application={application}
          brandState={brandState}
          error={workflow.error}
          loading={workflow.loading || workflow.profileRevision === 0}
          onSaveBrand={saveBrand}
          onStart={() => void workflow.start(application)}
          starting={workflow.starting}
        />
      ) : (
        <RunSummary application={application} run={run} />
      )}
    </DossierShell>
  );
}

function FramingScreen({
  application,
  brandState,
  error,
  loading,
  onSaveBrand,
  onStart,
  starting,
}: {
  application: Application;
  brandState: 'ready' | 'saving' | 'saved' | 'error';
  error?: Parameters<typeof workflowErrorLabel>[1];
  loading: boolean;
  onSaveBrand: (event: React.FormEvent<HTMLFormElement>) => void;
  onStart: () => void;
  starting: boolean;
}) {
  const t = useTranslations([dossierMessages, applicationsMessages]);
  return (
    <div className={styles.flow}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>{t('dossier.application.workspace')}</p>
        <h1>{application.role}</h1>
        <p>{application.company}</p>
      </header>
      <div className={styles.framingGrid}>
        <div className={styles.stack}>
          <section className={styles.panel}>
            <h2>{t('dossier.open.original.job')}</h2>
            <p>{application.description}</p>
            {application.url ? (
              <a href={application.url} rel="noreferrer" target="_blank">
                {application.url}
              </a>
            ) : (
              <span>{t('dossier.no.source.url.saved')}</span>
            )}
          </section>
          <section className={styles.panel}>
            <h2>{t('dossier.agent.workflow')}</h2>
            <ul className={styles.sourceList}>
              <li className={styles.sourceItem}>
                <Icon>description</Icon>
                <span>
                  <strong>{t('dossier.open.original.job')}</strong>
                  <small>{t('dossier.real.application.persisted.data')}</small>
                </span>
              </li>
              <li className={styles.sourceItem}>
                <Icon>database</Icon>
                <span>
                  <strong>{t('dossier.complete.career.memory')}</strong>
                  <small>
                    {t('dossier.identity.locked.in.this.run.snapshot')}
                  </small>
                </span>
              </li>
            </ul>
          </section>
        </div>
        <section className={styles.panel}>
          <h2>{t('dossier.private.page.visual.identity')}</h2>
          <p>
            {t(
              'dossier.the.logo.and.color.personalize.this.application.without.imitating',
            )}
          </p>
          <form className={styles.brandForm} onSubmit={onSaveBrand}>
            <label>
              {t('dossier.company.logo')}
              <input
                defaultValue={application.logoUrl ?? ''}
                name="logoUrl"
                placeholder="https://…"
                type="url"
              />
            </label>
            <label>
              {t('dossier.accessible.primary.color')}
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
          {brandState === 'saved' ? (
            <p className={styles.statusMessage} role="status">
              {t('dossier.identity.saved.for.the.next.run')}
            </p>
          ) : null}
          {brandState === 'error' ? (
            <p className={styles.error} role="alert">
              {t('dossier.identity.could.not.be.saved.check.the.url.and')}
            </p>
          ) : null}
        </section>
      </div>
      {error ? (
        <p role="alert">
          {workflowErrorLabel(t, error)}
          {error === 'worker-unavailable' ? (
            <>
              {' '}
              <Link href="/settings/models">
                {t('dossier.check.worker.availability')}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      <footer className={styles.actionBar}>
        <span>
          {t('dossier.no.run.yet.the.button.starts.a.bounded.persisted')}
        </span>
        <Button disabled={loading || starting} onClick={onStart}>
          <Icon>bolt</Icon>
          {starting
            ? t('dossier.starting.workflow')
            : t('dossier.start.agent.workflow')}
        </Button>
      </footer>
    </div>
  );
}

type Run = NonNullable<ReturnType<typeof useApplicationWorkflow>['run']>;

function RunningScreen({ run }: { run: Run }) {
  const { locale } = useI18n();
  const t = useTranslations([dossierMessages, activeRoutesMessages]);
  const completed = run.steps.filter(
    (step) => step.status === 'completed',
  ).length;
  const percent = run.steps.length
    ? Math.round((completed / run.steps.length) * 100)
    : 5;
  return (
    <div aria-live="polite" className={styles.flow}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>{run.runId.slice(0, 8)}</p>
        <h1>
          {run.status === 'running'
            ? runStageLabel(run.stage, locale)
            : runStatusLabel(run.status, locale)}
        </h1>
        <p>{runStageLabel(run.stage, locale)}</p>
        <div
          aria-label={`${percent}%`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percent}
          className={styles.progress}
          role="progressbar"
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      </header>
      <div className={styles.runGrid}>
        <section className={styles.runPanel}>
          <div className={styles.runHeader}>
            <h2>{t('active-routes.progress')}</h2>
            <Badge tone={runStatusTone(run.status)}>
              {runStatusLabel(run.status, locale)}
            </Badge>
          </div>
          <ol className={styles.stepList}>
            {run.steps.map((step) => (
              <li className={styles.step} key={`${step.stage}-${step.attempt}`}>
                <Icon>
                  {step.status === 'completed' ? 'check_circle' : 'pending'}
                </Icon>
                <span>
                  <strong>{runStageLabel(step.stage, locale)}</strong>
                  <small>{stepStatusLabel(step.status, locale)}</small>
                </span>
              </li>
            ))}
          </ol>
        </section>
        <section className={styles.runPanel}>
          <h2>{t('dossier.readable.log')}</h2>
          <div className={styles.eventList}>
            {run.events.slice(-6).map((event, index) => (
              <article className={styles.event} key={`${event.type}-${index}`}>
                <Icon>notes</Icon>
                <span>
                  <strong>{actorLabel(event.actor, locale)}</strong>
                  <small>{event.summary}</small>
                </span>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function RunSummary({
  application,
  run,
}: {
  application: Application;
  run: Run;
}) {
  const { locale } = useI18n();
  const t = useTranslations([dossierMessages]);
  const decisions = new Set(
    run.reviewDecisions.map(
      (decision) => `${decision.reviewId}:${decision.issueIndex}`,
    ),
  );
  const issueCount = run.reviews.reduce(
    (count, review) => count + review.issues.length,
    0,
  );
  const unresolved = Math.max(0, issueCount - decisions.size);
  const sourced =
    run.evidenceArchive?.signals.filter(
      (signal) => signal.coverage === 'verified_candidate',
    ).length ?? 0;
  return (
    <div className={styles.flow}>
      <section className={styles.summaryPanel}>
        <div className={styles.summaryHeader}>
          <div>
            <p className={styles.eyebrow}>
              {runStatusLabel(run.status, locale)}
            </p>
            <h1>
              {unresolved
                ? locale === 'en'
                  ? `${unresolved} decision${unresolved === 1 ? '' : 's'} await you`
                  : `${unresolved} décision${unresolved === 1 ? '' : 's'} vous attend${unresolved === 1 ? '' : 'ent'}`
                : locale === 'en'
                  ? 'The run is ready for your final review'
                  : 'Le run est prêt pour votre validation finale'}
            </h1>
          </div>
          {unresolved ? (
            <Link
              className="co-button"
              href={`/applications/${application.applicationId}/review`}
            >
              {t('dossier.needs.review')}
            </Link>
          ) : run.spec ? (
            <Link
              className="co-button"
              href={`/applications/${application.applicationId}/page`}
            >
              {t('dossier.review.the.draft.before.the.checks')}
            </Link>
          ) : null}
        </div>
        <div className={styles.summaryMetrics}>
          <div className={styles.metric}>
            <span>
              <strong>{sourced}</strong>
              <small>
                {t(
                  'dossier.all.checks.are.resolved.ready.for.your.final.approval',
                )}
              </small>
            </span>
          </div>
          <div className={styles.metric}>
            <span>
              <strong>{unresolved}</strong>
              <small>{t('dossier.needs.review')}</small>
            </span>
          </div>
          <div className={styles.metric}>
            <span>
              <strong>{run.events.length}</strong>
              <small>{t('dossier.persisted.events')}</small>
            </span>
          </div>
        </div>
      </section>
      {run.research && run.strategy ? (
        <ApplicationKitPanel
          company={application.company}
          profile={run.profile}
          spec={run.spec}
          research={run.research}
          role={application.role}
          strategy={run.strategy}
        />
      ) : null}
      {run.publicationEligible ? (
        <footer className={styles.actionBar}>
          <span>{t('dossier.no.link.is.created.without.this.action')}</span>
          <Link
            className="co-button"
            href={`/applications/${application.applicationId}/page`}
          >
            {t('dossier.final.human.approval')}
          </Link>
        </footer>
      ) : null}
    </div>
  );
}
