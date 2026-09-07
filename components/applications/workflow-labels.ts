import type { Translator } from '@/lib/i18n/messages';
import type { dossierMessages } from '@/lib/i18n/dictionaries/dossier';
import { type Application } from '@/lib/application-contract';
import { type PersistedRun } from '@/lib/run-contract';
import { Tone } from '@/components/ui/primitives';

export function stageLabel(stage: Application['stage'], locale: 'en' | 'fr') {
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

export function runStatusLabel(
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

export function workflowErrorLabel(
  t: Translator<typeof dossierMessages>,
  error: string,
) {
  const labels: Record<string, string> = {
    auth: t('dossier.sign.in.to.start.this.workflow'),
    'profile-missing': t('dossier.save.your.career.memory.before.starting'),
    conflict: t(
      'dossier.the.application.or.career.memory.changed.reload.this.page',
    ),
    'rate-limited': t('dossier.the.run.limit.has.been.reached.try.again.in'),
    'worker-unavailable': t(
      'dossier.the.research.worker.is.unavailable.check.your.instance',
    ),
    unavailable: t('dossier.the.workflow.is.temporarily.unavailable'),
  };
  return labels[error] ?? labels.unavailable;
}

export function runStageLabel(stage: string, locale: 'en' | 'fr') {
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

export function stepStatusLabel(status: string, locale: 'en' | 'fr') {
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

export function actorLabel(actor: string, locale: 'en' | 'fr') {
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

export function attemptLabel(attempt: number, locale: 'en' | 'fr') {
  return `${locale === 'en' ? 'Pass' : 'Passe'} ${attempt}`;
}

export function runStatusTone(status: PersistedRun['status']): Tone {
  if (status === 'completed') return 'ok';
  if (['failed', 'blocked', 'budget_exhausted'].includes(status)) return 'crit';
  if (['paused', 'awaiting_approval'].includes(status)) return 'warn';
  return 'accent';
}

export function stepIcon(status: PersistedRun['steps'][number]['status']) {
  if (status === 'completed') return 'check_circle';
  if (status === 'failed') return 'error';
  if (status === 'cancelled') return 'cancel';
  return status === 'in_flight' ? 'autorenew' : 'schedule';
}

export function runSources(application: Application, run: PersistedRun) {
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
