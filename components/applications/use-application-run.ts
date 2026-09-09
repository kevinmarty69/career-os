'use client';
import { readApplicationRun, readProfile } from '@/lib/career-api';
import { persistedRunSchema, type PersistedRun } from '@/lib/run-contract';
import { useEffect, useState } from 'react';
export type WorkflowError =
  | 'auth'
  | 'profile-missing'
  | 'conflict'
  | 'rate-limited'
  | 'worker-unavailable'
  | 'unavailable';

export type ApplicationRunState = {
  applicationId: string;
  profileRevision: number;
  run?: PersistedRun;
  error?: WorkflowError;
};

// A response started before a mutation or navigation must not replace newer state.
export function applyRunPoll(
  latest: ApplicationRunState | undefined,
  requested: ApplicationRunState,
  run: PersistedRun,
) {
  return latest === requested ? { ...latest, run, error: undefined } : latest;
}

export function useApplicationRun(applicationId: string) {
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const update = () => setRefresh((value) => value + 1);
    window.addEventListener('career-os:decisions-synced', update);
    return () =>
      window.removeEventListener('career-os:decisions-synced', update);
  }, []);
  const [result, setResult] = useState<ApplicationRunState>();
  const current = result?.applicationId === applicationId ? result : undefined;
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      readProfile(controller.signal),
      readApplicationRun(applicationId, controller.signal),
    ])
      .then(async ([profileResponse, runResponse]) => {
        if (controller.signal.aborted) return;
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
        if (controller.signal.aborted) return;
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
        if (controller.signal.aborted) return;
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
        if (
          !controller.signal.aborted &&
          (!(error instanceof DOMException) || error.name !== 'AbortError')
        )
          setResult({
            applicationId,
            profileRevision: 0,
            error: 'unavailable',
          });
      });
    return () => controller.abort();
  }, [applicationId, refresh]);

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
          if (run.success && !controller.signal.aborted)
            setResult((latest) =>
              controller.signal.aborted
                ? latest
                : applyRunPoll(latest, current, run.data),
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
  }, [applicationId, current]);

  return { current, setResult };
}
