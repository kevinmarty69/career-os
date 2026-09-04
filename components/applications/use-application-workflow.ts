'use client';

import { useEffect, useState } from 'react';
import type { Application } from '@/lib/application-contract';
import {
  approveRunStrategy,
  confirmRunResearch,
  createRun,
  decideRunReviewIssue,
  readApplicationRun,
  readProfile,
  startRunReviews,
  startRunStrategy,
} from '@/lib/career-api';
import {
  persistedRunSchema,
  reviewIssueDecisionResultSchema,
  type PersistedRun,
} from '@/lib/run-contract';
import { persistedRunOperation } from '@/lib/run-operation';

type WorkflowError =
  | 'auth'
  | 'profile-missing'
  | 'conflict'
  | 'rate-limited'
  | 'worker-unavailable'
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

  async function start(application: Application) {
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
      );
      const response = await createRun(input, operation.key);
      if (!response.ok) {
        setResult({
          ...current,
          error:
            response.status === 401
              ? 'auth'
              : response.status === 409
                ? 'conflict'
                : response.status === 429
                  ? 'rate-limited'
                  : response.status === 503
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

  return {
    ...current,
    approveStrategy,
    confirmResearch,
    decideReview,
    decisionError,
    decisionPending,
    loading: !current,
    reviewError,
    reviewPending,
    start,
    startReviews,
    startStrategy,
    starting,
  };
}
