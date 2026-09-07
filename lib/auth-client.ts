'use client';

import { createBrowserClient } from '@supabase/ssr';
import { useEffect, useState } from 'react';

export function browserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase Auth is not configured.');
  return createBrowserClient(url, key);
}

export function useAuthUser() {
  const [user, setUser] = useState<{ name: string; email: string } | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    void fetch('/api/auth/session', { cache: 'no-store' })
      .then(async (response) => {
        if (response.ok) {
          const data = await response.json();
          if (active) setUser(data.user);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return user;
}
