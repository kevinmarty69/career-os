'use client';
import {
  applicationSchema,
  type Application,
} from '@/lib/application-contract';
import {
  readApplications,
  readOpportunities,
  readOpportunityDecisions,
  readSearchProfiles,
} from '@/lib/career-api';
import {
  opportunityListResponseSchema,
  type DiscoveredJob,
} from '@/lib/discovered-job-contract';
import {
  opportunityDecisionListResponseSchema,
  type OpportunityDecision,
} from '@/lib/opportunity-decision';
import { searchProfileSchema, type SearchProfile } from '@/lib/search-profile';
import { useI18n } from '@/components/i18n/i18n-provider';
import { useCallback, useEffect, useState } from 'react';
type LoadState = 'loading' | 'ready' | 'error';
export function useApplicationsPipeline() {
  const { locale } = useI18n();
  const [opportunities, setOpportunities] = useState<DiscoveredJob[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [decisions, setDecisions] = useState<OpportunityDecision[]>([]);
  const [searchProfiles, setSearchProfiles] = useState<SearchProfile[]>([]);
  const [rankingProfileId, setRankingProfileId] = useState('');
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string>();
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const controller = signal ? undefined : new AbortController();
      const activeSignal = signal ?? controller!.signal;
      try {
        const [
          opportunityResponse,
          applicationResponse,
          decisionResponse,
          searchProfileResponse,
        ] = await Promise.all([
          readOpportunities(activeSignal),
          readApplications(activeSignal),
          readOpportunityDecisions(activeSignal),
          readSearchProfiles(activeSignal),
        ]);
        if (
          !opportunityResponse.ok ||
          !applicationResponse.ok ||
          !decisionResponse.ok ||
          !searchProfileResponse.ok
        )
          throw new Error(
            opportunityResponse.status === 401 ||
              applicationResponse.status === 401 ||
              decisionResponse.status === 401 ||
              searchProfileResponse.status === 401
              ? locale === 'fr'
                ? 'Connectez-vous pour retrouver vos opportunités et candidatures.'
                : 'Sign in to view your opportunities and applications.'
              : locale === 'fr'
                ? 'Impossible de charger cet espace.'
                : 'This workspace could not be loaded.',
          );
        const opportunityPayload = opportunityListResponseSchema.parse(
          await opportunityResponse.json(),
        );
        const applicationPayload: unknown = await applicationResponse.json();
        const decisionPayload = opportunityDecisionListResponseSchema.parse(
          await decisionResponse.json(),
        );
        const searchProfilePayload: unknown =
          await searchProfileResponse.json();
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
        setDecisions(decisionPayload.decisions);
        const parsedSearchProfiles = searchProfileSchema
          .array()
          .parse(
            typeof searchProfilePayload === 'object' &&
              searchProfilePayload !== null &&
              'searchProfiles' in searchProfilePayload
              ? searchProfilePayload.searchProfiles
              : [],
          );
        setSearchProfiles(parsedSearchProfiles);
        setRankingProfileId((current) =>
          parsedSearchProfiles.some(
            ({ searchProfileId }) => searchProfileId === current,
          )
            ? current
            : (parsedSearchProfiles.find(({ active }) => active)
                ?.searchProfileId ?? ''),
        );
        setLoadState('ready');
      } catch (caught) {
        if (!activeSignal.aborted) {
          setLoadState('error');
          setError(
            caught instanceof Error
              ? caught.message
              : locale === 'fr'
                ? 'Impossible de charger cet espace.'
                : 'This workspace could not be loaded.',
          );
        }
      }
      return () => controller?.abort();
    },
    [locale],
  );

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void load(controller.signal));
    return () => controller.abort();
  }, [load]);

  function addOpportunity(opportunity: DiscoveredJob) {
    setOpportunities((current) => [
      opportunity,
      ...current.filter(
        (item) => item.opportunityId !== opportunity.opportunityId,
      ),
    ]);
  }

  function retry() {
    setLoadState('loading');
    setError(undefined);
    void load();
  }

  function decisionSaved(decision: OpportunityDecision) {
    setDecisions((current) => [
      decision,
      ...current.filter((item) => item.decisionId !== decision.decisionId),
    ]);
  }

  return {
    opportunities,
    applications,
    decisions,
    searchProfiles,
    rankingProfileId,
    setRankingProfileId,
    loadState,
    error,
    retry,
    addOpportunity,
    decisionSaved,
  };
}
