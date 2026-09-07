'use client';

import { activeRoutesMessages } from '@/lib/i18n/dictionaries/active-routes';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';

import {
  runStageLabel,
  runStatusLabel,
} from '@/components/applications/workflow-labels';
import { useWorkflowDashboard } from '@/components/dashboard/use-workflow-dashboard';
import { useI18n, useTranslations } from '@/components/i18n/i18n-provider';
import { AppShell } from '@/components/layout/app-shell';
import { Icon, Stat } from '@/components/ui/primitives';
import {
  dashboardActions,
  type DashboardAction,
} from '@/lib/dashboard-priority';
import { homeMessages } from '@/lib/i18n/dictionaries/home';
import { type PublicationSummary } from '@/lib/server/publication-input';
import Link from 'next/link';

export function HomeAside({
  loading,
  publications,
}: {
  loading: boolean;
  publications: PublicationSummary[];
}) {
  const { locale } = useI18n();
  const t = useTranslations([homeMessages, activeRoutesMessages]);
  const active = publications.filter((item) => item.status === 'active');
  return (
    <div className="co-home-aside">
      <section className="co-home-links">
        <header>
          <h2>{t('home.active.private.links')}</h2>
          <Link href="/links">{t('home.view.all')}</Link>
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
                    ? t('home.never.opened')
                    : 'Never opened'}
              </small>
            </span>
            <Icon>arrow_forward</Icon>
          </Link>
        ))}
        {loading ? <p>{t('active-routes.loading')}</p> : null}
        {!loading && !active.length ? <p>{t('home.no.active.link')}</p> : null}
      </section>
      <section className="co-home-aside-note">
        <Icon>rule</Icon>
        <h2>{t('home.explainable.priorities')}</h2>
        <p>{t('home.the.next.action.comes.only.from.the.recorded.state')} </p>
      </section>
    </div>
  );
}

export function HomeScreen() {
  const t = useTranslations([
    activeRoutesMessages,
    homeMessages,
    applicationsMessages,
  ]);

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
          <strong>{t('active-routes.self.hosted')}</strong>
          <span>{t('home.your.evidence.never.leaves.your.instance')}</span>
          <Link href="/settings/models">{t('home.view.configuration')}</Link>
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
            {t('home.view.activity.log')}{' '}
          </Link>
        </div>
      </section>

      <section className="co-home-stats" aria-label={t('home.key.metrics')}>
        <Stat
          icon="work_history"
          value={String(dashboard?.applications.length ?? 0)}
          label={t('applications.applications')}
        />
        <Stat
          icon="verified"
          tone="ok"
          value={String(actions.length)}
          label={t('home.priority.actions')}
        />
        <Stat
          icon="link"
          tone="warn"
          value={String(activeLinks)}
          label={t('home.active.private.links')}
        />
      </section>

      <section className="co-home-review-queue">
        <header>
          <h2>{t('home.do.now')}</h2>
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
              {t('active-routes.open')}{' '}
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

export function homePriorityCopy(
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

export function homePriorityRow(action: DashboardAction, locale: 'en' | 'fr') {
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

export function homePriorityIcon(kind: DashboardAction['kind']) {
  return {
    review: 'rule',
    decision: 'front_hand',
    running: 'bolt',
    recover: 'warning',
    start: 'play_arrow',
    publish: 'publish',
  }[kind];
}
