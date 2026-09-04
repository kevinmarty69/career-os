import { z } from 'zod';

export const applicationTimelineKindSchema = z.enum([
  'contact',
  'interview',
  'response',
  'outcome',
]);

export const applicationTimelineInputSchema = z
  .object({
    kind: applicationTimelineKindSchema,
    title: z.string().trim().min(1).max(200),
    note: z.string().trim().max(2_000).optional(),
    occurredAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const applicationTimelineEventSchema = applicationTimelineInputSchema
  .extend({
    eventId: z.string().uuid(),
    applicationId: z.string().uuid(),
    actor: z.literal('human'),
    createdAt: z.string().datetime(),
  })
  .strict();

export const applicationTimelineListSchema = z
  .object({ events: z.array(applicationTimelineEventSchema) })
  .strict();

export type ApplicationTimelineInput = z.infer<
  typeof applicationTimelineInputSchema
>;
export type ApplicationTimelineEvent = z.infer<
  typeof applicationTimelineEventSchema
>;
