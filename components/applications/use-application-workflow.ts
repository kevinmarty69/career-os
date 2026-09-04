'use client';

import { useEffect, useState } from 'react';
import type { Application } from '@/lib/application-contract';
import { createRun, readApplicationRun, readProfile } from '@/lib/career-api';
import { persistedRunSchema, type PersistedRun } from '@/lib/run-contract';
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

  return { ...current, loading: !current, start, starting };
}
