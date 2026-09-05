'use client';

import { useEffect, useState } from 'react';
import type { Application } from '@/lib/application-contract';
import {
  approveRunStrategy,
  confirmRunResearch,
  createPublication,
  createRun,
  decideRunReviewIssue,
  readApplicationRun,
  readProfile,
  revokePublication,
  startRunReviews,
  startRunStrategy,
} from '@/lib/career-api';
import {
  persistedRunSchema,
  reviewIssueDecisionResultSchema,
  type PersistedRun,
} from '@/lib/run-contract';
import { persistedRunOperation } from '@/lib/run-operation';
import {
  createdPublicationSchema,
  type CreatedPublication,
} from '@/lib/schemas';

type WorkflowError =
  | 'auth'
  | 'profile-missing'
  | 'conflict'
  | 'rate-limited'
  | 'worker-unavailable'
  | 'unavailable';

export type PublicationActionError =
  | 'auth'
  | 'review-rejected'
  | 'conflict'
  | 'rate-limited'
  | 'revocation-rejected'
  | 'unavailable';

export function useApplicationWorkflow(applicationId: string) {
  const [result, setResult] = useState<{
    applicationId: string;
    profileRevision: number;
    run?: PersistedRun;
    error?: WorkflowError;
  }>();
  const [starting, setStarting] = useState(false);
  const [decisionPending, setDecisionPending] = useState(false);
  const [decisionError, setDecisionError] = useState(false);
  const [reviewPending, setReviewPending] = useState<string>();
  const [reviewError, setReviewError] = useState(false);
  const [publication, setPublication] = useState<CreatedPublication>();
  const [publicationPending, setPublicationPending] = useState<
    'publish' | 'revoke'
  >();
  const [publicationError, setPublicationError] =
    useState<PublicationActionError>();
  const [publicationRevoked, setPublicationRevoked] = useState(false);
  const current = result?.applicationId === applicationId ? result : undefined;

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      readProfile(controller.signal),
      readApplicationRun(applicationId, controller.signal),
    ])
      .then(async ([profileResponse, runResponse]) => {
        if (profileResponse.status === 401 || runResponse.status === 401)
          return setResult({
            applicationId,
            profileRevision: 0,
            error: 'auth',
          });
        if (
          !profileResponse.ok ||
          (!runResponse.ok && runResponse.status !== 204)
        )
          return setResult({
            applicationId,
            profileRevision: 0,
            error: 'unavailable',
          });
        const profile = (await profileResponse.json()) as {
          profile?: unknown;
          revision?: unknown;
        };
        if (!Number.isInteger(profile.revision) || Number(profile.revision) < 1)
          return setResult({
            applicationId,
            profileRevision: 0,
            error: 'profile-missing',
          });
        const run =
          runResponse.status === 204
            ? undefined
            : persistedRunSchema.safeParse(await runResponse.json());
        if (run && !run.success)
          return setResult({
            applicationId,
            profileRevision: Number(profile.revision),
            error: 'unavailable',
          });
        setResult({
          applicationId,
          profileRevision: Number(profile.revision),
          ...(run ? { run: run.data } : {}),
        });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException) || error.name !== 'AbortError')
          setResult({
            applicationId,
            profileRevision: 0,
            error: 'unavailable',
          });
      });
    return () => controller.abort();
  }, [applicationId]);

  useEffect(() => {
    if (current?.run?.status !== 'running') return;
    const controller = new AbortController();
    let pending = false;
    const timer = window.setInterval(() => {
      if (pending) return;
      pending = true;
      void readApplicationRun(applicationId, controller.signal)
        .then(async (response) => {
          if (!response.ok) return;
          const run = persistedRunSchema.safeParse(await response.json());
          if (run.success)
            setResult((latest) =>
              latest?.applicationId === applicationId
                ? { ...latest, run: run.data, error: undefined }
                : latest,
            );
        })
        .catch(() => undefined)
        .finally(() => {
          pending = false;
        });
    }, 3_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [applicationId, current?.run?.status]);

  async function start(application: Application, forceNew = false) {
    if (!current || current.profileRevision < 1 || starting) return;
    setStarting(true);
    try {
      const input = JSON.stringify({
        applicationId,
        applicationRevision: application.revision,
        profileRevision: current.profileRevision,
      });
      const operation = persistedRunOperation(
        localStorage,
        `career-os-run-request:${applicationId}`,
        input,
        forceNew,
      );
      const response = await createRun(input, operation.key);
      if (!response.ok) {
        const failure =
          response.status === 503
            ? await response.json().catch(() => undefined)
            : undefined;
        setResult({
          ...current,
          error:
            response.status === 401
              ? 'auth'
              : response.status === 409
                ? 'conflict'
                : response.status === 429
                  ? 'rate-limited'
                  : isWorkerUnavailable(failure)
                    ? 'worker-unavailable'
                    : 'unavailable',
        });
        return;
      }
      setResult({
        ...current,
        run: persistedRunSchema.parse(await response.json()),
        error: undefined,
      });
      if (forceNew) {
        setPublication(undefined);
        setPublicationRevoked(false);
      }
    } catch {
      setResult({ ...current, error: 'unavailable' });
    } finally {
      setStarting(false);
    }
  }

  async function confirmResearch(selectedSignalIds: string[]) {
    if (!current?.run?.research || decisionPending) return;
    setDecisionPending(true);
    setDecisionError(false);
    try {
      const input = JSON.stringify({
        researchArtifactId: current.run.research.artifactId,
        selectedSignalIds,
      });
      const operation = persistedRunOperation(
        localStorage,
        `career-os-research-selection:${current.run.runId}`,
        input,
      );
      const response = await confirmRunResearch(
        current.run.runId,
        input,
        operation.key,
      );
      if (!response.ok) {
        setDecisionError(true);
        return;
      }
      setResult({
        ...current,
        run: persistedRunSchema.parse(await response.json()),
        error: undefined,
      });
    } catch {
      setDecisionError(true);
    } finally {
      setDecisionPending(false);
    }
  }

  async function startStrategy() {
    if (!current?.run?.evidenceArchive || decisionPending) return;
    setDecisionPending(true);
    setDecisionError(false);
    try {
      const input = JSON.stringify({
        evidenceArtifactId: current.run.evidenceArchive.artifactId,
        evidenceArtifactHash: current.run.evidenceArchive.artifactHash,
      });
      const operation = persistedRunOperation(
        localStorage,
        `career-os-strategy-start:${current.run.runId}`,
        input,
      );
      const response = await startRunStrategy(
        current.run.runId,
        input,
        operation.key,
      );
      if (!response.ok) {
        setDecisionError(true);
        return;
      }
      setResult({
        ...current,
        run: persistedRunSchema.parse(await response.json()),
        error: undefined,
      });
    } catch {
      setDecisionError(true);
    } finally {
      setDecisionPending(false);
    }
  }

  async function approveStrategy() {
    if (!current?.run?.strategy || decisionPending) return;
    setDecisionPending(true);
    setDecisionError(false);
    try {
      const input = JSON.stringify({
        strategyArtifactId: current.run.strategy.artifactId,
        strategyArtifactHash: current.run.strategy.artifactHash,
      });
      const operation = persistedRunOperation(
        localStorage,
        `career-os-strategy-approval:${current.run.runId}`,
        input,
      );
      const response = await approveRunStrategy(
        current.run.runId,
        input,
        operation.key,
      );
      if (!response.ok) {
        setDecisionError(true);
        return;
      }
      setResult({
        ...current,
        run: persistedRunSchema.parse(await response.json()),
        error: undefined,
      });
    } catch {
      setDecisionError(true);
    } finally {
      setDecisionPending(false);
    }
  }

  async function startReviews() {
    if (!current?.run?.spec || decisionPending) return;
    setDecisionPending(true);
    setDecisionError(false);
    try {
      const input = '{}';
      const operation = persistedRunOperation(
        localStorage,
        `career-os-review-start:${current.run.runId}`,
        input,
      );
      const response = await startRunReviews(
        current.run.runId,
        input,
        operation.key,
      );
      if (!response.ok) {
        setDecisionError(true);
        return;
      }
      setResult({
        ...current,
        run: persistedRunSchema.parse(await response.json()),
        error: undefined,
      });
    } catch {
      setDecisionError(true);
    } finally {
      setDecisionPending(false);
    }
  }

  async function decideReview(
    reviewId: string,
    issueIndex: number,
    decision: 'keep' | 'correct',
  ) {
    if (!current?.run || reviewPending) return;
    const key = `${reviewId}:${issueIndex}`;
    setReviewPending(key);
    setReviewError(false);
    try {
      const input = JSON.stringify({ reviewId, issueIndex, decision });
      const operation = persistedRunOperation(
        localStorage,
        `career-os-review-decision:${current.run.runId}:${key}:${decision}`,
        input,
      );
      const response = await decideRunReviewIssue(
        current.run.runId,
        input,
        operation.key,
      );
      if (!response.ok) {
        setReviewError(true);
        return;
      }
      const result = reviewIssueDecisionResultSchema.parse(
        await response.json(),
      );
      if (result.correctedRun) {
        setResult({ ...current, run: result.correctedRun, error: undefined });
        return;
      }
      setResult({
        ...current,
        run: {
          ...current.run,
          stage: result.publicationEligible
            ? 'human_approval'
            : current.run.stage,
          reviewDecisions: [
            ...current.run.reviewDecisions.filter(
              (item) =>
                item.reviewId !== result.reviewId ||
                item.issueIndex !== result.issueIndex,
            ),
            {
              reviewId: result.reviewId,
              issueIndex: result.issueIndex,
              decision: result.decision,
            },
          ],
          publicationEligible: result.publicationEligible,
        },
        error: undefined,
      });
    } catch {
      setReviewError(true);
    } finally {
      setReviewPending(undefined);
    }
  }

  async function publish() {
    if (!current?.run?.publicationEligible || publicationPending) return;
    setPublicationPending('publish');
    setPublicationError(undefined);
    try {
      const response = await createPublication(current.run.runId);
      if (!response.ok) {
        setPublicationError(publicationErrorFromStatus(response.status));
        return;
      }
      const created = createdPublicationSchema.parse(await response.json());
      setPublication(created);
      setPublicationRevoked(false);
      setResult({
        ...current,
        run: {
          ...current.run,
          status: 'completed',
          stage: 'publication_ready',
        },
      });
    } catch {
      setPublicationError('unavailable');
    } finally {
      setPublicationPending(undefined);
    }
  }

  async function copyPublicationLink() {
    if (!publication) return;
    await navigator.clipboard.writeText(
      `${location.origin}/p/${publication.publicationId}#${publication.rawToken}`,
    );
  }

  async function revoke() {
    if (!publication || publicationPending) return;
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
    ...current,
    approveStrategy,
    confirmResearch,
    decideReview,
    decisionError,
    decisionPending,
    loading: !current,
    copyPublicationLink,
    publish,
    publication,
    publicationError,
    publicationPending,
    publicationRevoked,
    reviewError,
    reviewPending,
    start,
    startReviews,
    startStrategy,
    starting,
    revoke,
  };
}

function isWorkerUnavailable(value: unknown) {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    value.code === 'WORKER_UNAVAILABLE'
  );
}

function publicationErrorFromStatus(status: number): PublicationActionError {
  if (status === 401) return 'auth';
  if (status === 400) return 'review-rejected';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate-limited';
  return 'unavailable';
}
