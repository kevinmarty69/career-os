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
import { useI18n } from '@/components/i18n/i18n-provider';
import { AppShell } from '@/components/layout/app-shell';
import { Badge, Company, Icon, PageHeader } from '@/components/ui/primitives';
import { initials } from '@/lib/initials';
import Link from 'next/link';

export function RunsScreen() {
  const { locale } = useI18n();
  const { dashboard, error } = useWorkflowDashboard();
  const items = dashboard?.items.filter(({ run }) => run) ?? [];
  const failed = items.filter(({ run }) =>
    ['blocked', 'budget_exhausted', 'failed'].includes(run!.status),
  ).length;
  const copy =
    locale === 'fr'
      ? {
          title: 'Journal des agents',
          intro: dashboard
            ? `${items.length} run${items.length > 1 ? 's' : ''} persisté${items.length > 1 ? 's' : ''}, ${failed} en erreur ou bloqué${failed > 1 ? 's' : ''}.`
            : 'Chargement des runs persistés…',
          empty:
            'Aucun run enregistré. Lancez une candidature pour créer le premier journal.',
          unavailable: 'Le journal est momentanément indisponible.',
          signIn: 'Connectez-vous pour consulter les runs de votre workspace.',
          stage: 'Étape active',
          cost: 'Coût enregistré',
          tokens: 'Tokens utilisés',
          sources: 'Sources',
          steps: 'Étapes',
          events: 'Décisions et événements',
          errors: 'Erreurs',
          noSteps: 'Aucune étape enregistrée.',
          noEvents: 'Aucun événement enregistré.',
          noSources: 'Aucune source externe enregistrée.',
          noErrors: 'Aucune erreur enregistrée.',
          humanDecision: 'décision humaine',
          humanDecisions: 'décisions humaines',
          open: 'Ouvrir la candidature',
        }
      : {
          title: 'Agent run journal',
          intro: dashboard
            ? `${items.length} persisted ${items.length === 1 ? 'run' : 'runs'}, ${failed} failed or blocked.`
            : 'Loading persisted runs…',
          empty:
            'No run recorded. Start an application to create the first journal.',
          unavailable: 'The run journal is temporarily unavailable.',
          signIn: 'Sign in to review the runs in your workspace.',
          stage: 'Active stage',
          cost: 'Recorded cost',
          tokens: 'Tokens used',
          sources: 'Sources',
          steps: 'Steps',
          events: 'Decisions and events',
          errors: 'Errors',
          noSteps: 'No step recorded.',
          noEvents: 'No event recorded.',
          noSources: 'No external source recorded.',
          noErrors: 'No error recorded.',
          humanDecision: 'human decision',
          humanDecisions: 'human decisions',
          open: 'Open application',
        };
  return (
    <AppShell path="/runs">
      <PageHeader title={copy.title} copy={copy.intro} />
      {error ? (
        <div className="co-note" role="alert">
          <Icon>cloud_off</Icon>
          {error === 'auth' ? copy.signIn : copy.unavailable}
        </div>
      ) : null}
      {dashboard && !error && !items.length ? (
        <div className="co-note">
          <Icon>history</Icon>
          {copy.empty}
        </div>
      ) : null}
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
                  <dt>{copy.stage}</dt>
                  <dd>{runStageLabel(run!.stage, locale)}</dd>
                </div>
                <div>
                  <dt>{copy.cost}</dt>
                  <dd>€{(run!.usedCostMicros / 1_000_000).toFixed(2)}</dd>
                </div>
                <div>
                  <dt>{copy.tokens}</dt>
                  <dd>{run!.usedTokens.toLocaleString(locale)}</dd>
                </div>
                <div>
                  <dt>{copy.sources}</dt>
                  <dd>{sources.length}</dd>
                </div>
              </dl>
              <div className="co-run-journal">
                <section>
                  <h3>{copy.steps}</h3>
                  {run!.steps.length ? (
                    run!.steps.map((step) => (
                      <article key={`${step.stage}-${step.attempt}`}>
                        <Icon>{stepIcon(step.status)}</Icon>
                        <span>
                          <strong>{runStageLabel(step.stage, locale)}</strong>
                          <small>
                            {stepStatusLabel(step.status, locale)} ·{' '}
                            {attemptLabel(step.attempt, locale)}
                          </small>
                        </span>
                      </article>
                    ))
                  ) : (
                    <p>{copy.noSteps}</p>
                  )}
                </section>
                <section>
                  <h3>{copy.events}</h3>
                  {run!.events.length ? (
                    run!.events.slice(-6).map((event, index) => (
                      <article key={`${event.type}-${index}`}>
                        <Icon>notes</Icon>
                        <span>
                          <strong>{actorLabel(event.actor, locale)}</strong>
                          <small>{event.summary}</small>
                        </span>
                      </article>
                    ))
                  ) : (
                    <p>{copy.noEvents}</p>
                  )}
                  {run!.reviewDecisions.length ? (
                    <p>
                      {run!.reviewDecisions.length}{' '}
                      {run!.reviewDecisions.length === 1
                        ? copy.humanDecision
                        : copy.humanDecisions}
                    </p>
                  ) : null}
                </section>
                <section>
                  <h3>{copy.sources}</h3>
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
                    <p>{copy.noSources}</p>
                  )}
                </section>
                <section>
                  <h3>{copy.errors}</h3>
                  {failures.length ? (
                    failures.map((step) => (
                      <article key={`${step.stage}-${step.attempt}`}>
                        <Icon>error</Icon>
                        <span>
                          <strong>{runStageLabel(step.stage, locale)}</strong>
                          <small>
                            {step.failureCode ??
                              stepStatusLabel(step.status, locale)}
                          </small>
                        </span>
                      </article>
                    ))
                  ) : (
                    <p>{copy.noErrors}</p>
                  )}
                </section>
              </div>
              <footer>
                <Link
                  className="co-button quiet"
                  href={`/applications/${application.applicationId}`}
                >
                  {copy.open}
                </Link>
              </footer>
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}
