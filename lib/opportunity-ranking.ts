import type { DiscoveredJob } from './discovered-job-contract';
import type { OpportunityDecision } from './opportunity-decision';

type RankableOpportunity = Pick<
  DiscoveredJob,
  'opportunityId' | 'company' | 'role' | 'location' | 'remoteMode'
>;
type RankableDecision = Pick<
  OpportunityDecision,
  'opportunityId' | 'searchProfileId' | 'qualification' | 'reason'
>;

export type OpportunityFeedbackRanking<T extends RankableOpportunity> = {
  opportunity: T;
  direction: 'up' | 'neutral' | 'down' | null;
  exampleCount: number;
  scopes: Array<'role' | 'company' | 'location'>;
};

const qualificationSignal = {
  priority: 3,
  interesting: 2,
  exploratory: 1,
  ignore: 0,
} as const;

export function rankOpportunitiesByHumanFeedback<T extends RankableOpportunity>(
  candidates: readonly T[],
  allOpportunities: readonly RankableOpportunity[],
  decisions: readonly RankableDecision[],
  searchProfileId: string,
): OpportunityFeedbackRanking<T>[] {
  if (!searchProfileId)
    return candidates.map((opportunity) => emptyRanking(opportunity));

  const opportunitiesById = new Map(
    allOpportunities.map((opportunity) => [
      opportunity.opportunityId,
      opportunity,
    ]),
  );
  return candidates
    .map((opportunity, index) => {
      const matches = decisions.flatMap((decision) => {
        if (
          decision.searchProfileId !== searchProfileId ||
          decision.opportunityId === opportunity.opportunityId
        )
          return [];
        const previous = opportunitiesById.get(decision.opportunityId);
        const scope = previous
          ? matchingScope(opportunity, previous, decision.reason)
          : undefined;
        return scope
          ? [{ signal: qualificationSignal[decision.qualification], scope }]
          : [];
      });
      if (!matches.length) return { ...emptyRanking(opportunity), index };
      const signals = matches.map(({ signal }) => signal).sort((a, b) => a - b);
      const signal = signals[Math.floor(signals.length / 2)];
      return {
        opportunity,
        direction:
          signal >= 2
            ? ('up' as const)
            : signal === 0
              ? ('down' as const)
              : ('neutral' as const),
        exampleCount: matches.length,
        scopes: [...new Set(matches.map(({ scope }) => scope))],
        signal,
        index,
      };
    })
    .sort(
      (left, right) =>
        (right.signal ?? -1) - (left.signal ?? -1) ||
        right.exampleCount - left.exampleCount ||
        left.index - right.index,
    )
    .map((ranking) => ({
      opportunity: ranking.opportunity,
      direction: ranking.direction,
      exampleCount: ranking.exampleCount,
      scopes: ranking.scopes,
    }));
}

function matchingScope(
  candidate: RankableOpportunity,
  previous: RankableOpportunity,
  reason: RankableDecision['reason'],
) {
  if (reason === 'company' && same(candidate.company, previous.company))
    return 'company' as const;
  if (
    reason === 'location' &&
    (same(candidate.location, previous.location) ||
      (candidate.remoteMode !== 'unknown' &&
        candidate.remoteMode === previous.remoteMode))
  )
    return 'location' as const;
  if (
    (reason === 'strong_fit' ||
      reason === 'career_direction' ||
      reason === 'weak_evidence') &&
    same(candidate.role, previous.role)
  )
    return 'role' as const;
  return undefined;
}

function same(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  return Boolean(left && right && normalize(left) === normalize(right));
}

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('en');
}

function emptyRanking<T extends RankableOpportunity>(opportunity: T) {
  return {
    opportunity,
    direction: null,
    exampleCount: 0,
    scopes: [] as Array<'role' | 'company' | 'location'>,
  };
}
