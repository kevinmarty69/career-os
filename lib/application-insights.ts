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
  })
  .strict();

export type ApplicationInsights = z.infer<typeof applicationInsightsSchema>;

export function summarizeApplicationInsights(
  applications: Pick<Application, 'applicationId' | 'stage'>[],
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
        ({ applicationId, kind }) =>
          kind === 'response' && sentIds.has(applicationId),
      )
      .map(({ applicationId }) => applicationId),
  );
  const currentWeek = startOfUtcWeek(now);
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
  });
}

function startOfUtcWeek(value: Date) {
  const date = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date;
}
