'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ApplicationEvidenceCheckpoint } from '@/components/applications/application-evidence-checkpoint';
import { ApplicationKitPanel } from '@/components/applications/application-kit-panel';
import { ApplicationPageDraftCheckpoint } from '@/components/applications/application-page-draft-checkpoint';
import { ApplicationPublicationCheckpoint } from '@/components/applications/application-publication-checkpoint';
import { ApplicationResearchCheckpoint } from '@/components/applications/application-research-checkpoint';
import { ApplicationReviewCheckpoint } from '@/components/applications/application-review-checkpoint';
import { ApplicationStrategyCheckpoint } from '@/components/applications/application-strategy-checkpoint';
import { useApplicationWorkflow } from '@/components/applications/use-application-workflow';
import { ApplicationsPage } from '@/components/applications/applications-page';
import {
  LocaleSwitch,
  useI18n,
  useLocalizer,
} from '@/components/i18n/i18n-provider';
import { CareerMemoryContent } from '@/components/memory/career-memory-content';
import {
  applicationSchema,
  type Application,
} from '@/lib/application-contract';
import {
  applicationTimelineEventSchema,
  applicationTimelineListSchema,
  type ApplicationTimelineEvent,
} from '@/lib/application-timeline';
import {
  applicationInsightsSchema,
  type ApplicationInsights,
} from '@/lib/application-insights';
import {
  applicationTaskListSchema,
  applicationTaskSchema,
  type ApplicationTask,
} from '@/lib/application-task';
import {
  createApplicationTask,
  createApplicationTimelineEvent,
  readApplication,
  readApplicationInsights,
  readApplicationTimeline,
  readApplicationTasks,
  readApplicationRun,
  readApplications,
  readOpportunityDecisions,
  readOpportunities,
  readProfile,
  readPublications,
  revokePublication,
  saveApplicationBrand,
  setApplicationTaskCompleted,
} from '@/lib/career-api';
import {
  publicationSummarySchema,
  type PublicationSummary,
} from '@/lib/server/publication-input';
import {
  dashboardActions,
  type DashboardAction,
} from '@/lib/dashboard-priority';
import { persistedRunSchema, type PersistedRun } from '@/lib/run-contract';
import { opportunityListResponseSchema } from '@/lib/discovered-job-contract';
import {
  opportunityDecisionListResponseSchema,
  type OpportunityDecision,
} from '@/lib/opportunity-decision';
import {
  buildGlobalSearchIndex,
  searchGlobalIndex,
  type GlobalSearchItem,
} from '@/lib/global-search';
import { profileSchema } from '@/lib/schemas';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';
import { activeRoutesMessages } from '@/lib/i18n/dictionaries/active-routes';
import { dossierMessages } from '@/lib/i18n/dictionaries/dossier';
import { homeMessages } from '@/lib/i18n/dictionaries/home';
import { inboxMessages } from '@/lib/i18n/dictionaries/inbox';
import { memoryMessages } from '@/lib/i18n/dictionaries/memory';
import { searchProfilesMessages } from '@/lib/i18n/dictionaries/search-profiles';
import { shellMessages } from '@/lib/i18n/dictionaries/shell';

type Query = Record<string, string | string[] | undefined>;
type Tone = 'ok' | 'warn' | 'crit' | 'accent' | 'muted';

export function Icon({ children }: { children: string }) {
  return (
    <span className="material-symbols-rounded co-icon" aria-hidden="true">
      {children}
    </span>
  );
}

function Badge({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return <span className={`co-badge ${tone}`}>{children}</span>;
}

function Button({
  children,
  quiet = false,
  danger = false,
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  quiet?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={`co-button${quiet ? ' quiet' : ''}${danger ? ' danger' : ''}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

const nav = [
  ['/', 'space_dashboard', 'Accueil'],
  ['/inbox', 'inbox', 'À trancher'],
  ['/applications', 'work_history', 'Candidatures'],
  ['/memory', 'database', 'Mémoire pro'],
  ['/search-profiles', 'tune', 'Profils de recherche'],
  ['/interviews/demo', 'record_voice_over', 'Entretiens'],
  ['/links', 'link', 'Liens privés'],
  ['/insights', 'monitoring', 'Insights'],
  ['/settings/models', 'settings', 'Réglages'],
] as const;

const activeFrontMessages = [
  shellMessages,
  homeMessages,
  applicationsMessages,
  memoryMessages,
  searchProfilesMessages,
  inboxMessages,
  dossierMessages,
  activeRoutesMessages,
] as const;

export function AppShell({
  path,
  children,
  aside,
  sidebarContext,
  sidebarFooter,
}: {
  path: string;
  children: ReactNode;
  aside?: ReactNode;
  sidebarContext?: ReactNode;
  sidebarFooter?: ReactNode;
}) {
  const localize = useLocalizer(activeFrontMessages);
  const [palette, setPalette] = useState(false);
  const screenNav =
    path === '/assets'
      ? [
          ...nav.slice(0, 4),
          ['/assets', 'description', 'Assets'] as const,
          ...nav.slice(4),
        ]
      : path === '/runs'
        ? [
            ...nav.slice(0, 4),
            ['/runs', 'bolt', 'Runs d’agents'] as const,
            ...nav.slice(4),
          ]
        : nav;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPalette(true);
      }
      if (event.key === 'Escape') setPalette(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return localize(
    <main className={`co-shell${aside ? ' has-aside' : ''}`}>
      <aside className="co-sidebar" aria-label="Navigation principale">
        <Link className="co-brand" href="/">
          <span>
            <i />
          </span>
          <strong>Career OS</strong>
          <Icon>unfold_more</Icon>
        </Link>
        <LocaleSwitch />
        <nav>
          {screenNav.map(([href, icon, label]) => (
            <Link
              className={
                path === href || (href !== '/' && path.startsWith(href))
                  ? 'active'
                  : ''
              }
              href={href}
              key={href}
            >
              <Icon>{icon}</Icon>
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        {sidebarContext ?? <CurrentApplications />}
        {sidebarFooter === undefined ? <InstanceCard /> : sidebarFooter}
      </aside>
      <section className="co-surface">
        {path === '/' ? (
          <header className="co-home-topbar">
            <button
              className="co-home-search"
              onClick={() => setPalette(true)}
              type="button"
            >
              <Icon>search</Icon>
              <span>Chercher une preuve, une entreprise, une affirmation…</span>
              <kbd>⌘K</kbd>
            </button>
            <div>
              <button className="co-round" aria-label="Aide" type="button">
                <Icon>help</Icon>
              </button>
              <button
                className="co-round"
                aria-label="Notifications"
                type="button"
              >
                <Icon>notifications</Icon>
                <i />
              </button>
              <span className="co-home-user">
                <i>MA</i>
                <span>
                  <strong>Marc Aubry</strong>
                  <small>Ingénieur plateforme</small>
                </span>
                <Icon>expand_more</Icon>
              </span>
            </div>
          </header>
        ) : null}
        <div className="co-content">{children}</div>
      </section>
      {aside ? <aside className="co-sidepanel">{aside}</aside> : null}
      {palette ? <CommandPalette onClose={() => setPalette(false)} /> : null}
      <nav aria-label="Navigation mobile" className="co-mobile-nav">
        {screenNav.slice(0, 4).map(([href, icon, label]) => (
          <Link
            className={
              path === href || (href !== '/' && path.startsWith(href))
                ? 'active'
                : ''
            }
            href={href}
            key={href}
          >
            <Icon>{icon}</Icon>
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="co-mobile-locale">
        <LocaleSwitch compact />
      </div>
    </main>,
  );
}

function CurrentApplications() {
  const localize = useLocalizer([shellMessages]);
  return localize(
    <>
      <p className="co-nav-label">En cours</p>
      <div className="co-current-list">
        <Link href="/applications/nimbus">
          <i className="accent">NR</i>
          <span>Nimbus</span>
          <b className="warn" />
        </Link>
        <Link href="/applications/atlas">
          <i className="ok">AH</i>
          <span>Atlas Health</span>
          <b className="ok" />
        </Link>
        <Link href="/applications/keel">
          <i>KE</i>
          <span>Keel</span>
          <Icon>autorenew</Icon>
        </Link>
      </div>
    </>,
  );
}

function InstanceCard() {
  const localize = useLocalizer([shellMessages]);
  return localize(
    <div className="co-instance">
      <Icon>cloud_done</Icon>
      <strong>Instance saine</strong>
      <small>
        Auto-hébergé · 3 workers
        <br />
        dernière sauvegarde 03:00
      </small>
    </div>,
  );
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { locale } = useI18n();
  const localize = useLocalizer([shellMessages]);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<GlobalSearchItem[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const results = searchGlobalIndex(index, query);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      readApplications(controller.signal),
      readOpportunities(controller.signal),
      readProfile(controller.signal),
    ])
      .then(
        async ([applicationResponse, opportunityResponse, profileResponse]) => {
          if (
            !applicationResponse.ok ||
            !opportunityResponse.ok ||
            !profileResponse.ok
          )
            throw new Error('Workspace search unavailable.');
          const applicationPayload: unknown = await applicationResponse.json();
          const applications = applicationSchema
            .array()
            .parse(
              typeof applicationPayload === 'object' &&
                applicationPayload !== null &&
                'applications' in applicationPayload
                ? applicationPayload.applications
                : [],
            );
          const opportunities = opportunityListResponseSchema.parse(
            await opportunityResponse.json(),
          ).opportunities;
          const profilePayload: unknown = await profileResponse.json();
          const profile = profileSchema
            .nullable()
            .parse(
              typeof profilePayload === 'object' &&
                profilePayload !== null &&
                'profile' in profilePayload
                ? profilePayload.profile
                : null,
            );
          setIndex(
            buildGlobalSearchIndex({
              applications,
              opportunities,
              profile: profile ?? undefined,
            }),
          );
          setState('ready');
        },
      )
      .catch(() => {
        if (!controller.signal.aborted) setState('error');
      });
    return () => controller.abort();
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const href = results[0]?.href;
    if (!href) return;
    onClose();
    router.push(href);
  }

  const kindLabel = {
    application: 'Candidature',
    opportunity: 'Opportunité',
    claim: 'Affirmation',
    evidence: 'Preuve',
  } as const;
  return localize(
    <div className="co-scrim" role="presentation" onMouseDown={onClose}>
      <section
        className="co-command"
        role="dialog"
        aria-modal="true"
        aria-label="Palette de commandes"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form onSubmit={submit}>
          <label>
            <Icon>search</Icon>
            <input
              aria-label="Recherche globale"
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Chercher une preuve, une entreprise, une action…"
              type="search"
              value={query}
            />
            <kbd>esc</kbd>
          </label>
        </form>
        <p>
          {state === 'ready'
            ? `${results.length} ${locale === 'en' ? (results.length === 1 ? 'result' : 'results') : 'résultat' + (results.length === 1 ? '' : 's')}`
            : state === 'loading'
              ? 'Recherche en cours…'
              : 'Recherche indisponible'}
        </p>
        {results.map((result, position) => (
          <Link
            href={result.href}
            key={`${result.kind}:${result.id}`}
            onClick={onClose}
          >
            <Icon>{searchIcon(result.kind)}</Icon>
            <span>
              <strong>{result.title}</strong>
              <small>
                {kindLabel[result.kind]} · {searchResultDetail(result, locale)}
              </small>
            </span>
            {position === 0 ? <kbd>↵</kbd> : null}
          </Link>
        ))}
        {state === 'ready' && !results.length ? (
          <div className="co-command-empty">
            Aucun résultat pour cette recherche.
          </div>
        ) : null}
        <p>Actions</p>
        <Link href="/applications#new" onClick={onClose}>
          <Icon>add_link</Icon>
          <span>
            <strong>Nouvelle candidature depuis une URL</strong>
          </span>
          <kbd>⌘N</kbd>
        </Link>
        <Link href="/memory/import" onClick={onClose}>
          <Icon>upload_file</Icon>
          <span>
            <strong>Importer un document dans la mémoire</strong>
          </span>
          <kbd>⌘U</kbd>
        </Link>
        <footer>
          <span>↵ ouvrir le premier résultat</span>
          <b>
            {locale === 'en'
              ? `${index.length} indexed items`
              : `${index.length} éléments indexés`}
          </b>
        </footer>
      </section>
    </div>,
  );
}

function searchIcon(kind: GlobalSearchItem['kind']) {
  return {
    application: 'work_history',
    opportunity: 'travel_explore',
    claim: 'fact_check',
    evidence: 'verified',
  }[kind];
}

function searchResultDetail(result: GlobalSearchItem, locale: 'en' | 'fr') {
  if (result.kind !== 'claim') return result.detail;
  return (
    {
      verified: locale === 'en' ? 'verified' : 'vérifiée',
      declared: locale === 'en' ? 'declared' : 'déclarée',
      inferred: locale === 'en' ? 'inferred' : 'inférée',
      unsupported: locale === 'en' ? 'unsupported' : 'non soutenue',
    }[result.detail] ?? result.detail
  );
}

function PageHeader({
  eyebrow,
  title,
  copy,
  actions,
}: {
  eyebrow?: string;
  title: string;
  copy?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="co-page-header">
      <div>
        {eyebrow ? <p>{eyebrow}</p> : null}
        <h1>{title}</h1>
        {copy ? <span>{copy}</span> : null}
      </div>
      {actions ? <div className="co-actions">{actions}</div> : null}
    </header>
  );
}

function Stat({
  icon,
  value,
  label,
  tone = 'accent',
}: {
  icon: string;
  value: ReactNode;
  label: string;
  tone?: Tone;
}) {
  return (
    <article className="co-stat">
      <span className={tone}>
        <Icon>{icon}</Icon>
      </span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </article>
  );
}

function ClaimRow({
  tone = 'ok',
  label,
  text,
  source,
  action,
}: {
  tone?: Tone;
  label: string;
  text: string;
  source?: string;
  action?: string;
}) {
  return (
    <article className="co-claim">
      <div>
        <Badge tone={tone}>{label}</Badge>
        {source ? <small>{source}</small> : null}
      </div>
      <strong>{text}</strong>
      {action ? <Button quiet>{action}</Button> : null}
    </article>
  );
}

function useWorkflowDashboard() {
  const [dashboard, setDashboard] = useState<{
    applications: Application[];
    items: Array<{
      application: Application;
      run?: PersistedRun;
      unavailable?: boolean;
    }>;
    publications: PublicationSummary[];
  }>();
  const [error, setError] = useState<'auth' | 'unavailable'>();

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      readApplications(controller.signal),
      readPublications(controller.signal),
    ])
      .then(async ([applicationResponse, publicationResponse]) => {
        if (
          applicationResponse.status === 401 ||
          publicationResponse.status === 401
        )
          return setError('auth');
        if (!applicationResponse.ok || !publicationResponse.ok)
          return setError('unavailable');
        const applicationPayload = (await applicationResponse.json()) as {
          applications?: unknown;
        };
        const publicationPayload = (await publicationResponse.json()) as {
          publications?: unknown;
        };
        const applications = applicationSchema
          .array()
          .parse(applicationPayload.applications ?? []);
        const publications = publicationSummarySchema
          .array()
          .parse(publicationPayload.publications ?? []);
        // ponytail: eight recent runs avoid an aggregate endpoint until dashboard latency warrants one.
        const items = await Promise.all(
          applications.slice(0, 8).map(async (application) => {
            const response = await readApplicationRun(
              application.applicationId,
              controller.signal,
            );
            if (response.status === 204) return { application };
            if (!response.ok) return { application, unavailable: true };
            const run = persistedRunSchema.safeParse(await response.json());
            return run.success
              ? { application, run: run.data }
              : { application, unavailable: true };
          }),
        );
        setDashboard({ applications, items, publications });
      })
      .catch((caught: unknown) => {
        if (!(caught instanceof DOMException) || caught.name !== 'AbortError')
          setError('unavailable');
      });
    return () => controller.abort();
  }, []);

  const unavailable =
    error ??
    (dashboard?.items.length &&
    dashboard.items.every((item) => item.unavailable)
      ? 'unavailable'
      : undefined);
  return { dashboard, error: unavailable };
}

function HomeAside({
  loading,
  publications,
}: {
  loading: boolean;
  publications: PublicationSummary[];
}) {
  const { locale } = useI18n();
  const localize = useLocalizer([homeMessages]);
  const active = publications.filter((item) => item.status === 'active');
  return localize(
    <div className="co-home-aside">
      <section className="co-home-links">
        <header>
          <h2>Liens privés actifs</h2>
          <Link href="/links">Tout voir</Link>
        </header>
        {active.slice(0, 3).map((publication) => (
          <Link
            href={`/applications/${publication.applicationId}`}
            key={publication.publicationId}
          >
            <Icon>{publication.opens ? 'visibility' : 'visibility_off'}</Icon>
            <span>
              <strong>{publication.company}</strong>
              <small>
                {publication.opens
                  ? locale === 'fr'
                    ? `${publication.opens} ouverture${publication.opens > 1 ? 's' : ''}`
                    : `${publication.opens} opening${publication.opens > 1 ? 's' : ''}`
                  : locale === 'fr'
                    ? 'Jamais ouvert'
                    : 'Never opened'}
              </small>
            </span>
            <Icon>arrow_forward</Icon>
          </Link>
        ))}
        {loading ? <p>Chargement…</p> : null}
        {!loading && !active.length ? <p>Aucun lien actif.</p> : null}
      </section>
      <section className="co-home-aside-note">
        <Icon>rule</Icon>
        <h2>Priorités explicables</h2>
        <p>
          La prochaine action vient uniquement de l’état enregistré de vos
          candidatures et de vos décisions humaines.
        </p>
      </section>
    </div>,
  );
}

function HomeScreen() {
  const { locale } = useI18n();
  const { dashboard, error: dashboardError } = useWorkflowDashboard();

  const actions = dashboardActions(dashboard?.items ?? []);
  const priority = actions[0];
  const activeLinks =
    dashboard?.publications.filter((item) => item.status === 'active').length ??
    0;
  const copy = homePriorityCopy(priority, locale, dashboardError);

  return (
    <AppShell
      aside={
        <HomeAside
          loading={!dashboard && !dashboardError}
          publications={dashboard?.publications ?? []}
        />
      }
      path="/"
      sidebarFooter={
        <div className="co-home-hosting">
          <strong>Auto-hébergé</strong>
          <span>Vos preuves ne quittent pas votre instance.</span>
          <Link href="/settings/models">Voir la config</Link>
        </div>
      }
    >
      <section className="co-home-hero">
        <p>{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <span>{copy.detail}</span>
        <div>
          <Link
            className="co-button dark"
            href={
              priority
                ? `/applications/${priority.application.applicationId}`
                : dashboardError === 'auth'
                  ? '/sign-in'
                  : '/applications'
            }
          >
            {copy.action} <Icon>arrow_forward</Icon>
          </Link>
          <Link className="co-button transparent" href="/runs">
            Voir le journal
          </Link>
        </div>
      </section>

      <section className="co-home-stats" aria-label="Indicateurs principaux">
        <Stat
          icon="work_history"
          value={String(dashboard?.applications.length ?? 0)}
          label="Candidatures"
        />
        <Stat
          icon="verified"
          tone="ok"
          value={String(actions.length)}
          label="Actions prioritaires"
        />
        <Stat
          icon="link"
          tone="warn"
          value={String(activeLinks)}
          label="Liens privés actifs"
        />
      </section>

      <section className="co-home-review-queue">
        <header>
          <h2>À faire maintenant</h2>
        </header>
        {actions.slice(0, 3).map((action) => (
          <article
            className="co-home-review-card compact"
            key={action.application.applicationId}
          >
            <Icon>{homePriorityIcon(action.kind)}</Icon>
            <div>
              <h3>
                {action.application.company} · {action.application.role}
              </h3>
              <p>{homePriorityRow(action, locale)}</p>
            </div>
            <Link href={`/applications/${action.application.applicationId}`}>
              Ouvrir
            </Link>
          </article>
        ))}
        {!actions.length ? (
          <div className="co-note">
            <Icon>{dashboardError ? 'cloud_off' : 'check_circle'}</Icon>
            {dashboardError
              ? locale === 'fr'
                ? 'Les priorités ne sont pas disponibles.'
                : 'Priorities are unavailable.'
              : locale === 'fr'
                ? 'Aucune candidature ne demande votre attention.'
                : 'No application needs your attention.'}
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}

function homePriorityCopy(
  priority: DashboardAction | undefined,
  locale: 'en' | 'fr',
  error: 'auth' | 'unavailable' | undefined,
) {
  if (error === 'auth')
    return locale === 'fr'
      ? {
          eyebrow: 'Espace privé',
          title: 'Connectez-vous pour retrouver votre prochaine action.',
          detail: 'Vos candidatures et décisions restent privées.',
          action: 'Se connecter',
        }
      : {
          eyebrow: 'Private workspace',
          title: 'Sign in to see your next action.',
          detail: 'Your applications and decisions remain private.',
          action: 'Sign in',
        };
  if (!priority)
    return locale === 'fr'
      ? {
          eyebrow: error ? 'Données indisponibles' : 'Tout est à jour',
          title: error
            ? 'Votre tableau de bord ne peut pas être chargé.'
            : 'Aucune candidature ne demande votre attention.',
          detail: error
            ? 'Réessayez dans quelques instants.'
            : 'Ajoutez une offre pour démarrer un nouveau parcours.',
          action: 'Voir les candidatures',
        }
      : {
          eyebrow: error ? 'Data unavailable' : 'All caught up',
          title: error
            ? 'Your dashboard could not be loaded.'
            : 'No application needs your attention.',
          detail: error
            ? 'Try again in a moment.'
            : 'Add a job to start a new application journey.',
          action: 'View applications',
        };
  const { company } = priority.application;
  const detail = homePriorityRow(priority, locale);
  const titles: Record<DashboardAction['kind'], [string, string]> = {
    review: [
      `${priority.pendingDecisions} decision${priority.pendingDecisions > 1 ? 's' : ''} need your review for ${company}.`,
      `${priority.pendingDecisions} décision${priority.pendingDecisions > 1 ? 's' : ''} à trancher pour ${company}.`,
    ],
    decision: [
      `${company} is waiting for your decision.`,
      `${company} attend votre décision.`,
    ],
    running: [
      `The ${company} workflow is running.`,
      `Le workflow ${company} est en cours.`,
    ],
    recover: [
      `The ${company} workflow needs attention.`,
      `Le workflow ${company} demande votre attention.`,
    ],
    start: [
      `Start the evidence workflow for ${company}.`,
      `Lancez le workflow de preuves pour ${company}.`,
    ],
    publish: [
      `The ${company} application is ready to publish.`,
      `La candidature ${company} est prête à publier.`,
    ],
  };
  return {
    eyebrow: `${locale === 'fr' ? 'Prochaine action' : 'Next action'} · ${company}`,
    title: titles[priority.kind][locale === 'en' ? 0 : 1],
    detail,
    action: locale === 'fr' ? 'Ouvrir le dossier' : 'Open application',
  };
}

function homePriorityRow(action: DashboardAction, locale: 'en' | 'fr') {
  const labels: Record<DashboardAction['kind'], [string, string]> = {
    review: [
      `${action.pendingDecisions} unresolved human decision${action.pendingDecisions > 1 ? 's' : ''}.`,
      `${action.pendingDecisions} décision${action.pendingDecisions > 1 ? 's humaines non résolues' : ' humaine non résolue'}.`,
    ],
    decision: [
      `Paused at ${runStageLabel(action.run?.stage ?? 'human_approval', locale)}.`,
      `En pause à l’étape ${runStageLabel(action.run?.stage ?? 'human_approval', locale)}.`,
    ],
    running: [
      `Agents are working on ${runStageLabel(action.run?.stage ?? 'research', locale)}.`,
      `Les agents travaillent sur ${runStageLabel(action.run?.stage ?? 'research', locale)}.`,
    ],
    recover: [
      `Run status: ${action.run ? runStatusLabel(action.run.status, locale) : 'Unavailable'}.`,
      `État du run : ${action.run ? runStatusLabel(action.run.status, locale) : 'Indisponible'}.`,
    ],
    start: [
      'No workflow has started yet.',
      'Aucun workflow n’a encore démarré.',
    ],
    publish: [
      'All publication gates are satisfied.',
      'Tous les contrôles de publication sont validés.',
    ],
  };
  return labels[action.kind][locale === 'en' ? 0 : 1];
}

function homePriorityIcon(kind: DashboardAction['kind']) {
  return {
    review: 'rule',
    decision: 'front_hand',
    running: 'bolt',
    recover: 'warning',
    start: 'play_arrow',
    publish: 'publish',
  }[kind];
}

function MemoryScreen() {
  return (
    <AppShell
      path="/memory"
      sidebarContext={
        <>
          <p className="co-nav-label">Mémoire</p>
          <div className="co-sidebar-sources">
            <Link href="/memory/import">
              <Icon>upload_file</Icon>
              <span>Importer une source</span>
            </Link>
            <Link href="/memory/interview">
              <Icon>record_voice_over</Icon>
              <span>Entretien guidé</span>
            </Link>
            <Link href="/memory/audit">
              <Icon>fact_check</Icon>
              <span>Audit de positionnement</span>
            </Link>
          </div>
        </>
      }
      sidebarFooter={
        <div className="co-sidebar-card">
          <strong>Vos données, vos règles</strong>
          <span>
            Chaque affirmation conserve sa source, sa sensibilité et ses usages.
          </span>
          <Link className="co-button" href="/memory/import">
            Ajouter une source
          </Link>
        </div>
      }
    >
      <PageHeader
        title="Mémoire professionnelle"
        copy="Relisez, sourcez et contrôlez les informations utilisables dans vos candidatures."
      />
      <CareerMemoryContent />
    </AppShell>
  );
}

function ApplicationsScreen() {
  return <ApplicationsPage AppShell={AppShell} Icon={Icon} />;
}

function DossierNav({
  active,
  applicationId,
  company,
}: {
  active: string;
  applicationId: string;
  company: string;
}) {
  const localize = useLocalizer([dossierMessages]);
  const items = [
    ['assignment', 'Brief', ''],
    ['business', 'Entreprise', 'company'],
    ['rule', 'Exigences ↔ preuves', ''],
    ['strategy', 'Stratégie', ''],
    ['folder', 'Livrables', 'page'],
    ['groups', 'Contacts', 'timeline'],
    ['history', 'Versions', 'versions'],
  ];
  return localize(
    <aside className="co-dossier-nav">
      <Link href="/applications">
        <Icon>arrow_back</Icon>Toutes les candidatures
      </Link>
      <p>{company}</p>
      {items.map(([icon, label, path]) => (
        <Link
          className={active === label ? 'active' : ''}
          href={
            path
              ? `/applications/${applicationId}/${path}`
              : `/applications/${applicationId}`
          }
          key={label}
        >
          <Icon>{icon}</Icon>
          {label}
        </Link>
      ))}
    </aside>,
  );
}

function ApplicationTimelineScreen({
  applicationId,
}: {
  applicationId: string;
}) {
  const { locale } = useI18n();
  const [result, setResult] = useState<{
    applicationId: string;
    application?: Application;
    events?: ApplicationTimelineEvent[];
    error?: 'auth' | 'missing' | 'unavailable';
  }>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const current = result?.applicationId === applicationId ? result : undefined;
  const application = current?.application;
  const events = current?.events ?? [];

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      readApplication(applicationId, controller.signal),
      readApplicationTimeline(applicationId, controller.signal),
    ])
      .then(async ([applicationResponse, timelineResponse]) => {
        if (
          applicationResponse.status === 401 ||
          timelineResponse.status === 401
        )
          return setResult({ applicationId, error: 'auth' });
        if (
          applicationResponse.status === 404 ||
          timelineResponse.status === 404
        )
          return setResult({ applicationId, error: 'missing' });
        if (!applicationResponse.ok || !timelineResponse.ok)
          return setResult({ applicationId, error: 'unavailable' });
        const parsedApplication = applicationSchema.safeParse(
          await applicationResponse.json(),
        );
        const parsedTimeline = applicationTimelineListSchema.safeParse(
          await timelineResponse.json(),
        );
        if (!parsedApplication.success || !parsedTimeline.success)
          return setResult({ applicationId, error: 'unavailable' });
        setResult({
          applicationId,
          application: parsedApplication.data,
          events: parsedTimeline.data.events,
        });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException) || error.name !== 'AbortError')
          setResult({ applicationId, error: 'unavailable' });
      });
    return () => controller.abort();
  }, [applicationId]);

  async function addEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!application || saving) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    setSaveError(false);
    try {
      const response = await createApplicationTimelineEvent(applicationId, {
        kind: String(form.get('kind')) as ApplicationTimelineEvent['kind'],
        title: String(form.get('title') ?? ''),
        note: String(form.get('note') ?? ''),
        occurredAt: new Date(String(form.get('occurredAt'))).toISOString(),
      });
      if (!response.ok) throw new Error();
      const created = applicationTimelineEventSchema.parse(
        await response.json(),
      );
      setResult({ applicationId, application, events: [created, ...events] });
      formElement.reset();
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  const identity = application
    ? { applicationId, company: application.company, role: application.role }
    : { applicationId, company: 'Candidature', role: 'Chargement…' };

  return (
    <DossierShell
      active="Contacts"
      actions={null}
      identity={identity}
      state={
        application ? (
          <Badge tone="muted">Journal manuel · données persistées</Badge>
        ) : undefined
      }
    >
      <div className="co-dossier-content co-application-timeline">
        {!application ? (
          <section className="co-panel co-live-dossier-state">
            <h1>
              {current?.error === 'auth'
                ? 'Connectez-vous pour ouvrir ce dossier.'
                : current?.error === 'missing'
                  ? 'Cette candidature est introuvable.'
                  : current?.error === 'unavailable'
                    ? 'Impossible de charger cette candidature.'
                    : 'Chargement du suivi…'}
            </h1>
          </section>
        ) : (
          <>
            <section className="co-panel co-timeline-intro">
              <p>Suivi de candidature</p>
              <h1>Contacts, entretiens et résultats</h1>
              <span>
                Consignez les échanges importants dans un journal factuel. Rien
                n’est envoyé automatiquement.
              </span>
            </section>
            <section className="co-panel co-timeline-form">
              <h2>Ajouter un événement</h2>
              <form onSubmit={addEvent}>
                <label>
                  Type
                  <select defaultValue="contact" name="kind">
                    <option value="contact">Contact</option>
                    <option value="interview">Entretien</option>
                    <option value="response">Réponse</option>
                    <option value="outcome">Résultat</option>
                  </select>
                </label>
                <label>
                  Date et heure
                  <input name="occurredAt" required type="datetime-local" />
                </label>
                <label className="wide">
                  Titre
                  <input
                    maxLength={200}
                    name="title"
                    placeholder="Entretien technique avec l’équipe produit"
                    required
                  />
                </label>
                <label className="wide">
                  Notes
                  <textarea
                    maxLength={2_000}
                    name="note"
                    placeholder="Décisions, attentes et prochaine étape…"
                    rows={3}
                  />
                </label>
                <button className="co-button" disabled={saving} type="submit">
                  {saving ? 'Enregistrement…' : 'Ajouter au journal'}
                </button>
                {saveError ? (
                  <p role="alert">L’événement n’a pas été enregistré.</p>
                ) : null}
              </form>
            </section>
            <section className="co-panel co-timeline-list">
              <header>
                <h2>Journal</h2>
                <Badge>{events.length}</Badge>
              </header>
              {events.length ? (
                events.map((event) => (
                  <article key={event.eventId}>
                    <Icon>{timelineIcon(event.kind)}</Icon>
                    <div>
                      <p>
                        <strong>{event.title}</strong>
                        <Badge tone={event.kind === 'outcome' ? 'ok' : 'muted'}>
                          {timelineKindLabel(event.kind, locale)}
                        </Badge>
                      </p>
                      <time dateTime={event.occurredAt}>
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(event.occurredAt))}
                      </time>
                      {event.note ? <span>{event.note}</span> : null}
                    </div>
                  </article>
                ))
              ) : (
                <div className="co-timeline-empty">
                  <Icon>calendar_add_on</Icon>
                  <h3>Aucun événement pour le moment</h3>
                  <p>
                    Ajoutez le premier contact ou entretien de cette
                    candidature.
                  </p>
                </div>
              )}
            </section>
            <ApplicationTasksPanel applicationId={applicationId} />
          </>
        )}
      </div>
    </DossierShell>
  );
}

function ApplicationTasksPanel({ applicationId }: { applicationId: string }) {
  const { locale } = useI18n();
  const localize = useLocalizer([dossierMessages]);
  const [tasks, setTasks] = useState<ApplicationTask[]>();
  const [saving, setSaving] = useState(false);
  const [pendingTaskId, setPendingTaskId] = useState<string>();
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void readApplicationTasks(applicationId, controller.signal)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const parsed = applicationTaskListSchema.parse(await response.json());
        setTasks(parsed.tasks);
      })
      .catch((requestError: unknown) => {
        if (
          !(requestError instanceof DOMException) ||
          requestError.name !== 'AbortError'
        )
          setError(true);
      });
    return () => controller.abort();
  }, [applicationId]);

  async function addTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    setError(false);
    try {
      const response = await createApplicationTask(applicationId, {
        kind: String(form.get('kind')) as ApplicationTask['kind'],
        title: String(form.get('title') ?? ''),
        dueAt: new Date(String(form.get('dueAt'))).toISOString(),
      });
      if (!response.ok) throw new Error();
      const created = applicationTaskSchema.parse(await response.json());
      setTasks([...(tasks ?? []), created].sort(compareApplicationTasks));
      formElement.reset();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  async function toggleTask(task: ApplicationTask) {
    if (pendingTaskId) return;
    setPendingTaskId(task.taskId);
    setError(false);
    try {
      const response = await setApplicationTaskCompleted(
        task,
        !task.completedAt,
      );
      if (!response.ok) throw new Error();
      const updated = applicationTaskSchema.parse(await response.json());
      setTasks(
        (tasks ?? [])
          .map((candidate) =>
            candidate.taskId === updated.taskId ? updated : candidate,
          )
          .sort(compareApplicationTasks),
      );
    } catch {
      setError(true);
    } finally {
      setPendingTaskId(undefined);
    }
  }

  return localize(
    <section className="co-panel co-application-tasks">
      <header>
        <div>
          <p>Prochaines actions</p>
          <h2>Tâches et relances datées</h2>
        </div>
        <Badge>{tasks?.filter((task) => !task.completedAt).length ?? 0}</Badge>
      </header>
      <form onSubmit={addTask}>
        <label>
          Type
          <select defaultValue="follow_up" name="kind">
            <option value="task">Tâche</option>
            <option value="follow_up">Relance</option>
          </select>
        </label>
        <label>
          Échéance
          <input name="dueAt" required type="datetime-local" />
        </label>
        <label className="wide">
          Action à réaliser
          <input
            maxLength={200}
            name="title"
            placeholder="Relancer la recruteuse après l’entretien"
            required
          />
        </label>
        <button className="co-button" disabled={saving} type="submit">
          {saving ? 'Enregistrement…' : 'Planifier'}
        </button>
      </form>
      {error ? (
        <p className="co-task-error" role="alert">
          La modification n’a pas été enregistrée.
        </p>
      ) : null}
      <div className="co-task-list">
        {tasks === undefined ? (
          <p>Chargement des prochaines actions…</p>
        ) : tasks.length ? (
          tasks.map((task) => (
            <article
              className={task.completedAt ? 'done' : ''}
              key={task.taskId}
            >
              <button
                aria-label={
                  locale === 'en'
                    ? `${task.completedAt ? 'Reopen' : 'Complete'}: ${task.title}`
                    : `${task.completedAt ? 'Rouvrir' : 'Terminer'} : ${task.title}`
                }
                disabled={pendingTaskId === task.taskId}
                onClick={() => void toggleTask(task)}
                type="button"
              >
                <Icon>
                  {task.completedAt ? 'check_circle' : 'radio_button_unchecked'}
                </Icon>
              </button>
              <div>
                <p>
                  <strong>{task.title}</strong>
                  <Badge tone={task.kind === 'follow_up' ? 'warn' : 'muted'}>
                    {taskKindLabel(task.kind, locale)}
                  </Badge>
                </p>
                <time dateTime={task.dueAt}>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(task.dueAt))}
                </time>
              </div>
            </article>
          ))
        ) : (
          <p>Aucune action planifiée.</p>
        )}
      </div>
    </section>,
  );
}

function taskKindLabel(kind: ApplicationTask['kind'], locale: 'en' | 'fr') {
  if (kind === 'follow_up') return locale === 'en' ? 'Follow-up' : 'Relance';
  return locale === 'en' ? 'Task' : 'Tâche';
}

function compareApplicationTasks(
  left: ApplicationTask,
  right: ApplicationTask,
) {
  return (
    Number(Boolean(left.completedAt)) - Number(Boolean(right.completedAt)) ||
    left.dueAt.localeCompare(right.dueAt)
  );
}

function timelineKindLabel(
  kind: ApplicationTimelineEvent['kind'],
  locale: 'en' | 'fr',
) {
  const labels = {
    contact: ['Contact', 'Contact'],
    interview: ['Interview', 'Entretien'],
    response: ['Response', 'Réponse'],
    outcome: ['Outcome', 'Résultat'],
  } as const;
  return labels[kind][locale === 'en' ? 0 : 1];
}

function timelineIcon(kind: ApplicationTimelineEvent['kind']) {
  return {
    contact: 'person',
    interview: 'record_voice_over',
    response: 'mark_email_read',
    outcome: 'flag',
  }[kind];
}

function DossierShell({
  active,
  children,
  state,
  actions,
  identity = {
    applicationId: 'nimbus',
    company: 'Nimbus Robotics',
    role: 'Staff Product Engineer',
  },
}: {
  active: string;
  children: ReactNode;
  state?: ReactNode;
  actions?: ReactNode;
  identity?: { applicationId: string; company: string; role: string };
}) {
  const localize = useLocalizer(activeFrontMessages);
  return localize(
    <main className="co-dossier-shell">
      <DossierNav
        active={active}
        applicationId={identity.applicationId}
        company={identity.company}
      />
      <section>
        <header className="co-dossier-top">
          <div>
            <i>{initials(identity.company)}</i>
            <span>
              <small>
                {identity.company} · {identity.role}
              </small>
              <strong>
                {active === 'Versions'
                  ? 'Historique des versions et décisions'
                  : 'Dossier de candidature'}
              </strong>
            </span>
          </div>
          <LocaleSwitch compact />
          {state ?? <Badge tone="warn">À valider</Badge>}
          {actions === undefined ? (
            <Button>
              <Icon>bolt</Icon>Relancer les agents
            </Button>
          ) : (
            actions
          )}
        </header>
        {children}
      </section>
      <nav
        aria-label="Navigation mobile"
        className="co-mobile-nav co-dossier-mobile-nav"
      >
        {[
          ['/applications', 'arrow_back', 'Candidatures'],
          [`/applications/${identity.applicationId}`, 'description', 'Brief'],
          [
            `/applications/${identity.applicationId}/company`,
            'domain',
            'Entreprise',
          ],
          [`/applications/${identity.applicationId}/page`, 'web', 'Livrables'],
          [
            `/applications/${identity.applicationId}/timeline`,
            'groups',
            'Contacts',
          ],
        ].map(([href, icon, label]) => (
          <Link href={href} key={href}>
            <Icon>{icon}</Icon>
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </main>,
  );
}

function DynamicDossierScreen({ applicationId }: { applicationId: string }) {
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
        company: 'Candidature',
        role: 'Chargement…',
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
              ? 'Démarrage du workflow…'
              : 'Démarrer le workflow agentique'}
          </Button>
        ) : null
      }
      active="Brief"
      identity={identity}
      state={
        application ? (
          <Badge tone="muted">Candidature réelle · données persistées</Badge>
        ) : undefined
      }
    >
      <div className="co-dossier-content co-live-dossier">
        {!application ? (
          <section className="co-panel co-live-dossier-state">
            <h1>
              {error === 'auth'
                ? 'Connectez-vous pour ouvrir ce dossier.'
                : error === 'missing'
                  ? 'Cette candidature est introuvable.'
                  : error === 'unavailable'
                    ? 'Impossible de charger cette candidature.'
                    : 'Chargement de la candidature…'}
            </h1>
            {error ? (
              <Link className="co-button" href="/applications">
                Retour aux candidatures
              </Link>
            ) : null}
          </section>
        ) : (
          <section className="co-panel co-live-dossier-card">
            <p>Candidature réelle · données persistées</p>
            <h1>{application.role}</h1>
            <h2>{application.company}</h2>
            <dl>
              <div>
                <dt>Étape</dt>
                <dd>{stageLabel(application.stage, locale)}</dd>
              </div>
              <div>
                <dt>Révision</dt>
                <dd>{application.revision}</dd>
              </div>
              <div>
                <dt>Dernière mise à jour</dt>
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
                  <h2>Identité visuelle de la page privée</h2>
                  <p>
                    Le logo et la couleur accompagnent cette candidature sans
                    imiter le site de l’entreprise.
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
                <p>Identité figée dans le snapshot de ce run.</p>
              ) : (
                <form onSubmit={saveBrand}>
                  <label>
                    Logo de l’entreprise
                    <input
                      defaultValue={application.logoUrl ?? ''}
                      name="logoUrl"
                      placeholder="https://…"
                      type="url"
                    />
                  </label>
                  <label>
                    Couleur principale accessible
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
                      ? 'Enregistrement…'
                      : 'Enregistrer l’identité'}
                  </button>
                </form>
              )}
              {brandState === 'saved' ? (
                <p role="status">Identité enregistrée pour le prochain run.</p>
              ) : null}
              {brandState === 'error' ? (
                <p role="alert">
                  L’identité n’a pas été enregistrée. Vérifiez l’URL et
                  réessayez.
                </p>
              ) : null}
            </section>
            <section className="co-live-workflow">
              <h2>Workflow agentique</h2>
              {workflow.loading ? (
                <p>Recherche d’un run existant…</p>
              ) : workflow.run ? (
                <>
                  <dl>
                    <div>
                      <dt>Statut du run</dt>
                      <dd>{runStatusLabel(workflow.run.status, locale)}</dd>
                    </div>
                    <div>
                      <dt>Étape active</dt>
                      <dd>{runStageLabel(workflow.run.stage, locale)}</dd>
                    </div>
                    <div>
                      <dt>Événements persistés</dt>
                      <dd>{workflow.run.events.length}</dd>
                    </div>
                  </dl>
                  <div className="co-run-journal">
                    <section>
                      <h3>Progression</h3>
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
                      <h3>Journal lisible</h3>
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
                        <p>Le premier événement apparaîtra ici.</p>
                      )}
                    </section>
                  </div>
                </>
              ) : workflow.error ? (
                <p role="alert">{workflowErrorLabel(workflow.error)}</p>
              ) : (
                <p>
                  Aucun run. Le bouton démarre une exécution bornée et persistée
                  à partir de cette candidature et de votre mémoire.
                </p>
              )}
              {workflow.error === 'profile-missing' ? (
                <Link href="/memory">Compléter la mémoire professionnelle</Link>
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
                Ouvrir la source
              </a>
            ) : (
              <span>Aucune URL source enregistrée.</span>
            )}
            <footer>
              Le dossier est prêt pour la recherche entreprise et le workflow
              agentique.
            </footer>
          </section>
        )}
      </div>
    </DossierShell>
  );
}

function DossierScreen({ running = false }: { running?: boolean }) {
  if (running) return <AnalysisScreen />;
  return (
    <DossierShell active="Brief">
      <div className="co-dossier-content">
        <section className="co-main-column">
          <div className="co-tabs">
            <button className="active">Vue d’ensemble</button>
            <button>Offre d’origine</button>
            <button>Recherche entreprise</button>
            <button>Livrables</button>
            <button>Runs</button>
          </div>
          <section className="co-panel co-strategy">
            <p>
              Angle retenu <Badge tone="accent">agent stratégie · 14:02</Badge>
            </p>
            <h1>
              L’opérabilité par une petite équipe, pas la performance brute.
            </h1>
            <span>
              Nimbus a levé en juin et recrute quatre personnes sur Fleet
              Platform. On mène avec Corvid : outillage écrit puis transmis, pas
              une prouesse solo.
            </span>
            <footer>6 sources consultées · 3 signaux de recrutement</footer>
          </section>
          <section className="co-panel">
            <div className="co-section-title">
              <h2>Exigences ↔ preuves</h2>
              <Link href="/applications/nimbus/review">Voir les 12</Link>
            </div>
            <ClaimRow
              label="Couvert"
              text="Fiabilité du déploiement à grande échelle"
              source="Exigence critique · 2 preuves vérifiées"
            />
            <ClaimRow
              label="Couvert"
              text="Outillage pour équipes internes"
              source="Exigence critique · 3 preuves vérifiées"
            />
            <ClaimRow
              tone="warn"
              label="Partiel"
              text="Expérience robotique / ROS2"
              source="Secondaire · 1 preuve open source"
            />
            <ClaimRow
              tone="crit"
              label="Gap"
              text="Management d’une équipe de 5+"
              source="Exigence critique · aucune preuve"
            />
          </section>
        </section>
        <aside className="co-stack">
          <section className="co-panel">
            <h2>Publication bloquée</h2>
            <p>1 affirmation sans preuve · 3 modifications à trancher.</p>
            <Link className="co-button" href="/applications/nimbus/review">
              Ouvrir la revue
            </Link>
          </section>
          <section className="co-panel">
            <h2>
              Livrables <Badge>5</Badge>
            </h2>
            <ul className="co-checklist">
              <li>
                <Icon>web</Icon>Page privée v4 · 4 sections
              </li>
              <li>
                <Icon>description</Icon>CV adapté · 1 page
              </li>
              <li>
                <Icon>mail</Icon>Email de candidature
              </li>
              <li>
                <Icon>forum</Icon>Message LinkedIn
              </li>
            </ul>
          </section>
          <section className="co-panel">
            <h2>
              Avant envoi <Badge tone="warn">3 / 5</Badge>
            </h2>
            <ul className="co-checklist">
              <li className="done">Offre confirmée</li>
              <li className="done">Entreprise documentée</li>
              <li className="done">CV adapté relu</li>
              <li>Trancher 3 modifications</li>
              <li>Créer le lien privé</li>
            </ul>
          </section>
        </aside>
      </div>
    </DossierShell>
  );
}

function AnalysisScreen() {
  return (
    <AppShell path="/applications">
      <PageHeader
        eyebrow="Fathom · Berlin / remote · importée il y a 48 s"
        title="Platform Engineer"
        actions={
          <>
            <Badge tone="accent">Analyse en cours</Badge>
            <Button quiet>Voir l’offre d’origine</Button>
            <Button danger>Annuler le run</Button>
          </>
        }
      />
      <div className="co-analysis-v2">
        <section className="co-stack">
          <section className="co-panel co-run-progress">
            <header>
              <h2>Progression du run</h2>
              <code>≈ 50 s restantes</code>
            </header>
            <progress max="100" value="42" />
            <ol>
              {[
                ['check_circle', 'Offre récupérée et nettoyée', '1 648 mots'],
                ['check_circle', '14 exigences identifiées', '5 critiques'],
                ['autorenew', 'Recherche entreprise', '4 sources lues'],
                ['radio_button_unchecked', 'Appariement des preuves', ''],
                ['radio_button_unchecked', 'Rédaction des livrables', ''],
                ['radio_button_unchecked', 'Vérification factuelle', ''],
              ].map(([icon, title, meta], index) => (
                <li
                  className={index < 2 ? 'done' : index === 2 ? 'active' : ''}
                  key={title}
                >
                  <Icon>{icon}</Icon>
                  <span>{title}</span>
                  <small>{meta}</small>
                </li>
              ))}
            </ol>
          </section>
          <section>
            <div className="co-section-title">
              <h2>Déjà lisible</h2>
              <small>confirmé pendant que ça tourne</small>
            </div>
            <div className="co-readable-grid">
              <article className="co-panel">
                <h3>Exigences critiques</h3>
                <ul>
                  <li>Kubernetes multi-cluster</li>
                  <li>Observabilité end-to-end</li>
                  <li>Réduction du coût cloud</li>
                  <li>Astreinte partagée</li>
                  <li>Go ou Rust en production</li>
                </ul>
              </article>
              <article className="co-panel">
                <h3>À confirmer par vous</h3>
                <dl>
                  <div>
                    <dt>Fourchette 90–110 k€ détectée</dt>
                    <dd>Garder</dd>
                  </div>
                  <div>
                    <dt>Contrat CDI plein temps</dt>
                    <dd>Garder</dd>
                  </div>
                  <div>
                    <dt>Remote 100 % ambigu</dt>
                    <dd>Préciser</dd>
                  </div>
                </dl>
              </article>
            </div>
          </section>
          <div className="co-note">
            <Icon>tune</Icon>Vous pouvez déjà faire le tri en amont : les agents
            en tiendront compte à l’étape de rédaction.
            <Button quiet>Cadrer</Button>
          </div>
        </section>
        <aside className="co-stack co-analysis-aside">
          <section className="co-panel">
            <h2>Ce que l’agent a trouvé</h2>
            <ul className="co-checklist">
              <li className="done">Série A de 18 M€ en mars 2026</li>
              <li className="done">Équipe technique de 23 personnes</li>
              <li className="done">
                Blog d’ingénierie : migration Go en cours
              </li>
              <li className="done">Recherche des signaux de recrutement…</li>
            </ul>
          </section>
          <section className="co-panel co-fit-score">
            <span>Prédiction d’adéquation</span>
            <strong>0,79</strong>
            <small>estimation provisoire</small>
            <p>
              Basée sur les exigences seules. L’appariement des preuves n’a pas
              encore tourné.
            </p>
          </section>
          <section className="co-dark-callout">
            <Icon>notifications_active</Icon>
            <strong>Vous prévenir</strong>
            <span>
              Une notification quand la revue est prête à être tranchée.
            </span>
            <label>
              <input defaultChecked type="checkbox" /> Email + notification
              navigateur
            </label>
          </section>
          <Button quiet>Ouvrir une autre candidature</Button>
          <small className="co-centered">
            Le run continue en arrière-plan.
          </small>
        </aside>
      </div>
    </AppShell>
  );
}

function ReviewScreen() {
  return (
    <DossierShell
      active="Exigences ↔ preuves"
      state={<Badge tone="warn">En attente de l’humain</Badge>}
    >
      <div className="co-review-layout">
        <aside className="co-run-steps">
          <h2>Run 8f2c</h2>
          {[
            ['Lecture de l’offre', '7 s'],
            ['Recherche entreprise', '18 s'],
            ['Appariement des preuves', '15 s'],
            ['Composition des livrables', '31 s'],
            ['Revue factuelle', '22 s'],
            ['Revue confidentialité', '9 s'],
          ].map(([label, time], i) => (
            <div key={label}>
              <Icon>{i === 4 ? 'gpp_maybe' : 'check_circle'}</Icon>
              <span>
                <strong>{label}</strong>
                <small>
                  {i === 4 ? '3 problèmes · 1 bloquant' : 'étape enregistrée'}
                </small>
              </span>
              <b>{time}</b>
            </div>
          ))}
          <dl>
            <div>
              <dt>Durée totale</dt>
              <dd>1 m 42 s</dd>
            </div>
            <div>
              <dt>Coût</dt>
              <dd>0,18 €</dd>
            </div>
          </dl>
        </aside>
        <section className="co-review">
          <header>
            <div>
              <p>Revue avant publication</p>
              <h1>3 modifications proposées</h1>
              <span>1 bloque la publication</span>
            </div>
            <Button quiet>Tout refuser</Button>
            <Button>Accepter les 2 sûres</Button>
          </header>
          <article className="blocking">
            <Badge tone="crit">Bloquant</Badge>
            <h2>Chiffre non soutenu par la preuve</h2>
            <small>page privée · Ouverture · claim #12</small>
            <div className="co-diff">
              <section>
                <p>Version actuelle</p>
                <strong>
                  J’ai réduit de 42 % le temps de build sur un monorepo de 340
                  services.
                </strong>
              </section>
              <section>
                <p>Proposition sourcée</p>
                <strong>
                  J’ai ramené le temps de build de 11 à 7 minutes (p50) sur un
                  monorepo de 340 services.
                </strong>
              </section>
            </div>
            <div className="co-proof">
              <Icon>description</Icon>
              <span>
                corvid_postmortem.md · §4
                <small>« build p50 : 11m → 7m » · importé le 12/03/2024</small>
              </span>
              <Button quiet>Inspecter</Button>
            </div>
            <footer>
              <Button quiet>Refuser</Button>
              <Button quiet>Éditer</Button>
              <Button>Accepter</Button>
            </footer>
          </article>
          <ClaimRow
            tone="warn"
            label="Reformulation"
            text="« passionné par la robotique » → « trois ans sur des systèmes temps réel embarqués »."
            action="Accepter"
          />
          <ClaimRow
            tone="crit"
            label="Sans source"
            text="« Divisé les coûts d’infrastructure par deux » — retirer ou rattacher un document."
            action="Rattacher"
          />
          <div className="co-sticky-gate">
            <Icon>lock</Icon>
            <span>
              <strong>La publication reste bloquée</strong>
              <small>
                Career OS ne crée aucun lien avant votre validation explicite.
              </small>
            </span>
            <Button>Valider et créer le lien</Button>
          </div>
        </section>
      </div>
    </DossierShell>
  );
}

function ImportScreen() {
  return (
    <AppShell path="/memory/import">
      <PageHeader
        eyebrow="Mise en place · 3 étapes sur 4"
        title="Constituer votre mémoire"
        copy="Tout ce que vous déposez devient une preuve datée, rattachable à une affirmation."
        actions={
          <Button>
            Continuer <Icon>arrow_forward</Icon>
          </Button>
        }
      />
      <div className="co-import-grid">
        <section className="co-stack">
          <div className="co-upload">
            <Icon>upload_file</Icon>
            <h2>Déposez CV, post-mortems, reviews, specs</h2>
            <p>PDF, DOCX, Markdown, images · 25 Mo par fichier</p>
            <Button>Parcourir</Button>
            <Button quiet>Coller une URL</Button>
          </div>
          <section className="co-panel">
            <div className="co-section-title">
              <h2>En cours de traitement</h2>
              <Badge tone="accent">4 fichiers · 2 terminés</Badge>
            </div>
            {[
              [
                'autorenew',
                'corvid_postmortem.md',
                'extraction · 6 affirmations trouvées',
              ],
              [
                'check',
                'cv_2024.pdf',
                '6 expériences · 14 affirmations · 2 dates à confirmer',
              ],
              [
                'check',
                'review_q2.pdf',
                '4 affirmations · marquées confidentiel',
              ],
              [
                'content_copy',
                'notes_migration.md',
                '3 affirmations en doublon',
              ],
            ].map(([icon, file, meta]) => (
              <div className="co-file-row" key={file}>
                <Icon>{icon}</Icon>
                <span>
                  <strong>{file}</strong>
                  <small>{meta}</small>
                </span>
                {file === 'cv_2024.pdf' ? <Button quiet>Relire</Button> : null}
              </div>
            ))}
            <div className="co-note">
              <Icon>insights</Icon>24 affirmations extraites, dont 18 avec un
              chiffre. Les 6 autres seront marquées « déclaré » jusqu’à ce
              qu’une preuve les couvre.
            </div>
          </section>
        </section>
        <aside className="co-stack">
          <section className="co-panel">
            <h2>Connecteurs</h2>
            {[
              ['badge', 'LinkedIn', 'Lié'],
              ['code', 'GitHub', 'Lié'],
              ['drive_folder_upload', 'Google Drive', 'Lier'],
              ['rss_feed', 'Blog / articles', 'Lier'],
            ].map(([icon, label, state]) => (
              <div className="co-connector" key={label}>
                <Icon>{icon}</Icon>
                <span>{label}</span>
                <button>{state}</button>
              </div>
            ))}
          </section>
          <section className="co-panel">
            <h2>Règles d’extraction</h2>
            <label className="co-toggle">
              <input defaultChecked type="checkbox" />
              Exiger une date par preuve
            </label>
            <label className="co-toggle">
              <input defaultChecked type="checkbox" />
              Signaler les chiffres sans source
            </label>
            <label className="co-toggle">
              <input type="checkbox" />
              Anonymiser les noms de clients
            </label>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}

function PageEditorScreen() {
  return (
    <DossierShell
      active="Livrables"
      state={<Badge tone="warn">Brouillon v4 · non publiée</Badge>}
    >
      <div className="co-editor">
        <aside className="co-section-list">
          <h2>
            Sections <button>+</button>
          </h2>
          {[
            ['01', 'Ouverture', '2 affirmations', 'warn'],
            ['02', 'Pourquoi Nimbus', '3 affirmations', 'ok'],
            ['03', 'Preuves détaillées', '6 affirmations', 'crit'],
            ['04', '30/60/90 jours', '1 affirmation', 'ok'],
          ].map(([n, l, m, t]) => (
            <button className={n === '01' ? 'active' : ''} key={n}>
              <Icon>drag_indicator</Icon>
              <span>
                <strong>
                  {n} · {l}
                </strong>
                <small>{m}</small>
              </span>
              <Badge tone={t as Tone}>{t === 'ok' ? '' : '!'}</Badge>
            </button>
          ))}
          <dl>
            <div>
              <dt>Affirmations</dt>
              <dd>12</dd>
            </div>
            <div>
              <dt>Sourcées</dt>
              <dd>11</dd>
            </div>
            <div>
              <dt>Temps de lecture</dt>
              <dd>3 min</dd>
            </div>
          </dl>
        </aside>
        <article className="co-page-document">
          <p>Pour Nimbus Robotics · équipe Fleet Platform</p>
          <h1>
            Faire tenir une flotte de 12 000 robots sur une plateforme opérable
            par trois personnes.
          </h1>
          <p>
            Votre annonce insiste sur la fiabilité du déploiement à grande
            échelle et sur une équipe volontairement petite. C’est le problème
            que j’ai porté chez Corvid pendant trois ans.
          </p>
          <p>
            J’ai{' '}
            <mark>
              réduit de 42 % le temps de build sur un monorepo de 340 services
            </mark>
            , et ramené le déploiement d’un cycle hebdomadaire à quatre fois par
            jour.
          </p>
          <div className="co-inline-warning">
            <Icon>gpp_maybe</Icon>
            <span>Le chiffre dépasse la preuve rattachée.</span>
            <Button>Corriger</Button>
          </div>
          <p>
            Le point commun avec Fleet Platform : la contrainte n’était pas la
            technique mais la charge cognitive des équipes clientes. J’ai écrit
            l’outillage, formé l’équipe SRE, puis je l’ai retiré de mes mains.
          </p>
          <Button quiet>
            <Icon>add</Icon>Ajouter un paragraphe
          </Button>
        </article>
        <aside className="co-proof-inspector">
          <p>Affirmation sélectionnée</p>
          <h2>« réduit de 42 % le temps de build »</h2>
          <Badge tone="warn">confiance 0,41</Badge>
          <div className="co-proof">
            <Icon>description</Icon>
            <span>
              corvid_postmortem.md · §4
              <small>« build p50 : 11 min → 7 min, sur 7 mois »</small>
            </span>
          </div>
          <h3>Actions</h3>
          <button>Remplacer par « 11 → 7 min »</button>
          <button>Rattacher une autre preuve</button>
          <button>Retirer la phrase</button>
          <label className="co-toggle">
            <input defaultChecked type="checkbox" />
            Autoriser l’inspection des preuves
          </label>
        </aside>
      </div>
    </DossierShell>
  );
}

function LinksScreen() {
  const { locale } = useI18n();
  const [publications, setPublications] = useState<PublicationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string>();
  const [revokeError, setRevokeError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void readPublications(controller.signal)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const body = (await response.json()) as {
          publications?: PublicationSummary[];
        };
        setPublications(body.publications ?? []);
      })
      .catch(() => setPublications([]))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);
  const selected =
    publications.find((item) => item.isCurrent) ?? publications[0];
  const active = publications.filter((item) => item.status === 'active');
  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(value))
      : '—';

  async function revoke(publicationId: string) {
    if (
      !window.confirm(
        locale === 'fr'
          ? 'Révoquer ce lien maintenant ? Son accès sera coupé immédiatement.'
          : 'Revoke this link now? Access will be cut off immediately.',
      )
    )
      return;
    setRevoking(publicationId);
    setRevokeError(false);
    try {
      const response = await revokePublication(publicationId);
      if (!response.ok) throw new Error();
      setPublications((current) =>
        current.map((item) =>
          item.publicationId === publicationId
            ? {
                ...item,
                isCurrent: false,
                revokedAt: new Date().toISOString(),
                status: 'revoked',
              }
            : item,
        ),
      );
    } catch {
      setRevokeError(true);
    } finally {
      setRevoking(undefined);
    }
  }

  return (
    <AppShell
      path="/links"
      aside={
        <section className="co-stack">
          <h2>Mesures de la page</h2>
          {selected ? (
            <>
              <Company
                name={selected.company}
                initials={initials(selected.company)}
                sub={`Version ${selected.version}`}
              />
              <div className="co-activity">
                <Icon>first_page</Icon>
                <span>
                  <strong>Première ouverture</strong>
                  <small>{date(selected.firstOpenedAt)}</small>
                </span>
              </div>
              <div className="co-activity">
                <Icon>schedule</Icon>
                <span>
                  <strong>Dernière ouverture</strong>
                  <small>{date(selected.lastOpenedAt)}</small>
                </span>
              </div>
              <div className="co-note">
                <Icon>privacy_tip</Icon>Ces compteurs n’identifient pas le
                lecteur et ne prouvent pas son intérêt.
              </div>
            </>
          ) : (
            <p>{loading ? 'Chargement…' : 'Aucune page publiée.'}</p>
          )}
        </section>
      }
    >
      <PageHeader
        title="Liens privés"
        copy="Un lien par entreprise, révocable, avec journal d’accès. Aucune page n’est indexable."
        actions={
          <Link className="co-button" href="/applications">
            <Icon>add_link</Icon>Nouveau lien
          </Link>
        }
      />
      <div className="co-stats">
        <Stat icon="link" value={String(active.length)} label="Liens actifs" />
        <Stat
          icon="visibility"
          value={String(
            publications.reduce((sum, item) => sum + item.opens, 0),
          )}
          label="Ouvertures totales"
        />
        <Stat
          icon="description"
          value={String(
            publications.reduce((sum, item) => sum + item.sections, 0),
          )}
          label="Sections consultées"
        />
        <Stat
          icon="visibility_off"
          value={String(publications.filter((item) => item.opens === 0).length)}
          label="Jamais ouverts"
          tone="muted"
        />
      </div>
      <div className="co-publication-table">
        <DataTable
          headers={[
            'Destinataire',
            'Ouvertures',
            'Sections',
            'Actions',
            'CV',
            'Accès',
          ]}
          rows={publications.map((item) => [
            <Company
              key={item.publicationId}
              name={item.company}
              initials={initials(item.company)}
              sub={`${item.role} · v${item.version} · ${item.status}`}
            />,
            String(item.opens),
            String(item.sections),
            String(item.actions),
            String(item.downloads),
            item.status === 'active' ? (
              <Button
                danger
                disabled={revoking === item.publicationId}
                onClick={() => void revoke(item.publicationId)}
              >
                {revoking === item.publicationId ? 'Révocation…' : 'Révoquer'}
              </Button>
            ) : (
              <Badge>{item.status === 'revoked' ? 'Révoqué' : 'Expiré'}</Badge>
            ),
          ])}
        />
      </div>
      {revokeError ? (
        <p className="co-error" role="alert">
          La révocation a échoué. Réessayez.
        </p>
      ) : null}
      <div className="co-note">
        <Icon>policy</Icon>Aucun fingerprint, aucune adresse IP et aucun
        user-agent ne sont enregistrés.
      </div>
    </AppShell>
  );
}

function Company({
  name,
  initials,
  sub,
}: {
  name: string;
  initials: string;
  sub: string;
}) {
  return (
    <span className="co-company">
      <i>{initials}</i>
      <span>
        <strong>{name}</strong>
        <small>{sub}</small>
      </span>
    </span>
  );
}
function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="co-table">
      <div className="co-table-head">
        {headers.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      {rows.map((row, i) => (
        <div className="co-table-row" key={i}>
          {row.map((cell, j) => (
            <span key={j}>{cell}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

function InsightsScreen() {
  const { locale } = useI18n();
  const [insights, setInsights] = useState<ApplicationInsights>();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    const controller = new AbortController();
    void readApplicationInsights(controller.signal)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setInsights(applicationInsightsSchema.parse(await response.json()));
        setState('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('error');
      });
    return () => controller.abort();
  }, []);
  const copy =
    locale === 'fr'
      ? {
          intro:
            'Des tendances descriptives tirées de vos candidatures et événements enregistrés.',
          total: 'Candidatures suivies',
          coverage: 'Avec une réponse enregistrée',
          interviews: 'Entretiens enregistrés',
          outcomes: 'Résultats enregistrés',
          trend: 'Activité sur 8 semaines',
          responses: 'Réponses',
          noActivity: 'Aucune activité enregistrée sur cette période.',
          basis: 'Base de lecture',
          sent: 'candidatures marquées envoyées ou à une étape ultérieure',
          answered: 'ont au moins une réponse enregistrée',
          boundary:
            'Ces chiffres décrivent vos données. Ils n’attribuent aucune réponse à une page privée, une preuve, un wording ou une action des agents.',
          loading: 'Calcul des tendances…',
          error: 'Les tendances ne peuvent pas être chargées.',
        }
      : {
          intro:
            'Descriptive trends from your recorded applications and timeline events.',
          total: 'Tracked applications',
          coverage: 'With a recorded response',
          interviews: 'Recorded interviews',
          outcomes: 'Recorded outcomes',
          trend: 'Activity over 8 weeks',
          responses: 'Responses',
          noActivity: 'No activity was recorded during this period.',
          basis: 'Reading basis',
          sent: 'applications marked sent or at a later stage',
          answered: 'have at least one recorded response',
          boundary:
            'These figures describe your data. They do not attribute any response to a private page, evidence item, wording choice, or agent action.',
          loading: 'Calculating trends…',
          error: 'Trends could not be loaded.',
        };
  const maximum = Math.max(
    1,
    ...(insights?.weekly.map(
      (week) => week.responses + week.interviews + week.outcomes,
    ) ?? [1]),
  );
  return (
    <AppShell path="/insights">
      <PageHeader title="Insights" copy={copy.intro} />
      {state === 'loading' ? <p>{copy.loading}</p> : null}
      {state === 'error' ? (
        <p className="co-error" role="alert">
          {copy.error}
        </p>
      ) : null}
      <div className="co-stats">
        <Stat
          icon="trending_up"
          value={String(insights?.totalApplications ?? '—')}
          label={copy.total}
        />
        <Stat
          icon="mark_email_read"
          value={
            insights?.responseCoveragePct === null || !insights
              ? '—'
              : `${insights.responseCoveragePct}%`
          }
          label={copy.coverage}
        />
        <Stat
          icon="record_voice_over"
          value={String(insights?.interviews ?? '—')}
          label={copy.interviews}
        />
        <Stat
          icon="flag"
          value={String(insights?.outcomes ?? '—')}
          label={copy.outcomes}
        />
      </div>
      <div className="co-insights-grid">
        <section className="co-panel">
          <h2>{copy.trend}</h2>
          <div className="co-insight-weeks">
            {insights?.weekly.map((week) => {
              const total = week.responses + week.interviews + week.outcomes;
              return (
                <div key={week.weekStart}>
                  <span title={`${total}`}>
                    <i style={{ height: `${(total / maximum) * 100}%` }} />
                  </span>
                  <small>
                    {new Intl.DateTimeFormat(locale, {
                      day: 'numeric',
                      month: 'short',
                    }).format(new Date(week.weekStart))}
                  </small>
                </div>
              );
            })}
          </div>
          {insights &&
          !insights.weekly.some(
            (week) => week.responses + week.interviews + week.outcomes,
          ) ? (
            <p className="co-insight-empty">{copy.noActivity}</p>
          ) : null}
        </section>
        <section className="co-panel">
          <h2>{copy.basis}</h2>
          <p className="co-insight-basis">
            <strong>{insights?.applicationsWithResponse ?? '—'}</strong>{' '}
            {copy.answered}
          </p>
          <p className="co-insight-basis">
            <strong>{insights?.sentOrLater ?? '—'}</strong> {copy.sent}
          </p>
          <div className="co-note">
            <Icon>info</Icon>
            {copy.boundary}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function InterviewMemoryScreen() {
  const localize = useLocalizer(activeFrontMessages);
  return localize(
    <main className="co-guided-shell">
      <aside className="co-guided-nav">
        <header>
          <Link href="/memory">
            <Icon>close</Icon>
          </Link>
          <span>
            <strong>Entretien guidé</strong>
            <small>Corvid · 2021-2024</small>
          </span>
        </header>
        <section className="co-guided-progress">
          <span>
            <strong>Progression</strong>
            <code>4 / 7</code>
          </span>
          <i>
            <b />
          </i>
          <small>≈ 4 min restantes · vous pouvez sortir à tout moment</small>
        </section>
        <nav aria-label="Progression de l'entretien">
          {[
            ['check_circle', 'Périmètre du rôle', 'done'],
            ['check_circle', 'Ce que vous avez décidé', 'done'],
            ['check_circle', 'Résultats mesurés', 'done'],
            ['radio_button_checked', 'Ce qui a échoué', 'active'],
            ['radio_button_unchecked', "Travail d'équipe", ''],
            ['radio_button_unchecked', 'Choix techniques', ''],
            ['radio_button_unchecked', 'Preuves à retrouver', ''],
          ].map(([icon, label, state]) => (
            <span className={state} key={label}>
              <Icon>{icon}</Icon>
              {label}
            </span>
          ))}
        </nav>
        <div className="co-guided-principle">
          <strong>
            <Icon>edit_note</Icon>Vos mots, pas les siens
          </strong>
          <p>
            L’agent reformule pour la clarté, jamais pour embellir. Vous validez
            chaque phrase avant qu’elle n’entre dans la mémoire.
          </p>
        </div>
      </aside>

      <section className="co-guided-stage">
        <div className="co-guided-content">
          <div className="co-guided-question">
            <span>
              <Icon>record_voice_over</Icon>
            </span>
            <div>
              <small>Question 4 sur 7</small>
              <h1>
                Sur la migration du monorepo, qu’est-ce qui n’a pas marché comme
                prévu ?
              </h1>
              <p>
                Les recruteurs techniques lisent les échecs comme un signe de
                maturité. Un exemple concret suffit, sans conclusion morale.
              </p>
            </div>
          </div>
          <blockquote>
            Le premier découpage était trop fin : on a créé 40 services qu’il a
            fallu refusionner six mois plus tard. J’avais suivi la structure de
            l’organisation plutôt que les frontières de données. On a perdu à
            peu près un trimestre.
          </blockquote>
          <div className="co-guided-extracts">
            <span>
              <Icon>auto_awesome</Icon>
            </span>
            <div>
              <p>
                Deux affirmations extraites. Relisez-les avant qu’elles
                rejoignent la mémoire :
              </p>
              <article>
                <header>
                  <Badge tone="warn">Déclaré</Badge>
                  <small>aucune preuve rattachée</small>
                </header>
                <strong>
                  Premier découpage trop fin : 40 services refusionnés après six
                  mois, faute d’avoir suivi les frontières de données.
                </strong>
                <footer>
                  <Button>Garder</Button>
                  <Button quiet>Reformuler</Button>
                  <button type="button">Jeter</button>
                </footer>
              </article>
              <article>
                <header>
                  <Badge tone="accent">À sourcer</Badge>
                  <small>un chiffre à confirmer</small>
                </header>
                <strong>
                  Retard estimé à un trimestre sur le programme de migration.
                </strong>
                <button className="co-evidence-search" type="button">
                  <Icon>search</Icon>
                  <span>Un document daté mentionne-t-il ce retard ?</span>
                  <b>Chercher</b>
                </button>
              </article>
            </div>
          </div>
        </div>
        <footer className="co-guided-composer">
          <label>
            <span>Répondre en quelques phrases…</span>
            <Icon>mic</Icon>
            <Icon>attach_file</Icon>
          </label>
          <Button quiet>Passer</Button>
          <Button>
            Question suivante <Icon>arrow_forward</Icon>
          </Button>
        </footer>
      </section>

      <aside className="co-guided-session">
        <header>
          <h2>Récolté dans cette session</h2>
          <Badge tone="accent">9</Badge>
        </header>
        <div className="co-guided-claims">
          {[
            [
              'ok',
              'Vérifié',
              'Équipe de 3 sur la plateforme, 9 utilisateurs internes.',
            ],
            [
              'ok',
              'Vérifié',
              'Décision de garder Bazel malgré la pression pour Nx.',
            ],
            ['warn', 'Déclaré', '40 services refusionnés après six mois.'],
            ['warn', 'Déclaré', 'Retard d’un trimestre sur la migration.'],
          ].map(([tone, label, text]) => (
            <article key={text}>
              <Badge tone={tone as Tone}>{label}</Badge>
              <p>{text}</p>
            </article>
          ))}
        </div>
        <div className="co-note">
          <Icon>lightbulb</Icon>
          <span>
            <strong>Preuves à retrouver</strong>Trois affirmations attendent un
            document. L’agent proposera une liste de fichiers à chercher à la
            fin.
          </span>
        </div>
        <footer>
          <Button>Enregistrer et sortir</Button>
          <small>Rien n’est ajouté à la mémoire sans votre « Garder ».</small>
        </footer>
      </aside>
    </main>,
  );
}

function InterviewPrepScreen({ debrief = false }: { debrief?: boolean }) {
  if (debrief) return <DebriefScreen />;
  return (
    <AppShell
      path="/interviews/demo"
      sidebarContext={<InterviewSchedule />}
      sidebarFooter={null}
    >
      <section className="co-prep">
        <header className="co-prep-header">
          <i>VL</i>
          <div>
            <span>
              <h1>Entretien technique · Vantage Labs</h1>
              <Badge tone="accent">dans 5 jours</Badge>
            </span>
            <p>8 sept. · 14:00 - 15:00 · Visio · Research Engineer</p>
          </div>
          <nav>
            <Button quiet>
              <Icon>calendar_add_on</Icon>
            </Button>
            <Button quiet>Ouvrir le dossier</Button>
            <Button>
              <Icon>print</Icon>Fiche d’entretien
            </Button>
          </nav>
        </header>
        <nav className="co-prep-tabs" aria-label="Sections de l'entretien">
          <button className="active" type="button">
            Préparation
          </button>
          <button type="button">Interlocuteurs</button>
          <button type="button">Ma page privée</button>
          <button type="button">Débrief</button>
        </nav>
        <div className="co-prep-layout">
          <section className="co-prep-main">
            <header>
              <h2>Questions probables</h2>
              <span>déduites de l’offre et du profil des interlocuteurs</span>
            </header>
            <article className="co-prep-question">
              <header>
                <Badge tone="accent">Très probable</Badge>
                <small>3 preuves disponibles</small>
              </header>
              <h3>
                « Comment décidez-vous du découpage d’un système en services ? »
              </h3>
              <div>
                <small>Appuis dans votre mémoire</small>
                <p>
                  <Icon>verified</Icon>Frontières de données &gt; structure de
                  l’organisation, appris à la dure sur Corvid
                </p>
                <p>
                  <Icon>verified</Icon>40 services refusionnés après six mois
                </p>
              </div>
            </article>
            <article className="co-prep-question">
              <header>
                <Badge tone="accent">Très probable</Badge>
                <small>chiffre à citer exactement</small>
              </header>
              <h3>
                « Parlez-moi d’un gain de performance que vous avez mesuré. »
              </h3>
              <div className="single">
                <p>
                  <Icon>description</Icon>Build p50 : 11 → 7 min. Dites les
                  minutes, pas le pourcentage.
                </p>
                <Link href="/memory">Voir</Link>
              </div>
            </article>
            <article className="co-prep-question weak">
              <header>
                <Badge tone="crit">Point faible</Badge>
                <small>aucune preuve à opposer</small>
              </header>
              <h3>« Combien de personnes avez-vous managées ? »</h3>
              <p>
                Réponse préparée : tech lead de 3 personnes sans lien
                hiérarchique, revue de code et astreinte partagées. Ne pas
                gonfler, c’est vérifiable auprès de vos anciens collègues.
              </p>
            </article>
            <header>
              <h2>Vos questions à eux</h2>
              <button type="button">Ajouter</button>
            </header>
            <div className="co-prep-own-questions">
              <p>
                <Icon>help</Icon>Qui décide aujourd’hui d’un rollback en
                production, et en combien de temps ?<Icon>drag_indicator</Icon>
              </p>
              <p>
                <Icon>help</Icon>L’équipe Research publie-t-elle, ou tout
                reste-t-il interne ?<Icon>drag_indicator</Icon>
              </p>
            </div>
          </section>
          <aside className="co-prep-aside">
            <h2>Interlocuteurs</h2>
            <article>
              <Company
                initials="SM"
                name="Sarah Meunier"
                sub="Research Lead · 4 ans"
              />
              <p>
                A publié sur l’apprentissage par renforcement appliqué à la
                logistique. Aime les questions de méthode.
              </p>
            </article>
            <article>
              <Company
                initials="JP"
                name="Julien Pastor"
                sub="Staff Engineer"
              />
              <p>
                Mainteneur d’un projet OSS proche du vôtre. Terrain commun sur
                ROS2.
              </p>
            </article>
            <div className="co-prep-simulation">
              <strong>
                <Icon>psychology</Icon>Simulation
              </strong>
              <p>
                Vingt minutes de questions posées par un agent, avec vos preuves
                en arbitre. Le compte-rendu reste privé.
              </p>
              <Button>Lancer une simulation</Button>
            </div>
            <section>
              <h2>Après l’entretien</h2>
              <p>
                Le débrief alimente votre mémoire : ce qu’on vous a demandé, ce
                que vous n’avez pas su prouver.
              </p>
              <Button quiet>Préparer le débrief</Button>
            </section>
          </aside>
        </div>
      </section>
    </AppShell>
  );
}

function InterviewSchedule() {
  const localize = useLocalizer(activeFrontMessages);
  return localize(
    <div className="co-interview-schedule">
      <p className="co-nav-label">À venir</p>
      <Link className="active" href="/interviews/demo">
        <time>
          <b>08</b>
          <small>sept</small>
        </time>
        <span>
          <strong>Vantage Labs</strong>
          <small>technique · 14:00</small>
        </span>
      </Link>
      <Link href="/interviews/demo">
        <time>
          <b>15</b>
          <small>sept</small>
        </time>
        <span>
          <strong>Atlas Health</strong>
          <small>manager · à confirmer</small>
        </span>
      </Link>
      <p className="co-nav-label">Passés</p>
      <Link href="/interviews/demo/debrief">
        <Icon>edit_note</Icon>
        <span>Helix · débrief à écrire</span>
      </Link>
      <Link href="/interviews/demo/debrief">
        <Icon>check_circle</Icon>
        <span>Orbital · débriefé</span>
      </Link>
    </div>,
  );
}

function AssetsScreen() {
  return (
    <AppShell
      path="/assets"
      sidebarContext={
        <>
          <p className="co-nav-label">Types</p>
          <div className="co-sidebar-sources">
            {[
              ['picture_as_pdf', 'CV', '4'],
              ['web', 'Gabarits de page', '3'],
              ['short_text', 'Blocs de texte', '11'],
              ['mail', 'Emails types', '5'],
              ['folder_zip', 'Portfolio', '2'],
            ].map(([icon, label, count]) => (
              <Link href="/assets" key={label}>
                <Icon>{icon}</Icon>
                <span>{label}</span>
                <b>{count}</b>
              </Link>
            ))}
          </div>
        </>
      }
      sidebarFooter={
        <div className="co-sidebar-card">
          <strong>Règle d’or</strong>
          <span>
            Un asset ne contient jamais d’affirmation non sourcée. Les gabarits
            refusent de se générer sinon.
          </span>
        </div>
      }
    >
      <PageHeader
        title="Assets"
        copy="Ce qui se réutilise. Chaque asset garde le lien vers les preuves qu’il cite."
        actions={
          <>
            <Button quiet>
              <Icon>upload</Icon>Importer
            </Button>
            <Button>
              <Icon>add</Icon>Nouvel asset
            </Button>
          </>
        }
      />
      <div className="co-assets-layout">
        <section className="co-assets-main">
          <div className="co-assets-toolbar">
            <div className="co-segment">
              <button className="active">CV</button>
              <button>Gabarits</button>
              <button>Blocs</button>
              <button>Emails</button>
            </div>
            <span>Trié par utilisation</span>
          </div>
          <div className="co-cv-assets">
            {[
              [
                'CV — infra / plateforme',
                'v7 · utilisé 9 fois · 14 affirmations sourcées',
                'base',
              ],
              [
                'CV — recherche',
                'v3 · utilisé 2 fois · publications en tête',
                '',
              ],
              [
                'CV — Nimbus',
                'Cite une affirmation en attente d’arbitrage.',
                'warning',
              ],
            ].map(([title, meta, state]) => (
              <article
                className={state === 'warning' ? 'warning' : ''}
                key={title}
              >
                <div className="co-cv-preview">
                  <i />
                  <i />
                  <hr />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <section>
                  <header>
                    <h2>{title}</h2>
                    {state === 'base' ? (
                      <Badge tone="ok">base</Badge>
                    ) : state === 'warning' ? (
                      <Icon>gpp_maybe</Icon>
                    ) : null}
                  </header>
                  <p>{meta}</p>
                  <footer>
                    <Button>
                      {state === 'warning' ? 'Corriger' : 'Ouvrir'}
                    </Button>
                    {state !== 'warning' ? (
                      <Button quiet>Dupliquer</Button>
                    ) : null}
                  </footer>
                </section>
              </article>
            ))}
          </div>
          <div className="co-section-title">
            <h2>Blocs de texte les plus réutilisés</h2>
            <Link href="/assets">Tout voir</Link>
          </div>
          <div className="co-reusable-copy">
            {[
              [
                'verified',
                'Migration monorepo · version courte',
                '« Build ramené de 11 à 7 minutes sur 340 services, déploiement 4×/jour. »',
                '7 usages',
              ],
              [
                'verified',
                'Open source ROS2',
                '« Mainteneur d’un pont utilisé en production par quatre entreprises. »',
                '5 usages',
              ],
              [
                'rule',
                'Gap management · formulation assumée',
                '« Tech lead de trois personnes, sans lien hiérarchique. »',
                '4 usages',
              ],
            ].map(([icon, title, text, uses]) => (
              <article key={title}>
                <Icon>{icon}</Icon>
                <span>
                  <strong>{title}</strong>
                  <small>{text}</small>
                </span>
                <code>{uses}</code>
                <Icon>content_copy</Icon>
              </article>
            ))}
          </div>
        </section>
        <aside className="co-assets-side">
          <h2>CV — infra / plateforme</h2>
          <section>
            <h3>Versions</h3>
            <ol>
              <li className="active">
                <strong>v7 · actuelle</strong>
                <span>Chiffre de build corrigé en minutes · aujourd’hui</span>
              </li>
              <li>
                <strong>v6</strong>
                <span>Ajout du pont ROS2 · 28 août</span>
              </li>
              <li>
                <strong>v5</strong>
                <span>Retrait d’une affirmation sans preuve · 12 août</span>
              </li>
            </ol>
            <Link href="/applications/nimbus/versions">
              Comparer deux versions
            </Link>
          </section>
          <section>
            <h3>Preuves citées · 14</h3>
            {[
              ['description', 'corvid_postmortem.md', '4'],
              ['picture_as_pdf', 'cv_2024.pdf', '6'],
              ['code', 'oss/ros2-bridge', '2'],
              ['badge', 'linkedin', '2'],
            ].map(([icon, name, count]) => (
              <p key={name}>
                <Icon>{icon}</Icon>
                <code>{name}</code>
                <span>{count}</span>
              </p>
            ))}
          </section>
          <footer>
            <Button>Exporter en PDF</Button>
            <Button quiet>Définir comme CV de base</Button>
          </footer>
        </aside>
      </div>
    </AppShell>
  );
}

function SettingsNav({ active }: { active: string }) {
  const localize = useLocalizer(activeFrontMessages);
  return localize(
    <aside className="co-settings-nav">
      <Link href="/">
        <Icon>arrow_back</Icon>Retour à l’app
      </Link>
      <p>Réglages</p>
      {[
        ['person', 'Profil', '/settings/profile'],
        ['memory', 'Modèles & agents', '/settings/models'],
        ['shield', 'Confidentialité', '/settings/privacy'],
        ['hub', 'Intégrations', '/settings/integrations'],
        ['payments', 'Abonnement', '/settings/billing'],
        ['import_export', 'Export & suppression', '/settings/data'],
      ].map(([i, l, h]) => (
        <Link className={active === l ? 'active' : ''} href={h} key={l}>
          <Icon>{i}</Icon>
          {l}
        </Link>
      ))}
    </aside>,
  );
}
function SettingsShell({
  active,
  children,
  side,
}: {
  active: string;
  children: ReactNode;
  side?: ReactNode;
}) {
  const localize = useLocalizer(activeFrontMessages);
  return localize(
    <main className="co-settings-shell">
      <SettingsNav active={active} />
      <section>
        <header>
          <Link className="co-brand" href="/">
            <span>
              <i />
            </span>
            <strong>Career OS</strong>
          </Link>
          <span className="co-avatar">MA</span>
        </header>
        <div className="co-settings-content">{children}</div>
      </section>
      {side ? <aside className="co-settings-side">{side}</aside> : null}
    </main>,
  );
}

function ModelsScreen() {
  return (
    <SettingsShell active="Modèles & agents">
      <PageHeader
        title="Modèles & agents"
        copy="Choisissez où chaque tâche s’exécute. Le contenu envoyé à un modèle est toujours visible avant activation."
      />
      <section className="co-panel">
        <h2>Routage actuel</h2>
        {[
          ['Lecture et extraction', 'Local', 'llama-3.3-70b', 'ok'],
          ['Recherche entreprise', 'Cloud', 'Claude Sonnet', 'accent'],
          ['Stratégie', 'Cloud', 'Claude Sonnet', 'accent'],
          ['Composition', 'Local', 'llama-3.3-70b', 'ok'],
          ['Revue factuelle', 'Local', 'règles déterministes', 'ok'],
        ].map(([task, where, model, tone]) => (
          <div className="co-model-row" key={task}>
            <Icon>{where === 'Local' ? 'dns' : 'cloud'}</Icon>
            <span>
              <strong>{task}</strong>
              <small>{model}</small>
            </span>
            <Badge tone={tone as Tone}>{where}</Badge>
            <Button quiet>Configurer</Button>
          </div>
        ))}
      </section>
      <div className="co-two-col">
        <section className="co-panel">
          <h2>Instance</h2>
          <dl>
            <div>
              <dt>Base de données</dt>
              <dd>
                <Badge tone="ok">Opérationnelle</Badge>
              </dd>
            </div>
            <div>
              <dt>Workers</dt>
              <dd>3 / 3 actifs</dd>
            </div>
            <div>
              <dt>Sauvegarde</dt>
              <dd>aujourd’hui 03:00</dd>
            </div>
          </dl>
        </section>
        <section className="co-panel">
          <h2>Limites de dépense</h2>
          <label className="co-toggle">
            <input defaultChecked type="checkbox" />
            Basculer en local au plafond
          </label>
          <label>
            Plafond mensuel
            <input defaultValue="15,00 €" />
          </label>
        </section>
      </div>
    </SettingsShell>
  );
}

function ConflictsScreen() {
  return (
    <AppShell path="/memory/conflicts">
      <PageHeader
        eyebrow="Mémoire pro"
        title="Conflits entre sources"
        copy="Deux informations incompatibles ne sont jamais fusionnées automatiquement."
      />
      <div className="co-conflicts">
        <article>
          <header>
            <Badge tone="warn">Conflit #1</Badge>
            <h2>Taille de l’équipe encadrée : 6 ou 9 personnes ?</h2>
          </header>
          <div className="co-diff">
            <section>
              <p>CV · 12 mars 2024</p>
              <strong>Tech lead d’une équipe de 6 ingénieurs.</strong>
              <Badge tone="ok">Source datée</Badge>
            </section>
            <section>
              <p>LinkedIn · synchronisé hier</p>
              <strong>Led a team of 9 engineers.</strong>
              <Badge tone="warn">Profil public</Badge>
            </section>
          </div>
          <p className="co-note">
            Choisissez la formulation qui décrit exactement votre
            responsabilité. La source écartée reste conservée.
          </p>
          <footer>
            <Button>Retenir 6</Button>
            <Button quiet>Retenir 9</Button>
            <Button quiet>Écrire une autre formulation</Button>
          </footer>
        </article>
        <article>
          <header>
            <Badge tone="warn">Conflit #2</Badge>
            <h2>Durée du projet de migration</h2>
          </header>
          <div className="co-diff">
            <section>
              <p>Post-mortem</p>
              <strong>7 mois</strong>
            </section>
            <section>
              <p>CV</p>
              <strong>9 mois</strong>
            </section>
          </div>
          <footer>
            <Button>Ouvrir les deux sources</Button>
          </footer>
        </article>
      </div>
    </AppShell>
  );
}

function PrivacyScreen() {
  return (
    <SettingsShell active="Confidentialité">
      <PageHeader
        title="Confidentialité des preuves"
        copy="Définissez ce que les agents peuvent lire et ce qu’un recruteur peut inspecter."
      />
      <section className="co-panel">
        <h2>Règles par défaut</h2>
        <div className="co-policy-grid">
          <article>
            <Icon>lock</Icon>
            <h3>Privé</h3>
            <p>
              Utilisable pour vous conseiller, jamais exposé dans un livrable.
            </p>
          </article>
          <article>
            <Icon>visibility</Icon>
            <h3>Inspectable</h3>
            <p>Un extrait daté peut être ouvert depuis une page privée.</p>
          </article>
          <article>
            <Icon>public</Icon>
            <h3>Public</h3>
            <p>Peut être lié intégralement, comme un dépôt open source.</p>
          </article>
        </div>
      </section>
      <section className="co-panel">
        <h2>Preuves sensibles</h2>
        <DataTable
          headers={['Preuve', 'Sensibilité', 'Usages autorisés', '']}
          rows={[
            [
              <Company
                key="postmortem"
                initials="PM"
                name="Post-mortem Corvid"
                sub="document interne"
              />,
              <Badge key="internal" tone="warn">
                Interne
              </Badge>,
              'Conseil · appariement',
              <Button key="edit" quiet>
                Modifier
              </Button>,
            ],
            [
              <Company
                key="review-q2"
                initials="RQ"
                name="Review Q2"
                sub="contient des noms clients"
              />,
              <Badge key="confidential" tone="crit">
                Confidentiel
              </Badge>,
              'Conseil uniquement',
              <Button key="edit" quiet>
                Modifier
              </Button>,
            ],
            [
              <Company
                key="ros2"
                initials="GH"
                name="Pont ROS2"
                sub="dépôt GitHub public"
              />,
              <Badge key="public" tone="ok">
                Public
              </Badge>,
              'Tous',
              <Button key="edit" quiet>
                Modifier
              </Button>,
            ],
          ]}
        />
      </section>
      <div className="co-note">
        <Icon>shield</Icon>Un changement de permission n’altère jamais
        rétroactivement un livrable publié : Career OS demande une nouvelle
        validation.
      </div>
    </SettingsShell>
  );
}

function PublishedScreen() {
  return (
    <AppShell path="/applications">
      <div className="co-publish-topline">
        <span>Candidatures</span>
        <Icon>chevron_right</Icon>
        <strong>Nimbus Robotics</strong>
        <Badge tone="ok">Publié à 14:22</Badge>
      </div>
      <section className="co-publish-success">
        <header>
          <span>
            <Icon>check_circle</Icon>
          </span>
          <div>
            <h1>Votre page privée est en ligne pour Nimbus Robotics.</h1>
            <p>
              Douze affirmations, toutes sourcées. Le lien n’est accessible
              qu’aux personnes à qui vous l’envoyez, et vous pouvez le couper à
              tout instant.
            </p>
          </div>
        </header>
        <div className="co-publish-grid">
          <article className="co-panel">
            <p>Lien privé</p>
            <div className="co-link-copy">
              <Icon>lock</Icon>
              <code>career-os.app/p/8f2c-nimbus</code>
              <Button>Copier</Button>
            </div>
            <dl>
              <div>
                <dt>Expire le 12 oct.</dt>
                <dd>
                  <Icon>schedule</Icon>
                </dd>
              </div>
              <div>
                <dt>Preuves inspectables</dt>
                <dd>
                  <Icon>verified</Icon>
                </dd>
              </div>
            </dl>
            <footer>
              <Link className="co-button" href="/messages">
                Envoyer l’email préparé
              </Link>
              <Button quiet>Message LinkedIn</Button>
            </footer>
          </article>
          <article className="co-panel co-shipped-assets">
            <p>Ce qui part</p>
            <ul>
              <li>
                <Icon>web</Icon>Page privée · 4 sections <b>12 preuves</b>
              </li>
              <li>
                <Icon>description</Icon>CV adapté · 1 page <b>téléchargeable</b>
              </li>
              <li>
                <Icon>fact_check</Icon>Extraits de preuves <b>6 sur 12</b>
              </li>
              <li>
                <Icon>lock</Icon>review_q2.pdf <b className="crit">exclu</b>
              </li>
            </ul>
            <small>
              Les documents « interne » n’ont pas été utilisés, même en
              reformulation.
            </small>
          </article>
        </div>
        <div className="co-publish-memory">
          <Icon>verified</Icon>
          <span>
            <strong>Deux affirmations ont été renforcées au passage</strong>« 11
            → 7 minutes » et « équipe de 3 » sont désormais sourcées dans votre
            mémoire : elles serviront à toutes vos prochaines candidatures.
          </span>
          <Link href="/memory">Voir la mémoire</Link>
        </div>
        <footer>
          <Button>Marquer comme envoyée</Button>
          <Button quiet>Programmer une relance à J+8</Button>
          <Link href="/applications">Retour aux candidatures</Link>
        </footer>
      </section>
    </AppShell>
  );
}

function DebriefScreen() {
  return (
    <AppShell path="/interviews/demo/debrief">
      <PageHeader
        eyebrow="Vantage Labs · entretien terminé hier"
        title="Débrief d’entretien"
        copy="Transformez ce qui s’est passé en mémoire utile, sans réécrire l’histoire."
        actions={<Button>Enregistrer le débrief</Button>}
      />
      <div className="co-two-col">
        <section className="co-stack">
          <section className="co-panel">
            <h2>Ce qui s’est passé</h2>
            {[
              [
                'Question la plus difficile',
                'Comment mesurer la valeur d’un eval offline ?',
              ],
              [
                'Signal positif',
                'Discussion détaillée sur le compromis vitesse / rigueur.',
              ],
              ['À améliorer', 'Réponse trop longue sur l’architecture du MCP.'],
              ['Prochaine étape', 'Tour système avec deux Staff Engineers.'],
            ].map(([l, v]) => (
              <label className="co-field" key={l}>
                <span>{l}</span>
                <textarea defaultValue={v} />
              </label>
            ))}
          </section>
          <section className="co-panel">
            <h2>Questions posées</h2>
            <ClaimRow
              tone="warn"
              label="À creuser"
              text="Comment suivez-vous les coûts de modèles par fonctionnalité ?"
            />
            <ClaimRow
              tone="ok"
              label="Bien répondu"
              text="Quand un agent ne doit-il pas agir seul ?"
            />
          </section>
        </section>
        <aside className="co-stack">
          <section className="co-panel">
            <h2>Nouvelles affirmations · 2</h2>
            <ClaimRow
              tone="warn"
              label="Déclaré"
              text="Participation aux entretiens techniques de recrutement."
            />
            <ClaimRow
              tone="warn"
              label="Déclaré"
              text="Astreinte 1 semaine sur 4 sur la plateforme."
            />
          </section>
          <section className="co-panel">
            <h2>Trou identifié</h2>
            <ClaimRow
              tone="crit"
              label="1"
              text="Impact coût cloud — demandé dans 3 entretiens sur 4, jamais chiffré."
              action="Voir les occurrences"
            />
          </section>
          <section className="co-panel">
            <h2>Email de remerciement</h2>
            <p>Brouillon prêt une fois le chiffre exact retrouvé.</p>
            <Button quiet>Relire le brouillon</Button>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}

function VersionsScreen({ applicationId }: { applicationId: string }) {
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
      active="Versions"
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

function publicationStatus(
  status: PublicationSummary['status'],
  locale: 'en' | 'fr',
) {
  return {
    active: locale === 'en' ? 'active' : 'active',
    expired: locale === 'en' ? 'expired' : 'expirée',
    revoked: locale === 'en' ? 'revoked' : 'révoquée',
  }[status];
}

function opportunityDecisionLabel(value: string, locale: 'en' | 'fr') {
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

function reviewDecisionLabel(value: 'keep' | 'correct', locale: 'en' | 'fr') {
  if (locale === 'en') return value === 'keep' ? 'Kept' : 'Corrected';
  return value === 'keep' ? 'Conservée' : 'Corrigée';
}

function reviewerLabel(value: string, locale: 'en' | 'fr') {
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

function RunsScreen() {
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

function CompanyScreen() {
  return (
    <DossierShell active="Entreprise">
      <div className="co-dossier-content">
        <section className="co-main-column">
          <PageHeader
            eyebrow="Nimbus Robotics"
            title="Dossier entreprise"
            copy="Robotique logistique · Paris, Berlin · 68 personnes · fondée en 2021"
            actions={<Button quiet>Rafraîchir la recherche</Button>}
          />
          <section className="co-panel co-company-summary">
            <p>En une phrase reformulable</p>
            <h2>
              Nimbus déploie des flottes de robots chez des logisticiens tiers ;
              leur difficulté n’est plus la robotique mais l’exploitation
              logicielle à grande échelle avec une équipe réduite.
            </h2>
          </section>
          <section className="co-panel">
            <h2>Signaux datés et sourcés</h2>
            <ClaimRow
              label="Vérifié"
              text="Série B de 40 M€ en juin 2026"
              source="Communiqué officiel + presse spécialisée · 2 sources concordantes"
            />
            <ClaimRow
              label="Vérifié"
              text="4 postes ouverts sur Fleet Platform"
              source="Page carrières · relevé aujourd’hui"
            />
            <ClaimRow
              tone="accent"
              label="3 sources"
              text="Stack : Go, Kubernetes, ROS2"
              source="Offres + dépôts publics + talk du CTO"
            />
            <ClaimRow
              tone="warn"
              label="Hypothèse"
              text="L’équipe Fleet serait de 3 personnes"
              source="Déduit d’un post LinkedIn, à vérifier en entretien"
            />
          </section>
          <div className="co-company-context">
            <section className="co-panel">
              <small>Ce qu’ils disent publiquement</small>
              <p>
                <Icon>format_quote</Icon>« Nous voulons rester une petite équipe
                très outillée. » · CTO, podcast août 2026
              </p>
              <p>
                <Icon>format_quote</Icon>« La fiabilité du déploiement est notre
                principal risque. » · blog ingénierie
              </p>
            </section>
            <section className="co-panel">
              <small>Points de vigilance</small>
              <p>
                <Icon>warning</Icon>Deux départs de l’équipe plateforme en six
                mois.
              </p>
              <p>
                <Icon>warning</Icon>Aucune information publique sur les niveaux
                de rémunération.
              </p>
            </section>
          </div>
        </section>
        <aside className="co-stack co-company-sources">
          <h2>Sources retenues</h2>
          {[
            ['public', 'nimbus.ai/blog', '3 articles · août 2026'],
            ['newspaper', 'Presse spécialisée', 'levée de fonds · juin 2026'],
            ['code', 'github.com/nimbus', '2 dépôts publics'],
            ['podcasts', 'Interview du CTO', 'transcription · 48 min'],
          ].map(([icon, title, copy]) => (
            <article key={title}>
              <Icon>{icon}</Icon>
              <span>
                <strong>{title}</strong>
                <small>{copy}</small>
              </span>
              <Icon>north_east</Icon>
            </article>
          ))}
          <section className="co-panel">
            <small>Écartées · 8</small>
            <p>
              <Icon>block</Icon>Agrégateurs d’offres · contenu recopié
            </p>
            <p>
              <Icon>block</Icon>Fiche société de 2023 · périmée
            </p>
            <p>
              <Icon>block</Icon>Avis salariés anonymes · non vérifiables
            </p>
          </section>
          <div className="co-company-public-only">
            <strong>
              <Icon>shield</Icon>Sources publiques seules
            </strong>
            <p>
              Aucun scraping de profils privés, aucun contact non consenti. Le
              dossier ne contient que ce qu’un candidat pourrait lire lui-même.
            </p>
          </div>
        </aside>
      </div>
    </DossierShell>
  );
}

function MessagesScreen() {
  const localize = useLocalizer(activeFrontMessages);
  return localize(
    <main className="co-messages">
      <aside>
        <Link className="co-brand" href="/">
          <span>
            <i />
          </span>
          <strong>Career OS</strong>
        </Link>
        <h1>Messages</h1>
        <p>4 brouillons · 2 relances dues</p>
        <div className="co-message-tabs">
          <button className="active">À envoyer</button>
          <button>Envoyés</button>
        </div>
        {[
          [
            'NR',
            'Nimbus Robotics',
            'Candidature · Staff Product Engineer',
            'prêt',
          ],
          ['AH', 'Atlas Health', 'Relance après candidature', 'J+8'],
          ['HE', 'Helix', 'Remerciement après entretien', 'attente'],
          ['LU', 'Lumen', 'Relance · jamais ouvert', ''],
        ].map(([i, c, s, t]) => (
          <button className={i === 'NR' ? 'active' : ''} key={i}>
            <i>{i}</i>
            <span>
              <strong>{c}</strong>
              <small>{s}</small>
            </span>
            <Badge tone={t === 'prêt' ? 'ok' : 'warn'}>{t}</Badge>
          </button>
        ))}
        <div className="co-note">
          <Icon>lock</Icon>Aucun envoi automatique. Vous copiez, vous envoyez.
        </div>
      </aside>
      <section>
        <header>
          <Link href="/">
            <Icon>arrow_back</Icon>
          </Link>
          <div>
            <h1 className="co-mobile-title">Messages</h1>
            <strong>Candidature — Staff Product Engineer</strong>
            <small>Email · à Camille Lefort</small>
          </div>
          <div className="co-message-channel">
            <button className="active">Email</button>
            <button>LinkedIn</button>
          </div>
        </header>
        <div className="co-email-fields">
          <label>
            À<input defaultValue="camille@nimbus.ai" />
          </label>
          <label>
            Objet
            <input defaultValue="Staff Product Engineer — Fleet Platform (Marc Aubry)" />
          </label>
        </div>
        <article className="co-email">
          <p>Bonjour Camille,</p>
          <p>
            Votre annonce parle d’une flotte qui grandit vite et d’une équipe
            qui doit rester petite. C’est exactement le problème que j’ai traité
            chez Corvid : temps de build ramené de{' '}
            <mark>11 à 7 minutes sur 340 services</mark>, puis passation
            complète de l’outillage à l’équipe SRE.
          </p>
          <p>
            J’ai préparé une page qui détaille les trois points de votre annonce
            que je peux documenter, avec les sources à l’appui :
          </p>
          <Link href="/p/8f2c-nimbus">
            career-os.app/p/8f2c-nimbus · lien privé
          </Link>
          <p>
            Je ne prétends pas au volet management hiérarchique : j’ai été tech
            lead de trois personnes, sans autorité formelle. Le reste, je peux
            le prouver.
          </p>
          <p>
            Bien à vous,
            <br />
            Marc
          </p>
        </article>
        <footer>
          <div className="co-message-rewrites">
            <button>
              <Icon>short_text</Icon>Plus court
            </button>
            <button>
              <Icon>tune</Icon>Plus sobre
            </button>
          </div>
          <span>148 mots · 1 lien · 1 chiffre sourcé</span>
          <Button quiet>Copier le texte</Button>
          <Button>Ouvrir dans mon client mail</Button>
        </footer>
      </section>
      <aside>
        <h2>Contrôle</h2>
        <ul className="co-checklist">
          <li className="done">Tous les faits sont sourcés</li>
          <li className="done">« 11 à 7 minutes »</li>
          <li className="done">« 340 services »</li>
          <li className="done">« tech lead de trois personnes »</li>
        </ul>
        <section className="co-panel">
          <h3>Relance suggérée</h3>
          <p>Dans 8 jours si aucune réponse. Rien ne partira sans vous.</p>
          <label className="co-toggle">
            <input defaultChecked type="checkbox" />
            Me le rappeler
          </label>
        </section>
        <section className="co-panel co-message-templates">
          <h3>Gabarits</h3>
          {[
            'Candidature spontanée',
            'Remerciement post-entretien',
            'Relance polie',
            'Négociation d’offre',
          ].map((template) => (
            <p key={template}>
              <Icon>mail</Icon>
              {template}
            </p>
          ))}
        </section>
        <div className="co-note co-message-history">
          <Icon>history</Icon>Une fois envoyé, marquez-le : l’app compte les
          jours pour la relance.
        </div>
      </aside>
    </main>,
  );
}

function SkillsScreen() {
  return (
    <AppShell path="/memory/skills">
      <PageHeader
        title="Compétences"
        copy="Chaque compétence est un paquet de preuves. Sans preuve, elle n’apparaît pas dans vos candidatures."
        actions={<Button quiet>Combler un trou</Button>}
      />
      <div className="co-stats">
        <Stat
          icon="verified"
          value="17"
          label="Compétences prouvées"
          tone="ok"
        />
        <Stat
          icon="edit_note"
          value="6"
          label="Déclarées sans preuve"
          tone="warn"
        />
        <Stat
          icon="priority_high"
          value="3"
          label="Demandées, absentes"
          tone="crit"
        />
        <Stat icon="inventory_2" value="28" label="Preuves inutilisées" />
      </div>
      <section className="co-panel">
        <div className="co-section-title">
          <h2>Vos points forts documentés</h2>
          <small>preuves vérifiées · déclarées · demande du marché</small>
        </div>
        {[
          ['Fiabilité de déploiement', '11 preuves', 'Fort', 'ok'],
          ['Outillage développeur', '8 preuves', 'Fort', 'ok'],
          ['Kubernetes / infra', '6 preuves · 1 périmée', 'À jour ?', 'warn'],
          ['Open source / ROS2', '4 preuves', 'Rare', 'accent'],
          ['Impact business chiffré', '1 preuve', 'Trou', 'crit'],
          ['Management hiérarchique', 'aucune preuve', 'Trou', 'crit'],
        ].map(([skill, count, state, tone]) => (
          <div className="co-skill-row" key={skill}>
            <span>
              <strong>{skill}</strong>
              <small>{count}</small>
            </span>
            <div>
              <i
                style={{
                  width:
                    count === 'aucune preuve'
                      ? '2%'
                      : `${Math.max(12, parseInt(count) * 8)}%`,
                }}
              />
            </div>
            <Badge tone={tone as Tone}>{state}</Badge>
            <Button quiet>Voir</Button>
          </div>
        ))}
      </section>
      <div className="co-two-col">
        <section className="co-panel co-callout">
          <Icon>priority_high</Icon>
          <strong>Trou le plus coûteux</strong>
          <p>
            Impact business chiffré est demandé dans 11 des 14 offres visées, et
            vous n’avez qu’une preuve.
          </p>
          <Button>Chercher le document</Button>
        </section>
        <section className="co-panel co-callout">
          <Icon>auto_awesome</Icon>
          <strong>Atout sous-exploité</strong>
          <p>
            Votre travail open source ROS2 n’apparaît que dans 2 candidatures
            sur 14.
          </p>
          <Button quiet>Voir où l’ajouter</Button>
        </section>
      </div>
    </AppShell>
  );
}

function HostingScreen() {
  const localize = useLocalizer(activeFrontMessages);
  return localize(
    <main className="co-hosting">
      <header>
        <Link className="co-brand" href="/">
          <span>
            <i />
          </span>
          <strong>Career OS</strong>
        </Link>
        <span>1 / 3</span>
      </header>
      <PageHeader
        eyebrow="Où vos preuves doivent-elles vivre ?"
        title="Choisissez votre mode d’hébergement"
        copy="Vous pouvez changer d’avis plus tard : l’export est complet dans les deux cas."
      />
      <div className="co-hosting-options">
        <article className="recommended">
          <div>
            <Icon>cloud</Icon>
            <Badge tone="accent">Recommandé</Badge>
          </div>
          <h2>SaaS hébergé</h2>
          <p>Prêt en deux minutes · 12 €/mois</p>
          <ul className="co-checklist">
            <li className="done">Rien à installer, mises à jour incluses</li>
            <li className="done">Modèles inclus, pas de clé API</li>
            <li className="done">Données hébergées en UE</li>
          </ul>
          <div className="co-note">
            <Icon>info</Icon>Vos extraits de preuves transitent par nos serveurs
            pour être traités.
          </div>
          <Button>Commencer avec le SaaS</Button>
        </article>
        <article>
          <div>
            <Icon>dns</Icon>
            <Badge>AGPL-3.0</Badge>
          </div>
          <h2>Auto-hébergé</h2>
          <p>Docker compose · gratuit</p>
          <ul className="co-checklist">
            <li className="done">Vos documents restent sur votre machine</li>
            <li className="done">Modèles locaux possibles</li>
            <li className="done">Code auditable, agents modifiables</li>
          </ul>
          <pre>git clone careeros/careeros{`\n`}docker compose up -d</pre>
          <Button quiet>Guide d’installation</Button>
        </article>
      </div>
      <div className="co-note">
        <Icon>import_export</Icon>Le format d’export est identique : Markdown et
        JSON, lisibles sans Career OS. Migrer prend une commande.
      </div>
    </main>,
  );
}

function InboxScreen() {
  const { locale } = useI18n();
  const { dashboard, error } = useWorkflowDashboard();
  const decisions = dashboardActions(dashboard?.items ?? []).filter(
    ({ kind }) => kind === 'review' || kind === 'decision',
  );
  const copy =
    locale === 'fr'
      ? decisions.length
        ? `${decisions.length} arbitrage${decisions.length > 1 ? 's' : ''} humain${decisions.length > 1 ? 's' : ''} bloque${decisions.length > 1 ? 'nt' : ''} une candidature.`
        : 'Aucun arbitrage humain ne bloque vos candidatures.'
      : decisions.length
        ? `${decisions.length} human decision${decisions.length > 1 ? 's are' : ' is'} blocking an application.`
        : 'No human decision is blocking your applications.';
  return (
    <AppShell
      path="/inbox"
      aside={
        <section className="co-stack">
          <h2>
            {locale === 'fr' ? 'Ce qui apparaît ici' : 'What appears here'}
          </h2>
          <p>
            {locale === 'fr'
              ? 'Uniquement les retours de review non tranchés et les workflows explicitement mis en pause pour votre décision.'
              : 'Only unresolved review feedback and workflows explicitly paused for your decision.'}
          </p>
          <div className="co-note">
            <Icon>shield</Icon>
            {locale === 'fr'
              ? 'Aucun agent ne peut valider sa propre affirmation ni publier à votre place.'
              : 'No agent can approve its own claim or publish on your behalf.'}
          </div>
        </section>
      }
    >
      <PageHeader title="À trancher" copy={copy} />
      <div className="co-inbox-list">
        {decisions.map((decision) => (
          <article key={decision.application.applicationId}>
            <span className={decision.kind === 'review' ? 'crit' : 'warn'}>
              <Icon>
                {decision.kind === 'review' ? 'gpp_maybe' : 'front_hand'}
              </Icon>
            </span>
            <div>
              <small>{decision.application.company}</small>
              <h2>
                {decision.kind === 'review'
                  ? locale === 'fr'
                    ? `${decision.pendingDecisions} modification${decision.pendingDecisions > 1 ? 's' : ''} à trancher`
                    : `${decision.pendingDecisions} ${decision.pendingDecisions === 1 ? 'change needs' : 'changes need'} review`
                  : locale === 'fr'
                    ? 'Décision humaine requise'
                    : 'Human decision required'}
              </h2>
              <p>{homePriorityRow(decision, locale)}</p>
            </div>
            <Link
              className="co-button"
              href={`/applications/${decision.application.applicationId}`}
            >
              {locale === 'fr' ? 'Ouvrir le dossier' : 'Open application'}
            </Link>
          </article>
        ))}
        {!dashboard && !error ? (
          <div className="co-note">
            <Icon>hourglass_top</Icon>
            {locale === 'fr'
              ? 'Chargement des arbitrages…'
              : 'Loading decisions…'}
          </div>
        ) : null}
        {error ? (
          <div className="co-note">
            <Icon>cloud_off</Icon>
            {error === 'auth'
              ? locale === 'fr'
                ? 'Connectez-vous pour retrouver vos arbitrages.'
                : 'Sign in to access your decisions.'
              : locale === 'fr'
                ? 'La file d’arbitrage est momentanément indisponible.'
                : 'The decision queue is temporarily unavailable.'}
          </div>
        ) : null}
        {dashboard && !error && !decisions.length ? (
          <div className="co-note">
            <Icon>check_circle</Icon>
            {locale === 'fr'
              ? 'Tout est tranché pour le moment.'
              : 'Everything is decided for now.'}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function BillingScreen() {
  return (
    <SettingsShell
      active="Abonnement"
      side={
        <section className="co-billing-side">
          <h2>Moyen de paiement</h2>
          <div className="co-panel co-payment-method">
            <i />
            <span>
              <strong>•••• 4242</strong>
              <small>expire 04/29</small>
            </span>
            <button type="button">Changer</button>
          </div>
          <div className="co-panel">
            <h3>Plafond d’usage</h3>
            <p>
              Au-delà de 15 €, les runs basculent automatiquement sur les
              modèles locaux au lieu d’être facturés.
            </p>
            <label className="co-toggle">
              <input defaultChecked type="checkbox" />
              Ne jamais dépasser
            </label>
          </div>
          <div className="co-panel">
            <h3>Facturation</h3>
            <p>
              <Icon>apartment</Icon>Nom et adresse{' '}
              <button type="button">Éditer</button>
            </p>
            <p>
              <Icon>receipt_long</Icon>TVA intracommunautaire{' '}
              <button type="button">Ajouter</button>
            </p>
          </div>
          <div className="co-billing-selfhost">
            <strong>
              <Icon>code</Icon>Toujours gratuit en self-host
            </strong>
            <p>
              L’abonnement paie l’hébergement et l’accès aux modèles, pas les
              fonctionnalités : aucune n’est réservée au SaaS.
            </p>
          </div>
        </section>
      }
    >
      <PageHeader
        title="Abonnement"
        copy="Facturation à l’usage des modèles, plafonnée. Vous ne payez pas ce que vous n’utilisez pas."
      />
      <section className="co-plan">
        <p>Formule actuelle</p>
        <h2>Pro · 12 €/mois</h2>
        <span>
          Candidatures illimitées · modèles inclus jusqu’à 15 € d’usage ·
          renouvellement le 1ᵉʳ oct.
        </span>
        <div>
          <Button quiet>Changer de formule</Button>
          <Button danger>Résilier</Button>
        </div>
      </section>
      <div className="co-stats">
        <Stat
          icon="payments"
          value="2,74 € / 15 €"
          label="Usage de modèles ce mois"
        />
        <Stat icon="work_history" value="14" label="Candidatures traitées" />
        <Stat icon="dns" value="62 %" label="Part traitée en local" tone="ok" />
      </div>
      <section className="co-panel">
        <h2>Historique de facturation</h2>
        <DataTable
          headers={['Période', 'Détail', 'Montant', 'État', '']}
          rows={[
            [
              'Août 2026',
              'Pro + 3,10 € d’usage',
              '15,10 €',
              <Badge key="paid" tone="ok">
                Payé
              </Badge>,
              'Facture',
            ],
            [
              'Juillet 2026',
              'Pro + 1,80 € d’usage',
              '13,80 €',
              <Badge key="paid" tone="ok">
                Payé
              </Badge>,
              'Facture',
            ],
            [
              'Juin 2026',
              'Pro, aucun usage',
              '12,00 €',
              <Badge key="paid" tone="ok">
                Payé
              </Badge>,
              'Facture',
            ],
          ]}
        />
      </section>
    </SettingsShell>
  );
}

function IntegrationsScreen() {
  return (
    <SettingsShell
      active="Intégrations"
      side={
        <section className="co-integrations-side">
          <h2>Webhooks</h2>
          <section className="co-panel">
            <code>
              <Icon>webhook</Icon>hooks.slack.com/…/T04
            </code>
            <ul>
              <li>run.awaiting_review</li>
              <li>run.failed</li>
              <li>link.viewed</li>
              <li className="off">memory.claim_added</li>
            </ul>
            <p>
              Le corps ne contient que des identifiants, jamais le texte d’une
              preuve.
            </p>
          </section>
          <section className="co-panel">
            <h3>Portées disponibles</h3>
            <dl>
              <div>
                <dt>memory:read</dt>
                <dd>lecture des preuves</dd>
              </div>
              <div>
                <dt>memory:write</dt>
                <dd>import de documents</dd>
              </div>
              <div>
                <dt>applications:*</dt>
                <dd>créer, lire, lister</dd>
              </div>
              <div>
                <dt>runs:read</dt>
                <dd>état et journaux</dd>
              </div>
            </dl>
            <div className="co-note crit">
              <Icon>block</Icon>Aucune portée ne permet de publier un lien privé
              : la publication reste une action humaine.
            </div>
          </section>
          <section className="co-integrations-log">
            <strong>
              <Icon>visibility</Icon>Journal d’accès API
            </strong>
            <p>
              248 appels ce mois · dernier il y a 3 min. Chaque appel enregistre
              le jeton, la portée et l’IP.
            </p>
            <Button quiet>Ouvrir le journal</Button>
          </section>
        </section>
      }
    >
      <PageHeader
        title="Intégrations & API"
        copy="Connecteurs de sources, jetons d’accès et webhooks. Tout ce qui sort est journalisé."
      />
      <section className="co-integration-sources">
        <header>
          <h2>Sources connectées</h2>
          <button type="button">Ajouter une source</button>
        </header>
        <div>
          {[
            ['badge', 'LinkedIn', 'sync quotidien · 18 preuves', 'Actif'],
            ['code', 'GitHub', '2 dépôts · 8 preuves', 'Actif'],
            [
              'cloud_off',
              'Google Drive',
              'jeton expiré · 4 preuves figées',
              'Reconnecter',
            ],
            ['add', 'Notion, Drive, flux RSS…', 'lecture seule uniquement', ''],
          ].map(([icon, title, meta, state]) => (
            <article
              className={
                state === 'Reconnecter' ? 'warning' : state ? '' : 'empty'
              }
              key={title}
            >
              <Icon>{icon}</Icon>
              <span>
                <strong>{title}</strong>
                <small>{meta}</small>
              </span>
              {state ? (
                <Badge tone={state === 'Actif' ? 'ok' : 'warn'}>{state}</Badge>
              ) : null}
            </article>
          ))}
        </div>
      </section>
      <section className="co-panel">
        <div className="co-section-title">
          <h2>Jetons d’API</h2>
          <Button>Créer un jeton</Button>
        </div>
        <DataTable
          headers={['Nom', 'Portée', 'Dernier usage', 'Expire', '']}
          rows={[
            [
              'Script d’import CV',
              <code key="scope">memory:write</code>,
              'il y a 2 j',
              'jamais',
              <Button key="revoke" danger>
                Révoquer
              </Button>,
            ],
            [
              'Dashboard perso',
              <code key="scope">applications:read</code>,
              'aujourd’hui',
              '31 déc.',
              <Button key="revoke" danger>
                Révoquer
              </Button>,
            ],
          ]}
        />
      </section>
      <section className="co-code-example">
        <header>
          <span>Exemple · créer une candidature</span>
          <Badge tone="ok">202 Accepted</Badge>
        </header>
        <pre>{`curl -X POST https://api.careeros.app/v1/applications \\\n  -H "Authorization: Bearer $COS_TOKEN" \\\n  -d '{"job_url":"https://nimbus.ai/careers/staff-pe"}'`}</pre>
      </section>
    </SettingsShell>
  );
}

function DataScreen() {
  return (
    <SettingsShell active="Export & suppression">
      <PageHeader
        title="Export & suppression"
        copy="Vos données vous appartiennent, dans un format lisible sans Career OS."
      />
      <div className="co-data-layout">
        <section className="co-data-main">
          <section className="co-export-card">
            <div>
              <Icon>download</Icon>
              <h2>Exporter tout</h2>
              <code>≈ 18 Mo</code>
            </div>
            <div className="co-export-checks">
              {[
                'Mémoire · 128 affirmations',
                'Documents sources · 24',
                'Candidatures · 14',
                'Runs et journaux d’agents',
              ].map((x) => (
                <label key={x}>
                  <input defaultChecked type="checkbox" />
                  {x}
                </label>
              ))}
            </div>
            <footer>
              <div className="co-segment">
                <button className="active" type="button">
                  Markdown + JSON
                </button>
                <button type="button">JSON seul</button>
                <button type="button">PDF</button>
              </div>
              <Button>Générer l’archive</Button>
            </footer>
          </section>
          <pre>{`structure de l'archive\n\ncareeros-export-2026-09-03/\n├── memory/claims.json\n├── memory/claims.md\n├── sources/corvid_postmortem.md\n├── sources/cv_2024.pdf\n├── applications/nimbus-robotics/\n│   ├── page.md\n│   ├── requirements.json\n│   └── runs/8f2c.json\n└── README.md`}</pre>
          <div className="co-note">
            <Icon>verified</Icon>Chaque affirmation exportée conserve ses liens
            vers ses preuves et sa date d’origine. L’archive se réimporte telle
            quelle dans une autre instance.
          </div>
        </section>
        <aside className="co-data-side">
          <section className="co-delete-card">
            <header>
              <Icon>delete_forever</Icon>
              <h2>Supprimer mon compte</h2>
            </header>
            <p>
              Efface la mémoire, les candidatures, les runs et les liens privés.
              Les liens deviennent inaccessibles immédiatement, y compris pour
              un onglet déjà ouvert.
            </p>
            <div>
              <strong>Ce qui sera supprimé</strong>
              <ul>
                <li>128 affirmations, 24 documents</li>
                <li>14 candidatures et leurs versions</li>
                <li>4 liens privés actifs</li>
                <li>2 jetons d’API</li>
              </ul>
            </div>
            <input
              aria-label="Tapez SUPPRIMER pour confirmer"
              placeholder="tapez SUPPRIMER pour confirmer"
            />
            <Button danger>Supprimer définitivement</Button>
            <p>
              Aucun délai de grâce, aucune corbeille : la suppression est
              immédiate. Exportez d’abord si vous voulez garder une copie.
            </p>
          </section>
          <section className="co-retention-card">
            <h2>
              <Icon>shield</Icon>Rétention
            </h2>
            <dl>
              <div>
                <dt>Documents et preuves</dt>
                <dd>jusqu’à suppression</dd>
              </div>
              <div>
                <dt>Journaux d’accès aux liens</dt>
                <dd>90 jours</dd>
              </div>
              <div>
                <dt>Sauvegardes chiffrées</dt>
                <dd>7 jours</dd>
              </div>
              <div>
                <dt>Factures (obligation légale)</dt>
                <dd>10 ans</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </SettingsShell>
  );
}

function KitNotFound() {
  return (
    <main className="co-not-found">
      <Icon>search_off</Icon>
      <h1>Écran non documenté</h1>
      <p>Cette route ne fait pas partie des 33 écrans du kit validé.</p>
      <Link className="co-button" href="/">
        Retour à l’accueil
      </Link>
    </main>
  );
}

function initials(value: string) {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'CO'
  );
}

function stageLabel(stage: Application['stage'], locale: 'en' | 'fr') {
  const labels = {
    en: {
      draft: 'Draft',
      applied: 'Applied',
      interview: 'Interview',
      offer: 'Offer',
      closed: 'Closed',
    },
    fr: {
      draft: 'Brouillon',
      applied: 'Envoyée',
      interview: 'Entretien',
      offer: 'Offre',
      closed: 'Clôturée',
    },
  } as const;
  return labels[locale][stage];
}

function runStatusLabel(
  status:
    | 'running'
    | 'paused'
    | 'awaiting_approval'
    | 'completed'
    | 'blocked'
    | 'budget_exhausted'
    | 'cancelled'
    | 'failed',
  locale: 'en' | 'fr',
) {
  const labels = {
    en: {
      running: 'Running',
      paused: 'Paused',
      awaiting_approval: 'Awaiting approval',
      completed: 'Completed',
      blocked: 'Blocked',
      budget_exhausted: 'Budget exhausted',
      cancelled: 'Cancelled',
      failed: 'Failed',
    },
    fr: {
      running: 'En cours',
      paused: 'En pause',
      awaiting_approval: 'Validation requise',
      completed: 'Terminé',
      blocked: 'Bloqué',
      budget_exhausted: 'Budget épuisé',
      cancelled: 'Annulé',
      failed: 'Échec',
    },
  } as const;
  return labels[locale][status];
}

function workflowErrorLabel(error: string) {
  const labels: Record<string, string> = {
    auth: 'Connectez-vous pour lancer ce workflow.',
    'profile-missing': 'Enregistrez d’abord votre mémoire professionnelle.',
    conflict: 'La candidature ou la mémoire a changé. Rechargez ce dossier.',
    'rate-limited':
      'La limite de runs est atteinte. Réessayez dans une minute.',
    'worker-unavailable':
      'Le worker de recherche est indisponible. Vérifiez votre instance.',
    unavailable: 'Le workflow est momentanément indisponible.',
  };
  return labels[error] ?? labels.unavailable;
}

function runStageLabel(stage: string, locale: 'en' | 'fr') {
  const labels: Record<string, [string, string]> = {
    research: ['Research', 'Recherche entreprise'],
    evidence_archive: ['Evidence matching', 'Appariement des preuves'],
    strategy: ['Application strategy', 'Stratégie de candidature'],
    strategy_review: ['Strategy review', 'Validation de la stratégie'],
    page_spec: ['Page composition', 'Composition de la page'],
    page_spec_review: ['Page review', 'Validation de la page'],
    review_recruiter: ['Recruiter review', 'Revue recruteur'],
    review_hiring_manager: ['Hiring manager review', 'Revue hiring manager'],
    review_factuality: ['Factual review', 'Revue factuelle'],
    review_decision: ['Human decisions', 'Décisions humaines'],
    human_approval: ['Final approval', 'Validation finale'],
    publication_ready: ['Published', 'Publiée'],
    'company-researcher': ['Company research', 'Recherche entreprise'],
    'evidence-archivist': ['Evidence matching', 'Appariement des preuves'],
    'recruiter-strategist': [
      'Application strategy',
      'Stratégie de candidature',
    ],
    'page-composer': ['Page composition', 'Composition de la page'],
    'recruiter-reviewer': ['Recruiter review', 'Revue recruteur'],
    'hiring-manager-reviewer': [
      'Hiring manager review',
      'Revue hiring manager',
    ],
    'factuality-reviewer': ['Factual review', 'Revue factuelle'],
  };
  return labels[stage]?.[locale === 'en' ? 0 : 1] ?? stage.replaceAll('-', ' ');
}

function stepStatusLabel(status: string, locale: 'en' | 'fr') {
  const labels: Record<string, [string, string]> = {
    pending: ['Queued', 'En attente'],
    leased: ['Assigned', 'Assignée'],
    in_flight: ['Running', 'En cours'],
    completed: ['Completed', 'Terminée'],
    failed: ['Failed', 'Échec'],
    cancelled: ['Cancelled', 'Annulée'],
  };
  return labels[status]?.[locale === 'en' ? 0 : 1] ?? status;
}

function actorLabel(actor: string, locale: 'en' | 'fr') {
  const labels: Record<string, [string, string]> = {
    human: ['You', 'Vous'],
    system: ['Career OS', 'Career OS'],
    'company-researcher': ['Company researcher', 'Agent de recherche'],
    'evidence-archivist': ['Evidence archivist', 'Agent de preuves'],
    'recruiter-strategist': ['Recruiter strategist', 'Agent stratégie'],
    'hiring-manager': ['Hiring manager reviewer', 'Revue hiring manager'],
    'page-composer': ['Page composer', 'Agent de rédaction'],
    'fact-checker': ['Fact checker', 'Agent factuel'],
    recruiter: ['Recruiter reviewer', 'Revue recruteur'],
  };
  return labels[actor]?.[locale === 'en' ? 0 : 1] ?? actor;
}

function attemptLabel(attempt: number, locale: 'en' | 'fr') {
  return `${locale === 'en' ? 'Pass' : 'Passe'} ${attempt}`;
}

function runStatusTone(status: PersistedRun['status']): Tone {
  if (status === 'completed') return 'ok';
  if (['failed', 'blocked', 'budget_exhausted'].includes(status)) return 'crit';
  if (['paused', 'awaiting_approval'].includes(status)) return 'warn';
  return 'accent';
}

function stepIcon(status: PersistedRun['steps'][number]['status']) {
  if (status === 'completed') return 'check_circle';
  if (status === 'failed') return 'error';
  if (status === 'cancelled') return 'cancel';
  return status === 'in_flight' ? 'autorenew' : 'schedule';
}

function runSources(application: Application, run: PersistedRun) {
  const urls = [
    application.url,
    ...(application.companySources ?? []).map(({ url }) => url),
    ...(run.research && 'sources' in run.research
      ? run.research.sources.flatMap((source) =>
          'finalUrl' in source ? [source.finalUrl] : [],
        )
      : run.research?.source.url
        ? [run.research.source.url]
        : []),
  ].filter((value): value is string => Boolean(value));
  return [...new Set(urls)];
}

export function KitRoutePage({ path, query }: { path: string; query: Query }) {
  if (path === '/') return <HomeScreen />;
  if (path === '/memory') return <MemoryScreen />;
  if (path === '/applications') return <ApplicationsScreen />;
  const applicationMatch = path.match(/^\/applications\/([^/]+)$/);
  if (applicationMatch)
    return query.state === 'running' ? (
      <DossierScreen running />
    ) : (
      <DynamicDossierScreen applicationId={applicationMatch[1]} />
    );
  if (/^\/applications\/[^/]+\/review$/.test(path)) return <ReviewScreen />;
  if (path === '/memory/import') return <ImportScreen />;
  if (/^\/applications\/[^/]+\/page$/.test(path)) return <PageEditorScreen />;
  if (path === '/links') return <LinksScreen />;
  if (path === '/insights') return <InsightsScreen />;
  if (path === '/memory/interview') return <InterviewMemoryScreen />;
  if (/^\/interviews\/[^/]+$/.test(path)) return <InterviewPrepScreen />;
  if (/^\/interviews\/[^/]+\/debrief$/.test(path))
    return <InterviewPrepScreen debrief />;
  if (path === '/assets') return <AssetsScreen />;
  if (path === '/settings/models') return <ModelsScreen />;
  if (path === '/memory/conflicts') return <ConflictsScreen />;
  if (path === '/settings/privacy') return <PrivacyScreen />;
  if (/^\/applications\/[^/]+\/published$/.test(path))
    return <PublishedScreen />;
  const versionsMatch = path.match(/^\/applications\/([^/]+)\/versions$/);
  if (versionsMatch) return <VersionsScreen applicationId={versionsMatch[1]} />;
  if (path === '/runs') return <RunsScreen />;
  if (/^\/applications\/[^/]+\/company$/.test(path)) return <CompanyScreen />;
  const timelineMatch = path.match(/^\/applications\/([^/]+)\/timeline$/);
  if (timelineMatch)
    return <ApplicationTimelineScreen applicationId={timelineMatch[1]} />;
  if (path === '/messages') return <MessagesScreen />;
  if (path === '/memory/skills') return <SkillsScreen />;
  if (path === '/onboarding/hosting') return <HostingScreen />;
  if (path === '/inbox') return <InboxScreen />;
  if (path === '/settings/billing') return <BillingScreen />;
  if (path === '/settings/integrations') return <IntegrationsScreen />;
  if (path === '/settings/data') return <DataScreen />;
  return <KitNotFound />;
}
