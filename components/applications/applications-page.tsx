'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import {
  applicationSchema,
  type Application,
} from '@/lib/application-contract';
import {
  importOpportunity,
  readApplications,
  readOpportunities,
} from '@/lib/career-api';
import {
  opportunityImportResponseSchema,
  opportunityListResponseSchema,
  type DiscoveredJob,
} from '@/lib/discovered-job-contract';
import styles from './applications-page.module.css';

type LoadState = 'loading' | 'ready' | 'error';
type IconComponent = ComponentType<{ children: string }>;
type ShellComponent = ComponentType<{
  path: string;
  children: ReactNode;
  sidebarContext?: ReactNode;
  sidebarFooter?: ReactNode;
}>;

export function ApplicationsPage({
  AppShell,
  Icon,
}: {
  AppShell: ShellComponent;
  Icon: IconComponent;
}) {
  const [opportunities, setOpportunities] = useState<DiscoveredJob[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string>();
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    const controller = signal ? undefined : new AbortController();
    const activeSignal = signal ?? controller!.signal;
    try {
      const [opportunityResponse, applicationResponse] = await Promise.all([
        readOpportunities(activeSignal),
        readApplications(activeSignal),
      ]);
      if (!opportunityResponse.ok || !applicationResponse.ok)
        throw new Error(
          opportunityResponse.status === 401 ||
            applicationResponse.status === 401
            ? 'Connectez-vous pour retrouver vos opportunités et candidatures.'
            : 'Impossible de charger cet espace.',
        );
      const opportunityPayload = opportunityListResponseSchema.parse(
        await opportunityResponse.json(),
      );
      const applicationPayload: unknown = await applicationResponse.json();
      const parsedApplications = applicationSchema
        .array()
        .parse(
          typeof applicationPayload === 'object' &&
            applicationPayload !== null &&
            'applications' in applicationPayload
            ? applicationPayload.applications
            : [],
        );
      setOpportunities(opportunityPayload.opportunities);
      setApplications(parsedApplications);
      setLoadState('ready');
    } catch (caught) {
      if (!activeSignal.aborted) {
        setLoadState('error');
        setError(
          caught instanceof Error
            ? caught.message
            : 'Impossible de charger cet espace.',
        );
      }
    }
    return () => controller?.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void load(controller.signal));
    return () => controller.abort();
  }, [load]);

  function imported(opportunity: DiscoveredJob) {
    setOpportunities((current) => [
      opportunity,
      ...current.filter(
        (item) => item.opportunityId !== opportunity.opportunityId,
      ),
    ]);
    setImportOpen(false);
  }

  function retry() {
    setLoadState('loading');
    setError(undefined);
    void load();
  }

  return (
    <AppShell
      path="/applications"
      sidebarContext={
        <div className={styles.sidebarNote}>
          <Icon>source</Icon>
          <strong>Deux états distincts</strong>
          <span>
            Une offre importée reste une opportunité tant que vous ne démarrez
            pas une candidature.
          </span>
        </div>
      }
      sidebarFooter={<></>}
    >
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <p>Pipeline de recherche</p>
            <h1>Candidatures</h1>
            <span>
              Consultez les offres collectées, puis suivez séparément les
              candidatures réellement démarrées.
            </span>
          </div>
          <button
            className="co-button"
            onClick={() => setImportOpen(true)}
            type="button"
          >
            <Icon>add_link</Icon>Coller une offre
          </button>
        </header>

        {error ? (
          <div className={styles.error} role="alert">
            <Icon>error</Icon>
            <span>{error}</span>
            <button onClick={retry} type="button">
              Réessayer
            </button>
          </div>
        ) : null}

        <section
          className={styles.workspace}
          aria-label="Opportunités et candidatures"
        >
          <header className={styles.sectionHeader}>
            <div className={styles.sectionIcon}>
              <Icon>travel_explore</Icon>
            </div>
            <div>
              <h2>Opportunités découvertes</h2>
              <p>
                Des offres conservées avec leur source, pas encore transformées
                en candidature.
              </p>
            </div>
          </header>
          {loadState === 'loading' ? (
            <LoadingRows label="Chargement des opportunités" />
          ) : opportunities.length ? (
            <div className={styles.opportunityList}>
              {opportunities.map((opportunity) => (
                <OpportunityCard
                  Icon={Icon}
                  key={opportunity.opportunityId}
                  opportunity={opportunity}
                />
              ))}
            </div>
          ) : loadState === 'ready' ? (
            <EmptyState
              action="Coller une offre"
              copy="Ajoutez l’URL d’une annonce pour conserver son contenu et sa provenance."
              Icon={Icon}
              icon="link"
              onAction={() => setImportOpen(true)}
              title="Aucune opportunité enregistrée"
            />
          ) : null}
        </section>

        <section
          className={styles.workspace}
          aria-label="Candidatures démarrées"
        >
          <header className={styles.sectionHeader}>
            <div className={`${styles.sectionIcon} ${styles.applicationIcon}`}>
              <Icon>work_history</Icon>
            </div>
            <div>
              <h2>Candidatures</h2>
              <p>
                Uniquement les dossiers que vous avez choisi de préparer ou
                d’envoyer.
              </p>
            </div>
          </header>
          {loadState === 'loading' ? (
            <LoadingRows label="Chargement des candidatures" />
          ) : applications.length ? (
            <div className={styles.applicationList}>
              {applications.map((application) => (
                <ApplicationRow
                  Icon={Icon}
                  application={application}
                  key={application.applicationId}
                />
              ))}
            </div>
          ) : loadState === 'ready' ? (
            <EmptyState
              copy="Aucun dossier n’a encore été démarré. Vos opportunités restent disponibles au-dessus."
              Icon={Icon}
              icon="work_outline"
              title="Aucune candidature en cours"
            />
          ) : null}
        </section>
      </div>
      {importOpen ? (
        <ImportDialog
          Icon={Icon}
          onClose={() => setImportOpen(false)}
          onImported={imported}
        />
      ) : null}
    </AppShell>
  );
}

function OpportunityCard({
  Icon,
  opportunity,
}: {
  Icon: IconComponent;
  opportunity: DiscoveredJob;
}) {
  const source = opportunity.sources[0];
  return (
    <article className={styles.opportunityCard}>
      <div className={styles.companyMark} aria-hidden="true">
        {initials(opportunity.company ?? opportunity.role ?? 'Offre')}
      </div>
      <div className={styles.opportunityBody}>
        <small>{opportunity.company ?? 'Entreprise non identifiée'}</small>
        <h3>{opportunity.role ?? 'Rôle à confirmer'}</h3>
        <a href={opportunity.sourceUrl} rel="noreferrer" target="_blank">
          <Icon>open_in_new</Icon>Voir l’offre d’origine
        </a>
        <details>
          <summary>
            <Icon>verified</Icon>Provenance · {opportunity.sources.length}{' '}
            {opportunity.sources.length > 1 ? 'sources' : 'source'}
          </summary>
          <dl>
            <div>
              <dt>URL demandée</dt>
              <dd>
                <a href={source.requestedUrl} rel="noreferrer" target="_blank">
                  {host(source.requestedUrl)}
                </a>
              </dd>
            </div>
            <div>
              <dt>URL finale</dt>
              <dd>
                <a href={source.finalUrl} rel="noreferrer" target="_blank">
                  {host(source.finalUrl)}
                </a>
              </dd>
            </div>
            <div>
              <dt>Consultée</dt>
              <dd>{formatDate(source.fetchedAt)}</dd>
            </div>
            <div>
              <dt>Empreinte</dt>
              <dd>
                <code>{source.sha256.slice(0, 12)}…</code>
              </dd>
            </div>
          </dl>
        </details>
      </div>
      <div className={styles.opportunityActions}>
        <span>Découverte {formatDate(opportunity.firstSeenAt)}</span>
        <button
          disabled
          title="La promotion vers une candidature sera ajoutée dans une prochaine tranche."
          type="button"
        >
          Démarrer la candidature
        </button>
        <small>Disponible prochainement</small>
      </div>
    </article>
  );
}

function ApplicationRow({
  Icon,
  application,
}: {
  Icon: IconComponent;
  application: Application;
}) {
  const stage = {
    draft: 'Brouillon',
    applied: 'Envoyée',
    interview: 'Entretien',
    offer: 'Offre reçue',
    closed: 'Clôturée',
  }[application.stage];
  return (
    <Link
      className={styles.applicationRow}
      href={`/applications/${application.applicationId}`}
    >
      <div className={styles.companyMark} aria-hidden="true">
        {initials(application.company)}
      </div>
      <div>
        <small>{application.company}</small>
        <strong>{application.role}</strong>
      </div>
      <span className={styles.stage}>{stage}</span>
      <time dateTime={application.updatedAt}>
        {formatDate(application.updatedAt)}
      </time>
      <Icon>chevron_right</Icon>
    </Link>
  );
}

function ImportDialog({
  Icon,
  onClose,
  onImported,
}: {
  Icon: IconComponent;
  onClose: () => void;
  onImported: (opportunity: DiscoveredJob) => void;
}) {
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose, submitting]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const controller = new AbortController();
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await importOpportunity(url, controller.signal);
      if (!response.ok) throw new Error(importError(response.status));
      const imported = opportunityImportResponseSchema.parse(
        await response.json(),
      );
      onImported(imported.opportunity);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import impossible.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={styles.scrim}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="import-title"
        aria-modal="true"
        className={styles.dialog}
        role="dialog"
      >
        <header>
          <span>
            <Icon>add_link</Icon>
          </span>
          <div>
            <p>Nouvelle opportunité</p>
            <h2 id="import-title">Coller une offre</h2>
          </div>
          <button
            aria-label="Fermer"
            disabled={submitting}
            onClick={onClose}
            type="button"
          >
            <Icon>close</Icon>
          </button>
        </header>
        <form onSubmit={submit}>
          <label>
            <span>URL de l’annonce</span>
            <input
              autoFocus
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…"
              required
              type="url"
              value={url}
            />
          </label>
          <p>
            L’annonce sera lue puis enregistrée avec son URL finale, sa date de
            consultation et son empreinte.
          </p>
          {error ? (
            <div className={styles.dialogError} role="alert">
              <Icon>error</Icon>
              {error}
            </div>
          ) : null}
          <footer>
            <button
              className="co-button quiet"
              disabled={submitting}
              onClick={onClose}
              type="button"
            >
              Annuler
            </button>
            <button
              className="co-button"
              disabled={submitting || !url.trim()}
              type="submit"
            >
              {submitting ? 'Lecture de l’offre…' : 'Importer l’offre'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function EmptyState({
  Icon,
  title,
  copy,
  icon,
  action,
  onAction,
}: {
  Icon: IconComponent;
  title: string;
  copy: string;
  icon: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className={styles.empty}>
      <span>
        <Icon>{icon}</Icon>
      </span>
      <div>
        <h3>{title}</h3>
        <p>{copy}</p>
      </div>
      {action && onAction ? (
        <button className="co-button quiet" onClick={onAction} type="button">
          {action}
        </button>
      ) : null}
    </div>
  );
}

function LoadingRows({ label }: { label: string }) {
  return (
    <div
      aria-label={label}
      aria-live="polite"
      className={styles.loading}
      role="status"
    >
      <span />
      <span />
      <span />
    </div>
  );
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

function host(url: string) {
  return new URL(url).hostname.replace(/^www\./, '');
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function importError(status: number) {
  if (status === 400) return 'Cette URL ne peut pas être consultée.';
  if (status === 413) return 'La page de l’offre est trop volumineuse.';
  if (status === 415)
    return 'Le format de cette page n’est pas pris en charge.';
  if (status === 422)
    return 'Aucune offre exploitable n’a été trouvée à cette URL.';
  if (status === 429) return 'Trop de tentatives. Réessayez dans une minute.';
  if (status === 504) return 'La page distante ne répond pas assez vite.';
  return 'L’offre n’a pas pu être importée. Réessayez.';
}
