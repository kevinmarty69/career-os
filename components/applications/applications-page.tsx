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
import { useI18n, useLocalizer } from '@/components/i18n/i18n-provider';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';
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
  const { locale } = useI18n();
  const localize = useLocalizer([applicationsMessages]);
  const source = opportunity.sources[0];
  const lifecycle = lifecycleCopy(opportunity.lifecycle);
  return localize(
    <article
      className={`${styles.opportunityCard} ${styles[`lifecycle-${opportunity.lifecycle}`]}`}
    >
      <div className={styles.companyMark} aria-hidden="true">
        {initials(opportunity.company ?? opportunity.role ?? 'Offre')}
      </div>
      <div className={styles.opportunityBody}>
        <div className={styles.opportunityTitle}>
          <div>
            <small>{opportunity.company ?? 'À vérifier'}</small>
            <h3>{opportunity.role ?? 'À vérifier'}</h3>
          </div>
          <span className={styles.lifecycle}>
            <i />
            {lifecycle}
          </span>
        </div>
        <dl className={styles.jobFacts}>
          <Fact
            Icon={Icon}
            icon="location_on"
            label="Lieu"
            value={opportunity.location ?? 'À vérifier'}
          />
          <Fact
            Icon={Icon}
            icon="home_work"
            label="Mode"
            value={remoteCopy(opportunity.remoteMode)}
          />
          <Fact
            Icon={Icon}
            icon="contract"
            label="Contrat"
            value={contractCopy(opportunity.contractType)}
          />
          <Fact
            Icon={Icon}
            icon="payments"
            label="Salaire"
            value={salaryCopy(opportunity, locale)}
          />
          <Fact
            Icon={Icon}
            icon="dataset_linked"
            label="Source ATS"
            value={atsCopy(opportunity.sourceKind)}
          />
        </dl>
        <a href={opportunity.sourceUrl} rel="noreferrer" target="_blank">
          <Icon>open_in_new</Icon>Voir l’offre d’origine
        </a>
        <details>
          <summary>
            <Icon>verified</Icon>Provenance et historique ·{' '}
            {opportunity.observations.length}{' '}
            {opportunity.observations.length > 1
              ? 'observations'
              : 'observation'}
          </summary>
          <div className={styles.provenance}>
            <section>
              <h4>Source consultée</h4>
              <dl>
                <div>
                  <dt>URL demandée</dt>
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
                  <dt>URL finale</dt>
                  <dd>
                    <a href={source.finalUrl} rel="noreferrer" target="_blank">
                      {host(source.finalUrl)}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Collecteur</dt>
                  <dd>{sourceKindCopy(source.sourceKind)}</dd>
                </div>
                <div>
                  <dt>Identifiant source</dt>
                  <dd>{source.externalId ?? 'À vérifier'}</dd>
                </div>
                <div>
                  <dt>Consultée</dt>
                  <dd>{formatDateTime(source.fetchedAt, locale)}</dd>
                </div>
                <div>
                  <dt>Empreinte</dt>
                  <dd>
                    <code>{source.sha256.slice(0, 12)}…</code>
                  </dd>
                </div>
              </dl>
            </section>
            <section>
              <h4>Historique des observations</h4>
              <ol className={styles.timeline}>
                {opportunity.observations.map((observation) => (
                  <li
                    className={styles[`change-${observation.change}`]}
                    key={observation.observationId}
                  >
                    <i aria-hidden="true" />
                    <div>
                      <strong>{observationCopy(observation.change)}</strong>
                      <time dateTime={observation.observedAt}>
                        {formatDateTime(observation.observedAt, locale)}
                      </time>
                    </div>
                    <small>
                      {matchCopy(observation.matchedBy)} ·{' '}
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
        <span>Découverte {formatDate(opportunity.firstSeenAt, locale)}</span>
        <button
          disabled
          title="La promotion vers une candidature sera ajoutée dans une prochaine tranche."
          type="button"
        >
          Démarrer la candidature
        </button>
        <small>Disponible prochainement</small>
      </div>
    </article>,
  );
}

function Fact({
  Icon,
  icon,
  label,
  value,
}: {
  Icon: IconComponent;
  icon: string;
  label: string;
  value: string;
}) {
  const localize = useLocalizer([applicationsMessages]);
  return localize(
    <div>
      <Icon>{icon}</Icon>
      <span>
        <dt>{label}</dt>
        <dd className={value === 'À vérifier' ? styles.unknown : undefined}>
          {value}
        </dd>
      </span>
    </div>,
  );
}

function ApplicationRow({
  Icon,
  application,
}: {
  Icon: IconComponent;
  application: Application;
}) {
  const { locale } = useI18n();
  const localize = useLocalizer([applicationsMessages]);
  const stage = {
    draft: 'Brouillon',
    applied: 'Envoyée',
    interview: 'Entretien',
    offer: 'Offre reçue',
    closed: 'Clôturée',
  }[application.stage];
  return localize(
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
        {formatDate(application.updatedAt, locale)}
      </time>
      <Icon>chevron_right</Icon>
    </Link>,
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
  const localize = useLocalizer([applicationsMessages]);
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

  return localize(
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
    </div>,
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
  const localize = useLocalizer([applicationsMessages]);
  return localize(
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
    </div>,
  );
}

function LoadingRows({ label }: { label: string }) {
  const localize = useLocalizer([applicationsMessages]);
  return localize(
    <div
      aria-label={label}
      aria-live="polite"
      className={styles.loading}
      role="status"
    >
      <span />
      <span />
      <span />
    </div>,
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

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatDateTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function lifecycleCopy(lifecycle: DiscoveredJob['lifecycle']) {
  return {
    open: 'Ouverte',
    changed: 'Modifiée',
    closed: 'Fermée',
    reposted: 'Republiée',
  }[lifecycle];
}

function remoteCopy(remoteMode: DiscoveredJob['remoteMode']) {
  return {
    unknown: 'À vérifier',
    onsite: 'Sur site',
    hybrid: 'Hybride',
    remote: 'Télétravail',
  }[remoteMode];
}

function contractCopy(contractType: DiscoveredJob['contractType']) {
  return {
    unknown: 'À vérifier',
    full_time: 'Temps plein',
    part_time: 'Temps partiel',
    internship: 'Stage',
    contract: 'Contrat',
    temporary: 'Temporaire',
  }[contractType];
}

function salaryCopy(opportunity: DiscoveredJob, locale: string) {
  const { salaryMin, salaryMax, salaryCurrency } = opportunity;
  if (!salaryCurrency || (salaryMin === null && salaryMax === null))
    return 'À vérifier';
  const format = (amount: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: salaryCurrency,
      maximumFractionDigits: 0,
    }).format(amount);
  if (salaryMin !== null && salaryMax !== null)
    return salaryMin === salaryMax
      ? format(salaryMin)
      : `${format(salaryMin)}${locale === 'fr' ? ' à ' : ' to '}${format(salaryMax)}`;
  if (salaryMin !== null)
    return `${locale === 'fr' ? 'Dès' : 'From'} ${format(salaryMin)}`;
  return `${locale === 'fr' ? 'Jusqu’à' : 'Up to'} ${format(salaryMax!)}`;
}

function atsCopy(sourceKind: DiscoveredJob['sourceKind']) {
  return sourceKind === 'generic_html'
    ? 'À vérifier'
    : sourceKindCopy(sourceKind);
}

function sourceKindCopy(sourceKind: DiscoveredJob['sourceKind']) {
  return {
    generic_html: 'Page web',
    greenhouse: 'Greenhouse',
    ashby: 'Ashby',
  }[sourceKind];
}

function observationCopy(
  change: DiscoveredJob['observations'][number]['change'],
) {
  return {
    first_seen: 'Première observation',
    unchanged: 'Aucun changement détecté',
    changed: 'Contenu de l’offre modifié',
    closed: 'Offre signalée comme fermée',
    reposted: 'Offre republiée',
  }[change];
}

function matchCopy(
  matchedBy: DiscoveredJob['observations'][number]['matchedBy'],
) {
  return {
    new: 'Nouvelle offre',
    exact_source: 'Même source',
    canonical_url: 'Même URL canonique',
    fingerprint: 'Même empreinte',
  }[matchedBy];
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
