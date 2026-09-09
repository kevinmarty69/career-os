import { z } from 'zod';

export const notificationPreferenceKey = 'career_os_notifications_v1';
export const notificationPreferencesSchema = z
  .object({
    reviewReady: z.boolean(),
    runFailed: z.boolean(),
    followUp: z.boolean(),
    pageOpened: z.boolean(),
    weeklyDigest: z.boolean(),
    readEvents: z.array(z.string().min(1).max(300)).max(250),
  })
  .strict();
export type NotificationPreferences = z.infer<
  typeof notificationPreferencesSchema
>;
export const defaultNotificationPreferences: NotificationPreferences = {
  reviewReady: false,
  runFailed: false,
  followUp: false,
  pageOpened: false,
  weeklyDigest: false,
  readEvents: [],
};

export function markEventsRead(
  preferences: NotificationPreferences,
  events: string[],
) {
  // ponytail: retain 250 recent event receipts; a durable notification inbox can replace this bounded account preference.
  return notificationPreferencesSchema.parse({
    ...preferences,
    readEvents: [...new Set([...preferences.readEvents, ...events])].slice(
      -250,
    ),
  });
}
