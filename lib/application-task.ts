import { z } from 'zod';

export const applicationTaskKindSchema = z.enum(['task', 'follow_up']);

export const applicationTaskInputSchema = z
  .object({
    kind: applicationTaskKindSchema,
    title: z.string().trim().min(1).max(200),
    dueAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const updateApplicationTaskInputSchema = z
  .object({
    completed: z.boolean(),
    expectedRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export const applicationTaskSchema = applicationTaskInputSchema
  .extend({
    taskId: z.string().uuid(),
    applicationId: z.string().uuid(),
    completedAt: z.string().datetime().nullable(),
    revision: z.number().int().positive(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const applicationTaskListSchema = z
  .object({ tasks: z.array(applicationTaskSchema) })
  .strict();

export type ApplicationTaskInput = z.infer<typeof applicationTaskInputSchema>;
export type ApplicationTask = z.infer<typeof applicationTaskSchema>;
