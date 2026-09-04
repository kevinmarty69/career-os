import type { ApplicationDossier } from './workspace-state';
import { persistedPublicationOperation } from './run-operation';
import type { SearchProfileFields } from './search-profile';
import type { OpportunityDecisionInput } from './opportunity-decision';

export function readProfile(signal: AbortSignal) {
  return fetch('/api/profile', { cache: 'no-store', signal });
}

export function readProfileHistory(signal: AbortSignal) {
  return fetch('/api/profile/history', { cache: 'no-store', signal });
}

export function readApplications(signal: AbortSignal) {
  return fetch('/api/applications', { cache: 'no-store', signal });
}

export function readApplication(applicationId: string, signal: AbortSignal) {
  return fetch(`/api/applications/${applicationId}`, {
    cache: 'no-store',
    signal,
  });
}

export function saveApplicationBrand(
  application: import('./application-contract').Application,
  logoUrl: string | undefined,
  accent: string,
) {
  return fetch(`/api/applications/${application.applicationId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      company: application.company,
      role: application.role,
      description: application.description,
      ...(application.url ? { url: application.url } : {}),
      ...(logoUrl ? { logoUrl } : {}),
      accent,
      stage: application.stage,
      companySources: application.companySources ?? [],
      expectedRevision: application.revision,
    }),
  });
}

export function readApplicationRun(applicationId: string, signal: AbortSignal) {
  return fetch(`/api/applications/${applicationId}/run`, {
    cache: 'no-store',
    signal,
  });
}

export function readOpportunities(signal: AbortSignal) {
  return fetch('/api/opportunities', { cache: 'no-store', signal });
}

export function promoteOpportunityToApplication(opportunityId: string) {
  return fetch(`/api/opportunities/${opportunityId}/application`, {
    method: 'POST',
  });
}

export function readOpportunityDecisions(signal: AbortSignal) {
  return fetch('/api/opportunities/decisions', {
    cache: 'no-store',
    signal,
  });
}

export function saveOpportunityDecision(
  opportunityId: string,
  input: OpportunityDecisionInput,
  idempotencyKey: string,
) {
  return fetch(`/api/opportunities/${opportunityId}/decision`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify(input),
  });
}

export function readSemanticAnalysis(
  opportunityId: string,
  searchProfileId: string,
  signal: AbortSignal,
) {
  const query = new URLSearchParams({ searchProfileId });
  return fetch(
    `/api/opportunities/${opportunityId}/semantic-analysis?${query}`,
    { cache: 'no-store', signal },
  );
}

export function runSemanticAnalysis(
  opportunityId: string,
  searchProfileId: string,
  signal: AbortSignal,
) {
  const query = new URLSearchParams({ searchProfileId });
  return fetch(
    `/api/opportunities/${opportunityId}/semantic-analysis?${query}`,
    { method: 'POST', signal },
  );
}

export function importOpportunity(url: string, signal: AbortSignal) {
  return fetch('/api/opportunities/import-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
    signal,
  });
}

export function readSearchProfiles(signal: AbortSignal) {
  return fetch('/api/search-profiles', { cache: 'no-store', signal });
}

export function createSearchProfile(profile: SearchProfileFields) {
  return fetch('/api/search-profiles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(profile),
  });
}

export function updateSearchProfile(
  searchProfileId: string,
  profile: SearchProfileFields,
  expectedRevision: number,
) {
  return fetch(`/api/search-profiles/${searchProfileId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...profile, expectedRevision }),
  });
}

export function deleteSearchProfile(
  searchProfileId: string,
  expectedRevision: number,
) {
  return fetch(`/api/search-profiles/${searchProfileId}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedRevision }),
  });
}

export function readRun(runId: string, signal: AbortSignal) {
  return fetch(`/api/runs/${runId}`, { cache: 'no-store', signal });
}

export function saveApplication(dossier: ApplicationDossier) {
  const payload = {
    company: dossier.opportunity.company,
    role: dossier.opportunity.role,
    description: dossier.opportunity.description,
    ...(dossier.opportunity.url ? { url: dossier.opportunity.url } : {}),
    companySources: dossier.opportunity.companySources ?? [],
    accent: dossier.opportunity.accent,
    stage: 'draft' as const,
  };
  return fetch(
    dossier.applicationId
      ? `/api/applications/${dossier.applicationId}`
      : '/api/applications',
    {
      method: dossier.applicationId ? 'PATCH' : 'POST',
      headers: {
        'content-type': 'application/json',
        ...(!dossier.applicationId ? { 'idempotency-key': dossier.id } : {}),
      },
      body: JSON.stringify(
        dossier.applicationId
          ? { ...payload, expectedRevision: dossier.applicationRevision }
          : payload,
      ),
    },
  );
}

export function createRun(body: string, idempotencyKey: string) {
  return post('/api/runs', body, idempotencyKey);
}

export function decideRunReviewIssue(
  runId: string,
  body: string,
  idempotencyKey: string,
) {
  return post(`/api/runs/${runId}/review-decisions`, body, idempotencyKey);
}

export function confirmRunResearch(
  runId: string,
  body: string,
  idempotencyKey: string,
) {
  return post(`/api/runs/${runId}/evidence-selection`, body, idempotencyKey);
}

export function startRunStrategy(
  runId: string,
  body: string,
  idempotencyKey: string,
) {
  return post(`/api/runs/${runId}/strategy`, body, idempotencyKey);
}

export function approveRunStrategy(
  runId: string,
  body: string,
  idempotencyKey: string,
) {
  return post(`/api/runs/${runId}/strategy/approval`, body, idempotencyKey);
}

export function startRunReviews(
  runId: string,
  body: string,
  idempotencyKey: string,
) {
  return post(`/api/runs/${runId}/reviews`, body, idempotencyKey);
}

export function createPublication(runId: string) {
  const operation = persistedPublicationOperation(
    sessionStorage,
    `career-os-publication:${runId}`,
    runId,
  );
  return fetch('/api/publications', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(operation),
  });
}

export function revokePublication(publicationId: string) {
  return fetch(`/api/publications/${publicationId}`, { method: 'DELETE' });
}

export function saveProfile(profile: unknown, expectedRevision: number) {
  return fetch('/api/profile', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile, expectedRevision }),
  });
}

export function importJobPosting(url: string, signal: AbortSignal) {
  return fetch('/api/applications/import-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
    signal,
  });
}

export function readInstanceStatus(signal: AbortSignal) {
  return fetch('/api/instance-status', { cache: 'no-store', signal });
}

export async function isWorkerUnavailableResponse(response: Response) {
  try {
    const body: unknown = await response.json();
    return (
      typeof body === 'object' &&
      body !== null &&
      'code' in body &&
      body.code === 'WORKER_UNAVAILABLE'
    );
  } catch {
    return false;
  }
}

function post(path: string, body: string, idempotencyKey: string) {
  return fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body,
  });
}
