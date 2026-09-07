import 'server-only';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { database } from './database';
import { serverSupabase } from './supabase';

export const workspaceCookie = 'career-os-workspace';

// A revoked JWT must stop working immediately, not only at token expiry.
export async function authenticatedAccount() {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return;
  const verified = await supabase.auth.getClaims();
  const sessionId = z
    .string()
    .uuid()
    .safeParse(verified.data?.claims.session_id);
  if (
    verified.error ||
    !sessionId.success ||
    verified.data?.claims.sub !== data.user.id
  )
    return;
  const [session] = await database()<{ created_at: Date }[]>`
    select * from career_identity.active_session(${data.user.id}::uuid, ${sessionId.data}::uuid)`;
  if (!session) return;
  return {
    user: data.user,
    sessionId: sessionId.data,
    sessionCreatedAt: session.created_at,
  };
}

export async function authenticatedPublicationSession(_request: Request) {
  void _request; // Route handlers share this signature with the local test-session resolver.
  const account = await authenticatedAccount();
  if (!account) return;
  const selected = z
    .string()
    .uuid()
    .safeParse((await cookies()).get(workspaceCookie)?.value);
  if (!selected.success) return;
  const [membership] = await database()<{ name: string }[]>`
    select o.name from career_identity.member m
    join career_identity.organization o on o.id = m."organizationId"
    where m."organizationId" = ${selected.data}::uuid and m."userId" = ${account.user.id}::uuid`;
  return membership
    ? {
        userId: account.user.id,
        tenantId: selected.data,
        tenantName: membership.name,
        sessionCreatedAt: account.sessionCreatedAt,
      }
    : undefined;
}
