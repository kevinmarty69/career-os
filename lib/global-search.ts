import type { Application } from './application-contract';
import type { DiscoveredJob } from './discovered-job-contract';
import type { Profile } from './schemas';

export type GlobalSearchItem = {
  id: string;
  kind: 'application' | 'opportunity' | 'claim' | 'evidence';
  title: string;
  detail: string;
  href: string;
};

export function buildGlobalSearchIndex({
  applications,
  opportunities,
  profile,
}: {
  applications: Application[];
  opportunities: DiscoveredJob[];
  profile?: Profile;
}): GlobalSearchItem[] {
  return [
    ...applications.map((application) => ({
      id: application.applicationId,
      kind: 'application' as const,
      title: `${application.company} · ${application.role}`,
      detail: application.description,
      href: `/applications/${application.applicationId}`,
    })),
    ...opportunities.map((opportunity) => ({
      id: opportunity.opportunityId,
      kind: 'opportunity' as const,
      title:
        [opportunity.company, opportunity.role].filter(Boolean).join(' · ') ||
        new URL(opportunity.sourceUrl).hostname,
      detail: opportunity.description ?? opportunity.sourceUrl,
      href: '/applications',
    })),
    ...(profile?.claims ?? []).map((claim) => ({
      id: claim.id,
      kind: 'claim' as const,
      title: claim.statement,
      detail: claim.level,
      href: '/memory',
    })),
    ...(profile?.evidence ?? []).map((evidence) => ({
      id: evidence.id,
      kind: 'evidence' as const,
      title: evidence.label,
      detail: evidence.excerpt,
      href: '/memory',
    })),
  ];
}

export function searchGlobalIndex(
  index: GlobalSearchItem[],
  query: string,
  limit = 8,
) {
  return index
    .filter((item) =>
      matchesSearchTerms(query, item.title, item.detail, item.kind),
    )
    .slice(0, limit);
}

export function matchesSearchTerms(query: string, ...values: string[]) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = normalize(values.join(' '));
  return terms.every((term) => haystack.includes(term));
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en');
}
