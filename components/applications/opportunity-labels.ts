import { type DiscoveredJob } from '@/lib/discovered-job-contract';
import { type OpportunityFeedbackRanking } from '@/lib/opportunity-ranking';
import { type OpportunityDecision } from '@/lib/opportunity-decision';

export function host(url: string) {
  return new URL(url).hostname.replace(/^www\./, '');
}

export function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function formatDateTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function lifecycleCopy(
  t: Translator<typeof applicationsMessages>,
  lifecycle: DiscoveredJob['lifecycle'],
) {
  return {
    open: t('applications.open'),
    changed: t('applications.changed'),
    closed: t('applications.closed'),
    reposted: t('applications.reposted'),
  }[lifecycle];
}

export function remoteCopy(
  t: Translator<typeof applicationsMessages>,
  remoteMode: DiscoveredJob['remoteMode'],
) {
  return {
    unknown: t('applications.needs.verification'),
    onsite: t('applications.on.site'),
    hybrid: t('applications.hybrid'),
    remote: t('applications.remote'),
  }[remoteMode];
}

export function contractCopy(
  t: Translator<typeof applicationsMessages>,
  contractType: DiscoveredJob['contractType'],
) {
  return {
    unknown: t('applications.needs.verification'),
    full_time: t('applications.full.time'),
    part_time: t('applications.part.time'),
    internship: t('applications.internship'),
    contract: t('applications.contract'),
    temporary: t('applications.temporary'),
  }[contractType];
}

export function salaryCopy(
  t: Translator<typeof applicationsMessages>,
  opportunity: DiscoveredJob,
  locale: string,
) {
  const { salaryMin, salaryMax, salaryCurrency } = opportunity;
  if (!salaryCurrency || (salaryMin === null && salaryMax === null))
    return t('applications.needs.verification');
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
    return `${locale === 'fr' ? t('applications.from') : 'From'} ${format(salaryMin)}`;
  return `${locale === 'fr' ? t('applications.up.to') : 'Up to'} ${format(salaryMax!)}`;
}

export function atsCopy(
  t: Translator<typeof applicationsMessages>,
  sourceKind: DiscoveredJob['sourceKind'],
) {
  return sourceKind === 'generic_html'
    ? t('applications.needs.verification')
    : sourceKindCopy(t, sourceKind);
}

export function sourceKindCopy(
  t: Translator<typeof applicationsMessages>,
  sourceKind: DiscoveredJob['sourceKind'],
) {
  return {
    generic_html: t('applications.web.page'),
    greenhouse: 'Greenhouse',
    ashby: 'Ashby',
  }[sourceKind];
}

export function observationCopy(
  t: Translator<typeof applicationsMessages>,
  change: DiscoveredJob['observations'][number]['change'],
) {
  return {
    first_seen: t('applications.first.observed'),
    unchanged: t('applications.no.change.detected'),
    changed: t('applications.job.content.changed'),
    closed: t('applications.job.marked.closed'),
    reposted: t('applications.job.reposted'),
  }[change];
}

export function matchCopy(
  t: Translator<typeof applicationsMessages>,
  matchedBy: DiscoveredJob['observations'][number]['matchedBy'],
) {
  return {
    new: t('applications.new.job'),
    exact_source: t('applications.same.source'),
    canonical_url: t('applications.same.canonical.url'),
    fingerprint: t('applications.same.fingerprint'),
  }[matchedBy];
}

export function feedbackRankingCopy(
  ranking: OpportunityFeedbackRanking<DiscoveredJob>,
  locale: 'en' | 'fr',
) {
  const direction = {
    up: ['Raised', 'Remontée'],
    neutral: ['Informed', 'Éclairée'],
    down: ['Lowered', 'Abaissée'],
  }[ranking.direction!][locale === 'en' ? 0 : 1];
  const scopeLabels = {
    role: ['same role', 'même rôle'],
    company: ['same company', 'même entreprise'],
    location: ['same location', 'même lieu'],
  } as const;
  const scopes = ranking.scopes
    .map((scope) => scopeLabels[scope][locale === 'en' ? 0 : 1])
    .join(', ');
  const decisions =
    locale === 'en'
      ? `${ranking.exampleCount} related decision${ranking.exampleCount === 1 ? '' : 's'}`
      : `${ranking.exampleCount} décision${ranking.exampleCount === 1 ? '' : 's'} liée${ranking.exampleCount === 1 ? '' : 's'}`;
  return `${direction} ${locale === 'en' ? 'by' : 'par'} ${decisions} · ${scopes}`;
}

export function alertCopy(
  count: number,
  threshold: number,
  locale: 'en' | 'fr',
) {
  if (locale === 'en')
    return `${count} opportunit${count === 1 ? 'y has' : 'ies have'} reached your ${threshold}% human-feedback alert threshold.`;
  return `${count} opportunité${count === 1 ? ' a' : 's ont'} atteint votre seuil d’alerte de ${threshold} % fondé sur vos décisions.`;
}

export function dispositionCopy(
  t: Translator<typeof applicationsMessages>,
  disposition: OpportunityDecision['disposition'],
) {
  return {
    saved: t('applications.save'),
    ignored: t('applications.ignore'),
    archived: t('applications.archive'),
  }[disposition];
}

export function qualificationCopy(
  t: Translator<typeof applicationsMessages>,
  qualification: OpportunityDecision['qualification'],
) {
  return {
    priority: t('applications.priority'),
    interesting: t('applications.interesting'),
    exploratory: t('applications.exploratory'),
    ignore: t('applications.ignore.2'),
  }[qualification];
}

export function dispositionStateCopy(
  t: Translator<typeof applicationsMessages>,
  disposition: OpportunityDecision['disposition'],
) {
  return {
    saved: t('applications.saved'),
    ignored: t('applications.ignored'),
    archived: t('applications.archived'),
  }[disposition];
}

export function qualificationFor(
  disposition: OpportunityDecision['disposition'],
): OpportunityDecision['qualification'] {
  return disposition === 'ignored' ? 'ignore' : 'interesting';
}

export function reasonCopy(
  t: Translator<typeof applicationsMessages>,
  reason: OpportunityDecision['reason'],
) {
  return {
    strong_fit: t('applications.strong.fit'),
    career_direction: t('applications.career.direction'),
    hard_constraint: t('applications.hard.constraint'),
    weak_evidence: t('applications.insufficient.evidence'),
    compensation: t('applications.compensation'),
    location: t('applications.location.2'),
    company: t('applications.company'),
    duplicate: t('applications.duplicate'),
    closed: t('applications.closed.job'),
    other: t('applications.other.reason'),
  }[reason];
}

export function processedFilterCopy(
  t: Translator<typeof applicationsMessages>,
  filter: 'all' | 'ignored' | 'archived',
) {
  return {
    all: t('applications.all'),
    ignored: t('applications.ignored.2'),
    archived: t('applications.archived.2'),
  }[filter];
}

export function decisionError(
  t: Translator<typeof applicationsMessages>,
  status: number,
) {
  if (status === 400)
    return t('applications.review.the.fields.in.this.decision');
  if (status === 401) return t('applications.sign.in.to.save.this.decision');
  if (status === 404)
    return t(
      'applications.this.opportunity.or.search.profile.no.longer.exists',
    );
  if (status === 409)
    return t(
      'applications.this.decision.changed.in.another.session.reload.the.page',
    );
  if (status === 413) return t('applications.the.note.is.too.long');
  return t('applications.the.decision.could.not.be.saved');
}

export function promotionError(
  t: Translator<typeof applicationsMessages>,
  status: number,
) {
  if (status === 401)
    return t('applications.sign.in.to.start.this.application');
  if (status === 404)
    return t('applications.this.opportunity.no.longer.exists');
  if (status === 409)
    return t(
      'applications.an.application.cannot.be.started.for.this.opportunity',
    );
  return t('applications.the.application.could.not.be.started.try.again');
}

export function importError(
  t: Translator<typeof applicationsMessages>,
  status: number,
) {
  if (status === 400) return t('applications.this.url.cannot.be.fetched');
  if (status === 413) return t('applications.the.job.page.is.too.large');
  if (status === 415)
    return t('applications.this.page.format.is.not.supported');
  if (status === 422)
    return t('applications.no.usable.job.was.found.at.this.url');
  if (status === 429)
    return t('applications.too.many.attempts.try.again.in.one.minute');
  if (status === 504)
    return t('applications.the.remote.page.did.not.respond.in.time');
  return t('applications.the.job.could.not.be.imported.try.again');
}

import type { Translator } from '@/lib/i18n/messages';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';
