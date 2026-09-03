import type { ApplicationDossier } from './workspace-state';

export function readProfile(signal: AbortSignal) {
  return fetch('/api/profile', { cache: 'no-store', signal });
}

export function readApplications(signal: AbortSignal) {
  return fetch('/api/applications', { cache: 'no-store', signal });
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
  return fetch('/api/publications', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ runId }),
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
