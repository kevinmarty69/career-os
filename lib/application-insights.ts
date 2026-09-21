import { z } from 'zod';
import type { Application } from './application-contract';
import type { ApplicationTimelineEvent } from './application-timeline';

const weeklyInsightSchema = z
  .object({
    weekStart: z.string().datetime(),
    responses: z.number().int().nonnegative(),
    interviews: z.number().int().nonnegative(),
    outcomes: z.number().int().nonnegative(),
  })
  .strict();

export const applicationInsightsSchema = z
  .object({
    totalApplications: z.number().int().nonnegative(),
    sentOrLater: z.number().int().nonnegative(),
    applicationsWithResponse: z.number().int().nonnegative(),
    responseCoveragePct: z.number().int().min(0).max(100).nullable(),
    interviews: z.number().int().nonnegative(),
    outcomes: z.number().int().nonnegative(),
    weekly: z.array(weeklyInsightSchema).length(8),
    ageCohorts: z.array(
      z
        .object({
          age: z.enum(['0-6', '7-13', '14-27', '28+', 'unknown']),
          applications: z.number().int().nonnegative(),
          responses: z.number().int().nonnegative(),
          withoutResponse: z.number().int().nonnegative(),
          responsePct: z.number().int().min(0).max(100).nullable(),
        })
        .strict(),
    ),
  })
  .strict();

export type ApplicationInsights = z.infer<typeof applicationInsightsSchema>;

export function summarizeApplicationInsights(
  applications: Pick<Application, 'applicationId' | 'stage' | 'submittedOn'>[],
  events: Pick<
    ApplicationTimelineEvent,
    'applicationId' | 'kind' | 'occurredAt'
  >[],
  now = new Date(),
): ApplicationInsights {
  const sentIds = new Set(
    applications
      .filter(({ stage }) => stage !== 'draft')
      .map(({ applicationId }) => applicationId),
  );
  const responseIds = new Set(
    events
      .filter(
        ({ applicationId, kind, occurredAt }) =>
          kind === 'response' &&
          sentIds.has(applicationId) &&
          new Date(occurredAt) <= now,
      )
      .map(({ applicationId }) => applicationId),
  );
  const currentWeek = startOfUtcWeek(now);
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const ageCohorts = (['0-6', '7-13', '14-27', '28+', 'unknown'] as const).map(
    (age) => ({
      age,
      applications: 0,
      responses: 0,
      withoutResponse: 0,
      responsePct: null as number | null,
    }),
  );
  for (const application of applications) {
    if (!sentIds.has(application.applicationId)) continue;
    const days = application.submittedOn
      ? (today - Date.parse(`${application.submittedOn}T00:00:00Z`)) /
        86_400_000
      : NaN;
    const index =
      !Number.isFinite(days) || days < 0
        ? 4
        : days < 7
          ? 0
          : days < 14
            ? 1
            : days < 28
              ? 2
              : 3;
    const cohort = ageCohorts[index]!;
    cohort.applications += 1;
    if (responseIds.has(application.applicationId)) cohort.responses += 1;
    else cohort.withoutResponse += 1;
    cohort.responsePct = Math.round(
      (cohort.responses / cohort.applications) * 100,
    );
  }
  const weekly = Array.from({ length: 8 }, (_, index) => ({
    weekStart: new Date(
      currentWeek.getTime() - (7 - index) * 7 * 24 * 60 * 60 * 1_000,
    ).toISOString(),
    responses: 0,
    interviews: 0,
    outcomes: 0,
  }));
  const firstWeek = new Date(weekly[0]!.weekStart).getTime();
  for (const event of events) {
    if (new Date(event.occurredAt) > now) continue;
    if (!['response', 'interview', 'outcome'].includes(event.kind)) continue;
    const index = Math.floor(
      (new Date(event.occurredAt).getTime() - firstWeek) /
        (7 * 24 * 60 * 60 * 1_000),
    );
    if (index < 0 || index >= weekly.length) continue;
    const bucket = weekly[index]!;
    if (event.kind === 'response') bucket.responses += 1;
    if (event.kind === 'interview') bucket.interviews += 1;
    if (event.kind === 'outcome') bucket.outcomes += 1;
  }
  return applicationInsightsSchema.parse({
    totalApplications: applications.length,
    sentOrLater: sentIds.size,
    applicationsWithResponse: responseIds.size,
    responseCoveragePct: sentIds.size
      ? Math.round((responseIds.size / sentIds.size) * 100)
      : null,
    interviews: events.filter(({ kind }) => kind === 'interview').length,
    outcomes: events.filter(({ kind }) => kind === 'outcome').length,
    weekly,
    ageCohorts,
  });
}

function startOfUtcWeek(value: Date) {
  const date = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date;
}
