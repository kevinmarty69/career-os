'use client';

import { useEffect, useRef, useState } from 'react';
import { browserSupabase } from '@/lib/auth-client';
import {
  defaultNotificationPreferences,
  notificationPreferenceKey,
  notificationPreferencesSchema,
  type NotificationPreferences,
} from '@/lib/notification-preferences';

export function useNotificationPreferences() {
  const [preferences, setPreferences] = useState<NotificationPreferences>();
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const inFlight = useRef(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data, error } = await browserSupabase().auth.getUser();
        if (error || !data.user) throw new Error();
        const stored = notificationPreferencesSchema.parse(
          data.user.user_metadata[notificationPreferenceKey] ??
            defaultNotificationPreferences,
        );
        if (active) {
          setPreferences(stored);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [reload]);
  async function save(next: NotificationPreferences) {
    if (!preferences || inFlight.current) return false;
    inFlight.current = true;
    setSaving(true);
    setError(false);
    try {
      const validated = notificationPreferencesSchema.parse(next);
      const { data, error } = await browserSupabase().auth.updateUser({
        data: { [notificationPreferenceKey]: validated },
      });
      if (error || !data.user) throw new Error();
      setPreferences(
        notificationPreferencesSchema.parse(
          data.user.user_metadata[notificationPreferenceKey],
        ),
      );
      return true;
    } catch {
      setError(true);
      return false;
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }
  return {
    preferences,
    error,
    saving,
    save,
    retry: () => setReload((value) => value + 1),
  };
}
