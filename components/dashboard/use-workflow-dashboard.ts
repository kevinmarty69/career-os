'use client';

import {
  type Application,
  applicationSchema,
} from '@/lib/application-contract';
import {
  readApplicationRun,
  readApplications,
  readPublications,
  readUpcomingTasks,
} from '@/lib/career-api';
import { upcomingTasksSchema } from '@/lib/application-task';
import { type PersistedRun, persistedRunSchema } from '@/lib/run-contract';
import {
  type PublicationSummary,
  publicationSummarySchema,
} from '@/lib/server/publication-input';
import { useEffect, useState } from 'react';

export function useWorkflowDashboard() {
  const [upcoming, setUpcoming] =
    useState<ReturnType<typeof upcomingTasksSchema.parse>>();
  const [tasksUnavailable, setTasksUnavailable] = useState(false);
  const [dashboard, setDashboard] = useState<{
    applications: Application[];
    items: Array<{
      application: Application;
      run?: PersistedRun;
      unavailable?: boolean;
    }>;
    publications: PublicationSummary[];
  }>();
  const [error, setError] = useState<'auth' | 'unavailable'>();
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void readUpcomingTasks(controller.signal)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const parsed = upcomingTasksSchema.parse(await response.json());
        if (!controller.signal.aborted) {
          setUpcoming(parsed);
          setTasksUnavailable(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setTasksUnavailable(true);
      });
    void Promise.all([
      readApplications(controller.signal),
      readPublications(controller.signal),
    ])
      .then(async ([applicationResponse, publicationResponse]) => {
        if (
          applicationResponse.status === 401 ||
          publicationResponse.status === 401
        )
          return setError('auth');
        if (!applicationResponse.ok || !publicationResponse.ok)
          return setError('unavailable');
        const applicationPayload = (await applicationResponse.json()) as {
          applications?: unknown;
        };
        const publicationPayload = (await publicationResponse.json()) as {
          publications?: unknown;
        };
        const applications = applicationSchema
          .array()
          .parse(applicationPayload.applications);
        const publications = publicationSummarySchema
          .array()
          .parse(publicationPayload.publications);
        const items = [];
        // Bound concurrency without silently dropping older applications from the list.
        for (let offset = 0; offset < applications.length; offset += 4) {
          const batch = await Promise.all(
            applications.slice(offset, offset + 4).map(async (application) => {
              const response = await readApplicationRun(
                application.applicationId,
                controller.signal,
              );
              if (response.status === 204) return { application };
              if (!response.ok) return { application, unavailable: true };
              const run = persistedRunSchema.safeParse(await response.json());
              return run.success
                ? { application, run: run.data }
                : { application, unavailable: true };
            }),
          );
          items.push(...batch);
        }
        setDashboard({ applications, items, publications });
        setError(undefined);
      })
      .catch((caught: unknown) => {
        if (!(caught instanceof DOMException) || caught.name !== 'AbortError')
          setError('unavailable');
      });
    return () => controller.abort();
  }, [reload]);

  const unavailable =
    error ??
    (dashboard?.items.length &&
    dashboard.items.every((item) => item.unavailable)
      ? 'unavailable'
      : undefined);
  return {
    dashboard,
    upcoming,
    tasksUnavailable,
    error: unavailable,
    refresh: () => setReload((value) => value + 1),
  };
}
