'use client';
import { createPublication, revokePublication } from '@/lib/career-api';
import type { PersistedRun } from '@/lib/run-contract';
import {
  createdPublicationSchema,
  type CreatedPublication,
} from '@/lib/schemas';
import { useState } from 'react';
export type PublicationActionError =
  | 'clipboard-unavailable'
  | 'auth'
  | 'review-rejected'
  | 'conflict'
  | 'rate-limited'
  | 'revocation-rejected'
  | 'unavailable';

export function useApplicationPublication(
  run: PersistedRun | undefined,
  onPublished: (run: PersistedRun) => void,
  disabled: boolean,
) {
  const [publication, setPublication] = useState<CreatedPublication>();
  const [publicationPending, setPublicationPending] = useState<
    'publish' | 'revoke'
  >();
  const [publicationError, setPublicationError] =
    useState<PublicationActionError>();
  const [publicationRevoked, setPublicationRevoked] = useState(false);

  async function publish() {
    if (disabled || !run?.publicationEligible || publicationPending) return;
    setPublicationPending('publish');
    setPublicationError(undefined);
    try {
      const response = await createPublication(run.runId);
      if (!response.ok) {
        setPublicationError(publicationErrorFromStatus(response.status));
        return;
      }
      const created = createdPublicationSchema.parse(await response.json());
      setPublication(created);
      setPublicationRevoked(false);
      onPublished({ ...run, status: 'completed', stage: 'publication_ready' });
    } catch {
      setPublicationError('unavailable');
    } finally {
      setPublicationPending(undefined);
    }
  }

  async function copyPublicationLink() {
    if (!publication) return;
    try {
      await navigator.clipboard.writeText(
        `${location.origin}/p/${publication.publicationId}#${publication.rawToken}`,
      );
    } catch {
      setPublicationError('clipboard-unavailable');
    }
  }

  async function revoke() {
    if (disabled || !publication || publicationPending) return;
    setPublicationPending('revoke');
    setPublicationError(undefined);
    try {
      const response = await revokePublication(publication.publicationId);
      if (!response.ok) {
        setPublicationError(
          response.status === 403
            ? 'revocation-rejected'
            : publicationErrorFromStatus(response.status),
        );
        return;
      }
      setPublication(undefined);
      setPublicationRevoked(true);
    } catch {
      setPublicationError('unavailable');
    } finally {
      setPublicationPending(undefined);
    }
  }

  return {
    publication,
    publicationPending,
    publicationError,
    publicationRevoked,
    publish,
    revoke,
    copyPublicationLink,
    resetPublication() {
      setPublication(undefined);
      setPublicationRevoked(false);
    },
  };
}
function publicationErrorFromStatus(status: number): PublicationActionError {
  if (status === 401) return 'auth';
  if (status === 400) return 'review-rejected';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate-limited';
  return 'unavailable';
}
