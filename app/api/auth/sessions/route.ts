import { authenticatedAccount } from '@/lib/server/auth';
import { database } from '@/lib/server/database';

export async function GET() {
  try {
    const account = await authenticatedAccount();
    if (!account) return new Response('Unauthorized', { status: 401 });
    const sessions =
      await database()`select id as token, created_at as "createdAt",
      updated_at as "updatedAt", user_agent as "userAgent"
      from career_identity.user_sessions(${account.user.id}::uuid)`;
    return Response.json(
      { sessions, currentSessionId: account.sessionId },
      {
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  } catch {
    return new Response('Sessions unavailable', { status: 503 });
  }
}
