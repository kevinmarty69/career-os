import { z } from 'zod';

export const notificationContextSchema = z.object({
  conflict: z
    .object({ id: z.string().max(100), count: z.number().int().positive() })
    .nullable(),
  tasks: z
    .array(
      z.object({
        id: z.uuid(),
        applicationId: z.uuid(),
        company: z.string().max(200),
        title: z.string().max(200),
        dueAt: z.iso.datetime(),
        kind: z.enum(['task', 'follow_up']),
      }),
    )
    .max(50),
  moreTasks: z.boolean(),
});

export type NotificationContext = z.infer<typeof notificationContextSchema>;
