import { persistedPublicationOperation } from './run-operation';
import type { SearchProfileFields } from './search-profile';
import type { OpportunityDecisionInput } from './opportunity-decision';
import type { ApplicationTimelineInput } from './application-timeline';
import type { ApplicationTask, ApplicationTaskInput } from './application-task';
import type {
  ApplicationContactDraft,
  UpdateApplicationContactInput,
} from './application-contact';

export function readProfile(signal: AbortSignal) {
  return fetch('/api/profile', { cache: 'no-store', signal });
}

export function readProfileHistory(signal: AbortSignal) {
  return fetch('/api/profile/history', { cache: 'no-store', signal });
}

export function readApplicationInsights(signal: AbortSignal) {
  return fetch('/api/insights', { cache: 'no-store', signal });
}

export function readApplications(signal: AbortSignal) {
  return fetch('/api/applications', { cache: 'no-store', signal });
}

export function readPublications(signal: AbortSignal) {
  return fetch('/api/publications', { cache: 'no-store', signal });
}

export function readApplication(applicationId: string, signal: AbortSignal) {
  return fetch(`/api/applications/${applicationId}`, {
    cache: 'no-store',
    signal,
  });
}

export function readApplicationTimeline(
  applicationId: string,
  signal: AbortSignal,
) {
  return fetch(`/api/applications/${applicationId}/timeline`, {
    cache: 'no-store',
    signal,
  });
}

export function createApplicationTimelineEvent(
  applicationId: string,
  input: ApplicationTimelineInput,
) {
  return fetch(`/api/applications/${applicationId}/timeline`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function readApplicationTasks(
  applicationId: string,
  signal: AbortSignal,
) {
  return fetch(`/api/applications/${applicationId}/tasks`, {
    cache: 'no-store',
    signal,
  });
}

export function createApplicationTask(
  applicationId: string,
  input: ApplicationTaskInput,
) {
  return fetch(`/api/applications/${applicationId}/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function setApplicationTaskCompleted(
  task: Pick<ApplicationTask, 'applicationId' | 'taskId' | 'revision'>,
  completed: boolean,
) {
  return fetch(`/api/applications/${task.applicationId}/tasks/${task.taskId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ completed, expectedRevision: task.revision }),
  });
}

export function readApplicationContacts(
  applicationId: string,
  signal: AbortSignal,
) {
  return fetch(`/api/applications/${applicationId}/contacts`, {
    cache: 'no-store',
    signal,
  });
}

export function createApplicationContact(
  applicationId: string,
  input: ApplicationContactDraft,
) {
  return fetch(`/api/applications/${applicationId}/contacts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateApplicationContact(
  applicationId: string,
  contactId: string,
  input: UpdateApplicationContactInput,
) {
  return fetch(`/api/applications/${applicationId}/contacts/${contactId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
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
