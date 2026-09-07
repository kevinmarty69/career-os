'use client';

import {
  runStageLabel,
  runStatusLabel,
} from '@/components/applications/workflow-labels';
import { useWorkflowDashboard } from '@/components/dashboard/use-workflow-dashboard';
import { useI18n } from '@/components/i18n/i18n-provider';
import { AppShell } from '@/components/layout/app-shell';
import { useCareerMemory } from '@/components/memory/use-career-memory';
import { Icon } from '@/components/ui/primitives';
import {
  dashboardActions,
  type DashboardAction,
} from '@/lib/dashboard-priority';
import { initials } from '@/lib/initials';
import Link from 'next/link';

export function HomeScreen() {
  const { locale } = useI18n();
  const { dashboard, error: dashboardError } = useWorkflowDashboard();
  const memory = useCareerMemory();

  const actions = dashboardActions(dashboard?.items ?? []);
  const priority = actions[0];
  const latestSignal = [...(dashboard?.publications ?? [])]
    .filter((item) => item.status === 'active' && item.lastOpenedAt)
    .sort((left, right) =>
      (right.lastOpenedAt ?? '').localeCompare(left.lastOpenedAt ?? ''),
    )[0];
  const activeApplications = (dashboard?.applications ?? []).filter(
    (item) => item.stage !== 'closed',
  );
  const evidenceGaps = memory.profile.claims.filter(
    (claim) => claim.level === 'unsupported' || claim.evidenceIds.length === 0,
  );
  const firstName = memory.profile.name.trim().split(/\s+/)[0];
  const today = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  return (
    <AppShell path="/">
      <div className="co-home-v2">
        <header className="co-home-v2-header">
          <div>
            <time dateTime={new Date().toISOString()} suppressHydrationWarning>
              {today}
            </time>
            <h1>
              {locale === 'fr' ? 'Bonjour' : 'Hello'}
              {firstName ? ` ${firstName}` : ''}
            </h1>
          </div>
          <Link className="co-home-import" href="/applications/new">
            <Icon>link</Icon>
            <span>
              {locale === 'fr' ? 'Coller une offre…' : 'Paste a job URL…'}
            </span>
            <i>
              <Icon>arrow_forward</Icon>
            </i>
          </Link>
        </header>

        <section className="co-home-signal">
          <div>
            <p>
              <Icon>{latestSignal ? 'visibility' : 'visibility_off'}</Icon>
              {locale === 'fr' ? 'SIGNAL FORT' : 'STRONG SIGNAL'}
            </p>
            <h2>
              {latestSignal
                ? locale === 'fr'
                  ? `${latestSignal.company} a ouvert votre page ${latestSignal.opens} fois.`
                  : `${latestSignal.company} opened your page ${latestSignal.opens} times.`
                : locale === 'fr'
                  ? 'Aucun signal de lecture pour le moment.'
                  : 'No reading signal yet.'}
            </h2>
            <span>
              {latestSignal
                ? locale === 'fr'
                  ? `${latestSignal.sections} sections consultées · ${latestSignal.actions} actions · ${latestSignal.downloads} téléchargements.`
                  : `${latestSignal.sections} sections viewed · ${latestSignal.actions} actions · ${latestSignal.downloads} downloads.`
                : locale === 'fr'
                  ? 'Les liens actifs restent suivis sans adresse IP, empreinte ni user agent.'
                  : 'Active links remain monitored without IP addresses, fingerprints, or user agents.'}
            </span>
            <div>
              <Link href="/links">
                <Icon>visibility</Icon>
                {locale === 'fr'
                  ? 'Voir le journal d’accès'
                  : 'View access log'}
              </Link>
              <Link
                href={
                  priority
                    ? `/applications/${priority.application.applicationId}`
                    : '/applications'
                }
              >
                {locale === 'fr'
                  ? 'Voir les candidatures'
                  : 'View applications'}
              </Link>
            </div>
          </div>
          <aside>
            <p>{locale === 'fr' ? 'PREUVES CONSULTÉES' : 'PROOFS CONSULTED'}</p>
            {[
              [
                locale === 'fr' ? 'Sections ouvertes' : 'Sections opened',
                latestSignal?.sections ?? 0,
              ],
              [
                locale === 'fr' ? 'Actions réalisées' : 'Actions taken',
                latestSignal?.actions ?? 0,
              ],
              [
                locale === 'fr' ? 'CV téléchargés' : 'CV downloads',
                latestSignal?.downloads ?? 0,
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <i className={Number(value) ? 'active' : ''} />
                <span>{label}</span>
                <b>{value}</b>
              </div>
            ))}
            <small>
              {locale === 'fr'
                ? latestSignal
                  ? 'Activité agrégée et anonyme de ce lien privé.'
                  : 'Aucune preuve ouverte pour le moment.'
                : latestSignal
                  ? 'Anonymous aggregate activity from this private link.'
                  : 'No proof opened yet.'}
            </small>
          </aside>
        </section>

        <div className="co-home-v2-grid">
          <section className="co-home-applications">
            <header>
              <h2>
                {locale === 'fr' ? 'Vos candidatures' : 'Your applications'}
              </h2>
              <span>
                {activeApplications.length}{' '}
                {locale === 'fr' ? 'active' : 'active'}
              </span>
            </header>
            {activeApplications.slice(0, 1).map((application) => (
              <Link
                href={`/applications/${application.applicationId}`}
                key={application.applicationId}
              >
                <i>{initials(application.company)}</i>
                <span>
                  <strong>{application.company}</strong>
                  <small>{application.role}</small>
                </span>
                <em className="active" />
                <b>{homeApplicationState(application.stage, locale)}</b>
                <Icon>chevron_right</Icon>
              </Link>
            ))}
            {!activeApplications.length ? (
              <div className="co-home-empty">
                {dashboardError === 'auth'
                  ? locale === 'fr'
                    ? 'Connectez-vous pour retrouver vos candidatures.'
                    : 'Sign in to view your applications.'
                  : locale === 'fr'
                    ? 'Aucune candidature active.'
                    : 'No active application.'}
              </div>
            ) : null}
            <h3>{locale === 'fr' ? 'Le calendrier' : 'Calendar'}</h3>
            <div className="co-home-calendar">
              {actions.slice(0, 3).map((action, index) => (
                <Link
                  href={`/applications/${action.application.applicationId}`}
                  key={action.application.applicationId}
                >
                  <i>J+{index + 1}</i>
                  <span>
                    <strong>{action.application.company}</strong>
                    <small>{homePriorityRow(action, locale)}</small>
                  </span>
                  <b>{locale === 'fr' ? 'Ouvrir' : 'Open'}</b>
                </Link>
              ))}
              {!actions.length ? (
                <div className="co-home-empty compact">
                  {locale === 'fr'
                    ? 'Aucune prochaine action.'
                    : 'No next action.'}
                </div>
              ) : null}
            </div>
          </section>

          <aside className="co-home-strengthen">
            <header>
              <Icon>insights</Icon>
              <h2>
                {locale === 'fr'
                  ? 'Renforcer votre dossier'
                  : 'Strengthen your application'}
              </h2>
            </header>
            <p>
              {locale === 'fr'
                ? 'Les prochaines actions les plus utiles, selon vos preuves réelles.'
                : 'The most useful next actions, based on your actual evidence.'}
            </p>
            <div>
              {evidenceGaps.slice(0, 3).map((claim, index) => (
                <Link
                  className={index === 0 ? 'priority' : undefined}
                  href="/memory"
                  key={claim.id}
                >
                  <span>
                    <Icon>
                      {claim.kind === 'skill' ? 'code' : 'psychology'}
                    </Icon>
                    <strong>{claim.statement}</strong>
                    <b>
                      {locale === 'fr' ? 'PREUVE MANQUANTE' : 'EVIDENCE GAP'}
                    </b>
                  </span>
                  <small>
                    {locale === 'fr'
                      ? 'Ajoutez une source ou gardez cette affirmation explicitement déclarée.'
                      : 'Attach a source or keep this claim explicitly declared.'}
                  </small>
                </Link>
              ))}
              {!evidenceGaps.length ? (
                <div className="co-home-strengthen-complete">
                  <Icon>verified</Icon>
                  <strong>
                    {locale === 'fr'
                      ? 'Aucun trou prioritaire détecté.'
                      : 'No priority evidence gap detected.'}
                  </strong>
                  <small>
                    {locale === 'fr'
                      ? 'Votre mémoire actuelle couvre les affirmations enregistrées.'
                      : 'Your current memory covers the claims on record.'}
                  </small>
                </div>
              ) : null}
            </div>
            <footer>
              <Icon>bolt</Icon>
              <span>
                {locale === 'fr'
                  ? 'Chaque preuve ajoutée sert à toutes vos candidatures futures.'
                  : 'Every proof you add supports future applications too.'}
              </span>
            </footer>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function homeApplicationState(
  stage: 'draft' | 'applied' | 'interview' | 'offer' | 'closed',
  locale: 'en' | 'fr',
) {
  const labels = {
    draft: locale === 'fr' ? 'Brouillon' : 'Draft',
    applied: locale === 'fr' ? 'Envoyée' : 'Sent',
    interview: locale === 'fr' ? 'Entretien' : 'Interview',
    offer: locale === 'fr' ? 'Offre' : 'Offer',
    closed: locale === 'fr' ? 'Fermée' : 'Closed',
  };
  return labels[stage];
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
