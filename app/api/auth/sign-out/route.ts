import { cookies } from 'next/headers';
import { workspaceCookie } from '@/lib/server/auth';
import { isSameOrigin } from '@/lib/server/http';
import { serverSupabase } from '@/lib/server/supabase';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  try {
    const { error } = await (
      await serverSupabase()
    ).auth.signOut({ scope: 'local' });
    if (error) return new Response('Sign out failed', { status: 503 });
    (await cookies()).delete(workspaceCookie);
    return new Response(null, {
      status: 204,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return new Response('Sign out unavailable', { status: 503 });
  }
}
