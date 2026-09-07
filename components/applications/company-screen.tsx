'use client';

import { runSources } from '@/components/applications/workflow-labels';
import { useI18n } from '@/components/i18n/i18n-provider';
import { DossierShell } from '@/components/layout/dossier-shell';
import { Badge, ClaimRow, Icon, PageHeader } from '@/components/ui/primitives';
import {
  type Application,
  applicationSchema,
} from '@/lib/application-contract';
import { readApplication, readApplicationRun } from '@/lib/career-api';
import { type PersistedRun, persistedRunSchema } from '@/lib/run-contract';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export function CompanyScreen({ applicationId }: { applicationId: string }) {
  const { locale } = useI18n();
  const [result, setResult] = useState<{
    applicationId: string;
    application?: Application;
    run?: PersistedRun;
    error?: 'auth' | 'missing' | 'unavailable';
  }>();

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      readApplication(applicationId, controller.signal),
      readApplicationRun(applicationId, controller.signal),
    ])
      .then(async ([applicationResponse, runResponse]) => {
        if (applicationResponse.status === 401 || runResponse.status === 401)
          return setResult({ applicationId, error: 'auth' });
        if (applicationResponse.status === 404)
          return setResult({ applicationId, error: 'missing' });
        if (
          !applicationResponse.ok ||
          (!runResponse.ok && runResponse.status !== 204)
        )
          return setResult({ applicationId, error: 'unavailable' });
        const application = applicationSchema.safeParse(
          await applicationResponse.json(),
        );
        const run =
          runResponse.status === 204
            ? undefined
            : persistedRunSchema.safeParse(await runResponse.json());
        if (!application.success || (run && !run.success))
          return setResult({ applicationId, error: 'unavailable' });
        setResult({
          applicationId,
          application: application.data,
          ...(run ? { run: run.data } : {}),
        });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException) || error.name !== 'AbortError')
          setResult({ applicationId, error: 'unavailable' });
      });
    return () => controller.abort();
  }, [applicationId]);

  const current = result?.applicationId === applicationId ? result : undefined;
  const application = current?.application;
  const research = current?.run?.research;
  const copy =
    locale === 'fr'
      ? {
          loading: 'Chargement du dossier entreprise…',
          auth: 'Connectez-vous pour ouvrir ce dossier.',
          missing: 'Cette candidature est introuvable.',
          unavailable: 'Impossible de charger le dossier entreprise.',
          title: 'Dossier entreprise',
          openWorkflow: 'Ouvrir le workflow',
          summary: 'Signal principal',
          signals: 'Signaux datés et sourcés',
          sources: 'Sources retenues',
          noResearch: 'La recherche entreprise n’est pas encore disponible.',
          noResearchDetail:
            'Démarrez ou poursuivez le workflow depuis le brief de candidature.',
          publicOnly: 'Sources publiques seules',
          publicOnlyDetail:
            'Les signaux ci-dessous proviennent uniquement de l’offre et des pages publiques enregistrées avec cette candidature.',
          excerpt: 'Extrait source',
          applicationSnapshot: 'Offre enregistrée',
        }
      : {
          loading: 'Loading company research…',
          auth: 'Sign in to open this application.',
          missing: 'This application could not be found.',
          unavailable: 'Company research could not be loaded.',
          title: 'Company brief',
          openWorkflow: 'Open workflow',
          summary: 'Primary signal',
          signals: 'Dated, sourced signals',
          sources: 'Selected sources',
          noResearch: 'Company research is not available yet.',
          noResearchDetail:
            'Start or continue the workflow from the application brief.',
          publicOnly: 'Public sources only',
          publicOnlyDetail:
            'The signals below come only from the job posting and public pages saved with this application.',
          excerpt: 'Source excerpt',
          applicationSnapshot: 'Saved job posting',
        };
  const identity = application
    ? { applicationId, company: application.company, role: application.role }
    : {
        applicationId,
        company: locale === 'fr' ? 'Candidature' : 'Application',
        role: copy.loading,
      };
  const sources =
    application && current?.run ? runSources(application, current.run) : [];
  const sourceById = new Map(
    research && 'sources' in research
      ? research.sources.map((source) => [
          source.sourceId,
          'finalUrl' in source
            ? source.finalUrl
            : (application?.url ?? copy.applicationSnapshot),
        ])
      : [],
  );
  const errorMessage = current?.error
    ? {
        auth: copy.auth,
        missing: copy.missing,
        unavailable: copy.unavailable,
      }[current.error]
    : copy.loading;

  return (
    <DossierShell
      actions={
        application ? (
          <Link
            className="co-button quiet"
            href={`/applications/${applicationId}`}
          >
            {copy.openWorkflow}
          </Link>
        ) : null
      }
      active="company"
      identity={identity}
      state={
        research ? (
          <Badge tone="ok">
            {research.signals.length}{' '}
            {locale === 'fr' ? 'signaux sourcés' : 'sourced signals'}
          </Badge>
        ) : undefined
      }
    >
      <div className="co-dossier-content">
        <section className="co-main-column">
          {application ? (
            <PageHeader
              eyebrow={application.company}
              title={copy.title}
              copy={application.role}
            />
          ) : null}
          {!application || !research ? (
            <section className="co-panel co-live-dossier-state">
              <h1>{application ? copy.noResearch : errorMessage}</h1>
              {application ? <p>{copy.noResearchDetail}</p> : null}
            </section>
          ) : (
            <>
              <section className="co-panel co-company-summary">
                <p>{copy.summary}</p>
                <h2>{research.signals[0].statement}</h2>
              </section>
              <section className="co-panel">
                <h2>{copy.signals}</h2>
                {research.signals.map((signal) => (
                  <ClaimRow
                    key={signal.signalId}
                    label={`${signal.priority} · ${signal.category}`}
                    source={
                      'sourceId' in signal
                        ? (sourceById.get(signal.sourceId) ?? signal.sourceId)
                        : (research.source.url ?? copy.applicationSnapshot)
                    }
                    text={signal.statement}
                    tone={
                      signal.priority === 'high'
                        ? 'warn'
                        : signal.priority === 'medium'
                          ? 'accent'
                          : 'muted'
                    }
                  />
                ))}
              </section>
              <section className="co-panel co-company-context">
                <h2>{copy.excerpt}</h2>
                {research.signals.map((signal) => (
                  <p key={signal.signalId}>
                    <Icon>format_quote</Icon>
                    {signal.excerpt}
                  </p>
                ))}
              </section>
            </>
          )}
        </section>
        <aside className="co-stack co-company-sources">
          <h2>{copy.sources}</h2>
          {sources.map((source) => (
            <a href={source} key={source} rel="noreferrer" target="_blank">
              <Icon>public</Icon>
              <span>
                <strong>{new URL(source).hostname}</strong>
                <small>{source}</small>
              </span>
              <Icon>north_east</Icon>
            </a>
          ))}
          {!sources.length ? <p>{copy.noResearch}</p> : null}
          <div className="co-company-public-only">
            <strong>
              <Icon>shield</Icon>
              {copy.publicOnly}
            </strong>
            <p>{copy.publicOnlyDetail}</p>
          </div>
        </aside>
      </div>
    </DossierShell>
  );
}
