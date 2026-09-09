import { z } from 'zod';

export const notificationHistoryCursorSchema = z
  .object({
    at: z.iso.datetime(),
    kind: z.enum(['run', 'link']),
    id: z
      .string()
      .regex(/^[1-9][0-9]{0,18}$/)
      .refine((id) => BigInt(id) <= 9223372036854775807n),
  })
  .strict();

export const notificationHistorySchema = z
  .object({
    events: z
      .array(
        z.object({
          id: z.string().max(30),
          kind: z.enum(['run', 'link']),
          at: z.iso.datetime(),
          company: z.string().max(200),
          summary: z.string().max(2000),
          applicationId: z.uuid(),
        }),
      )
      .max(50),
    nextCursor: notificationHistoryCursorSchema.nullable(),
  })
  .strict();

export type NotificationHistory = z.infer<typeof notificationHistorySchema>;
