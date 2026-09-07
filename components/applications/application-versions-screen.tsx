'use client';

import { useI18n } from '@/components/i18n/i18n-provider';
import { DossierShell } from '@/components/layout/dossier-shell';
import { Badge, Icon, PageHeader } from '@/components/ui/primitives';
import {
  type Application,
  applicationSchema,
} from '@/lib/application-contract';
import {
  readApplication,
  readApplicationRun,
  readOpportunityDecisions,
  readPublications,
} from '@/lib/career-api';
import {
  type OpportunityDecision,
  opportunityDecisionListResponseSchema,
} from '@/lib/opportunity-decision';
import { persistedRunSchema } from '@/lib/run-contract';
import {
  type PublicationSummary,
  publicationSummarySchema,
} from '@/lib/server/publication-input';
import { useEffect, useState } from 'react';

export function VersionsScreen({ applicationId }: { applicationId: string }) {
  const { locale } = useI18n();
  const [application, setApplication] = useState<Application>();
  const [publications, setPublications] = useState<PublicationSummary[]>([]);
  const [decision, setDecision] = useState<OpportunityDecision>();
  const [run, setRun] = useState<ReturnType<typeof persistedRunSchema.parse>>();
  const [selectedPublicationId, setSelectedPublicationId] = useState<string>();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      readApplication(applicationId, controller.signal),
      readPublications(controller.signal),
      readApplicationRun(applicationId, controller.signal),
      readOpportunityDecisions(controller.signal),
    ])
      .then(
        async ([
          applicationResponse,
          publicationResponse,
          runResponse,
          decisionResponse,
        ]) => {
          if (
            !applicationResponse.ok ||
            !publicationResponse.ok ||
            !runResponse.ok ||
            !decisionResponse.ok
          )
            throw new Error();
          const nextApplication = applicationSchema.parse(
            await applicationResponse.json(),
          );
          const publicationPayload = (await publicationResponse.json()) as {
            publications?: unknown;
          };
          const nextPublications = publicationSummarySchema
            .array()
            .parse(publicationPayload.publications ?? [])
            .filter((item) => item.applicationId === applicationId)
            .sort((left, right) => right.version - left.version);
          const decisionPayload = opportunityDecisionListResponseSchema.parse(
            await decisionResponse.json(),
          );
          const nextRun =
            runResponse.status === 204
              ? undefined
              : persistedRunSchema.parse(await runResponse.json());
          setApplication(nextApplication);
          setPublications(nextPublications);
          setSelectedPublicationId(
            nextPublications.find((item) => item.isCurrent)?.publicationId ??
              nextPublications[0]?.publicationId,
          );
          setDecision(
            decisionPayload.decisions.find(
              (item) => item.opportunityId === nextApplication.discoveredJobId,
            ),
          );
          setRun(nextRun);
          setState('ready');
        },
      )
      .catch(() => {
        if (!controller.signal.aborted) setState('error');
      });
    return () => controller.abort();
  }, [applicationId]);

  const selectedPublication = publications.find(
    (item) => item.publicationId === selectedPublicationId,
  );
  const reviewDecisions = (run?.reviewDecisions ?? []).map((item) => {
    const review = run?.reviews.find(
      (candidate) => candidate.reviewId === item.reviewId,
    );
    return {
      ...item,
      reviewer: review?.reviewer,
      issue: review?.issues[item.issueIndex],
    };
  });
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  const copy =
    locale === 'fr'
      ? {
          title: 'Historique des versions et décisions',
          intro:
            'Les publications et arbitrages réellement enregistrés pour cette candidature.',
          versions: 'Versions publiées',
          noVersions: 'Aucune version publiée.',
          current: 'actuelle',
          publication: 'Publication',
          published: 'Publiée',
          status: 'Statut',
          usage: 'Usage anonyme',
          opens: 'ouvertures',
          sections: 'sections',
          actions: 'actions',
          downloads: 'téléchargements',
          decisions: 'Décisions humaines',
          noDecisions: 'Aucune décision humaine enregistrée.',
          opportunity: 'Qualification de l’opportunité',
          review: 'Arbitrage de review',
          dossier: 'Dossier',
          created: 'Créé',
          updated: 'Mis à jour',
          revision: 'Révision',
          loading: 'Chargement de l’historique…',
          error: 'L’historique ne peut pas être chargé.',
        }
      : {
          title: 'Version and decision history',
          intro:
            'The publications and human decisions actually recorded for this application.',
          versions: 'Published versions',
          noVersions: 'No published version yet.',
          current: 'current',
          publication: 'Publication',
          published: 'Published',
          status: 'Status',
          usage: 'Anonymous usage',
          opens: 'opens',
          sections: 'sections',
          actions: 'actions',
          downloads: 'downloads',
          decisions: 'Human decisions',
          noDecisions: 'No human decision has been recorded.',
          opportunity: 'Opportunity qualification',
          review: 'Review decision',
          dossier: 'Application record',
          created: 'Created',
          updated: 'Updated',
          revision: 'Revision',
          loading: 'Loading history…',
          error: 'History could not be loaded.',
        };

  return (
    <DossierShell
      active="versions"
      identity={
        application
          ? {
              applicationId: application.applicationId,
              company: application.company,
              role: application.role,
            }
          : { applicationId, company: 'Career OS', role: copy.dossier }
      }
      state={
        selectedPublication ? (
          <Badge tone="ok">
            v{selectedPublication.version} ·{' '}
            {publicationStatus(selectedPublication.status, locale)}
          </Badge>
        ) : (
          <Badge>
            {copy.revision} {application?.revision ?? '—'}
          </Badge>
        )
      }
    >
      <div className="co-versions">
        <aside>
          <h2>{copy.versions}</h2>
          {publications.map((publication) => (
            <button
              aria-pressed={publication.publicationId === selectedPublicationId}
              className={
                publication.publicationId === selectedPublicationId
                  ? 'active'
                  : ''
              }
              key={publication.publicationId}
              onClick={() =>
                setSelectedPublicationId(publication.publicationId)
              }
              type="button"
            >
              <strong>v{publication.version}</strong>
              <span>{publicationStatus(publication.status, locale)}</span>
              <small>
                {publication.isCurrent
                  ? copy.current
                  : formatDate(publication.publishedAt)}
              </small>
            </button>
          ))}
          {state === 'ready' && !publications.length ? (
            <p>{copy.noVersions}</p>
          ) : null}
        </aside>
        <section>
          <PageHeader
            eyebrow={application?.company ?? copy.dossier}
            title={copy.title}
            copy={copy.intro}
          />
          {state === 'loading' ? <p>{copy.loading}</p> : null}
          {state === 'error' ? (
            <p className="co-error" role="alert">
              {copy.error}
            </p>
          ) : null}
          {application ? (
            <article className="co-version-change co-history-record">
              <header>
                <Icon>description</Icon>
                <div>
                  <small>{copy.dossier}</small>
                  <h2>
                    {application.company} · {application.role}
                  </h2>
                </div>
                <Badge>
                  {copy.revision} {application.revision}
                </Badge>
              </header>
              <dl>
                <div>
                  <dt>{copy.created}</dt>
                  <dd>{formatDate(application.createdAt)}</dd>
                </div>
                <div>
                  <dt>{copy.updated}</dt>
                  <dd>{formatDate(application.updatedAt)}</dd>
                </div>
              </dl>
            </article>
          ) : null}
          {selectedPublication ? (
            <article className="co-version-change co-history-record">
              <header>
                <Icon>public</Icon>
                <div>
                  <small>{copy.publication}</small>
                  <h2>v{selectedPublication.version}</h2>
                </div>
                <Badge
                  tone={
                    selectedPublication.status === 'active' ? 'ok' : 'muted'
                  }
                >
                  {publicationStatus(selectedPublication.status, locale)}
                </Badge>
              </header>
              <dl>
                <div>
                  <dt>{copy.published}</dt>
                  <dd>{formatDate(selectedPublication.publishedAt)}</dd>
                </div>
                <div>
                  <dt>{copy.status}</dt>
                  <dd>
                    {publicationStatus(selectedPublication.status, locale)}
                  </dd>
                </div>
              </dl>
              <p>
                {copy.usage} · {selectedPublication.opens} {copy.opens} ·{' '}
                {selectedPublication.sections} {copy.sections} ·{' '}
                {selectedPublication.actions} {copy.actions} ·{' '}
                {selectedPublication.downloads} {copy.downloads}
              </p>
            </article>
          ) : null}
          <section className="co-history-decisions">
            <h2>{copy.decisions}</h2>
            {decision?.history.map((event) => (
              <article key={event.eventId}>
                <Icon>rule</Icon>
                <div>
                  <small>
                    {copy.opportunity} · r{event.revision}
                  </small>
                  <strong>
                    {opportunityDecisionLabel(event.qualification, locale)} ·{' '}
                    {opportunityDecisionLabel(event.disposition, locale)}
                  </strong>
                  <p>
                    {event.note ??
                      opportunityDecisionLabel(event.reason, locale)}
                  </p>
                </div>
                <time dateTime={event.createdAt}>
                  {formatDate(event.createdAt)}
                </time>
              </article>
            ))}
            {reviewDecisions.map((item) => (
              <article key={`${item.reviewId}:${item.issueIndex}`}>
                <Icon>{item.decision === 'keep' ? 'done' : 'edit'}</Icon>
                <div>
                  <small>
                    {copy.review} ·{' '}
                    {reviewerLabel(item.reviewer ?? 'review', locale)}
                  </small>
                  <strong>{reviewDecisionLabel(item.decision, locale)}</strong>
                  <p>{item.issue?.message ?? item.reviewId}</p>
                </div>
                <span>r{run?.revision ?? 0}</span>
              </article>
            ))}
            {state === 'ready' &&
            !decision?.history.length &&
            !reviewDecisions.length ? (
              <p>{copy.noDecisions}</p>
            ) : null}
          </section>
        </section>
      </div>
    </DossierShell>
  );
}

export function publicationStatus(
  status: PublicationSummary['status'],
  locale: 'en' | 'fr',
) {
  return {
    active: locale === 'en' ? 'active' : 'active',
    expired: locale === 'en' ? 'expired' : 'expirée',
    revoked: locale === 'en' ? 'revoked' : 'révoquée',
  }[status];
}

export function opportunityDecisionLabel(value: string, locale: 'en' | 'fr') {
  if (locale === 'en')
    return value
      .split('_')
      .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
      .join(' ');
  return (
    {
      saved: 'Conservée',
      ignored: 'Ignorée',
      archived: 'Archivée',
      priority: 'Prioritaire',
      interesting: 'Intéressante',
      exploratory: 'Exploratoire',
      ignore: 'À ignorer',
      strong_fit: 'Adéquation forte',
      career_direction: 'Direction de carrière',
      hard_constraint: 'Contrainte obligatoire',
      weak_evidence: 'Preuves insuffisantes',
      compensation: 'Rémunération',
      location: 'Localisation',
      company: 'Entreprise',
      duplicate: 'Doublon',
      closed: 'Offre fermée',
      other: 'Autre raison',
    }[value] ?? value
  );
}

export function reviewDecisionLabel(
  value: 'keep' | 'correct',
  locale: 'en' | 'fr',
) {
  if (locale === 'en') return value === 'keep' ? 'Kept' : 'Corrected';
  return value === 'keep' ? 'Conservée' : 'Corrigée';
}

export function reviewerLabel(value: string, locale: 'en' | 'fr') {
  if (locale === 'en')
    return value === 'hiring-manager' ? 'Hiring manager' : value;
  return (
    {
      recruiter: 'Recruteur',
      'hiring-manager': 'Hiring manager',
      factuality: 'Factuel',
      review: 'Review',
    }[value] ?? value
  );
}
