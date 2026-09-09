'use client';

import type { Application } from '@/lib/application-contract';
import {
  approveRunStrategy,
  confirmRunResearch,
  createRun,
  decideRunReviewIssue,
  startRunReviews,
  startRunStrategy,
} from '@/lib/career-api';
import {
  persistedRunSchema,
  reviewIssueDecisionResultSchema,
} from '@/lib/run-contract';
import { persistedRunOperation } from '@/lib/run-operation';
import { useState } from 'react';
import { useDecisionOutbox } from '@/components/decision-outbox-provider';
import { useApplicationPublication } from './use-application-publication';
import { useApplicationRun } from './use-application-run';
export type { PublicationActionError } from './use-application-publication';

export function useApplicationWorkflow(applicationId: string) {
  const outbox = useDecisionOutbox();
  const { current, setResult } = useApplicationRun(applicationId);
  const [starting, setStarting] = useState(false);
  const [decisionPending, setDecisionPending] = useState(false);
  const [decisionError, setDecisionError] = useState(false);
  const [reviewPending, setReviewPending] = useState<string>();
  const [reviewError, setReviewError] = useState(false);
  const publicationActions = useApplicationPublication(
    current?.run,
    (run) => {
      setResult((latest) =>
        latest?.run?.runId === run.runId
          ? {
              ...latest,
              run: { ...latest.run, status: run.status, stage: run.stage },
            }
          : latest,
      );
    },
    starting || decisionPending || Boolean(reviewPending),
  );
  async function start(application: Application, forceNew = false) {
    if (
      !current ||
      current.profileRevision < 1 ||
      starting ||
      publicationActions.publicationPending ||
      decisionPending ||
      reviewPending
    )
      return;
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
        publicationActions.resetPublication();
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
    if (
      !current?.run ||
      reviewPending ||
      outbox.items.some((item) => item.runId === current.run?.runId)
    )
      return;
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
      if (!navigator.onLine) {
        await outbox.enqueue({
          key: operation.key,
          runId: current.run.runId,
          applicationId,
          input: { reviewId, issueIndex, decision },
        });
        return;
      }
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
    ...publicationActions,
    approveStrategy,
    confirmResearch,
    decideReview,
    decisionError,
    decisionPending,
    loading: !current,
    reviewError,
    reviewPending:
      reviewPending ??
      (() => {
        const queued = outbox.items.find(
          (item) => item.runId === current?.run?.runId,
        );
        return queued
          ? `${queued.input.reviewId}:${queued.input.issueIndex}`
          : undefined;
      })(),
    start,
    startReviews,
    startStrategy,
    starting,
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
