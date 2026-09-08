import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { authenticatedAccount, workspaceCookie } from '@/lib/server/auth';
import { authorize, database } from '@/lib/server/database';
import {
  applicationOrigin,
  isSameOrigin,
  readBoundedJson,
  PayloadTooLargeError,
} from '@/lib/server/http';

const noStore = { 'Cache-Control': 'private, no-store' };

export async function GET() {
  try {
    const account = await authenticatedAccount();
    if (!account) return new Response('Unauthorized', { status: 401 });
    const organizations = await database()`
      select o.id, o.name from career_identity.organization o
      join career_identity.member m on m."organizationId" = o.id
      where m."userId" = ${account.user.id}::uuid order by o."createdAt"`;
    return Response.json(organizations, { headers: noStore });
  } catch {
    return new Response('Workspaces unavailable', { status: 503 });
  }
}

export async function POST(request: Request) {
  return mutate(request, true);
}
export async function PATCH(request: Request) {
  return mutate(request, false);
}

async function mutate(request: Request, create: boolean) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  try {
    const account = await authenticatedAccount();
    if (!account) return new Response('Unauthorized', { status: 401 });
    const input = await readBoundedJson(request, 1024);
    let id: string;
    const sql = database();
    if (create) {
      const { name } = z
        .object({ name: z.string().trim().min(2).max(80) })
        .parse(input);
      id = randomUUID();
      await sql.begin(async (tx) => {
        // Profile mirror only: Supabase owns credentials and authentication.
        await tx`select pg_advisory_xact_lock(hashtextextended(${account.user.id}, 0))`;
        const [count] = await tx<
          { total: number }[]
        >`select count(*)::int as total
          from career_identity.member where "userId" = ${account.user.id}::uuid`;
        if (count.total >= 10) throw new Error('Workspace limit reached');
        await tx`insert into career_identity."user" (id, name, email, "emailVerified")
          values (${account.user.id}::uuid, ${String(account.user.user_metadata.name ?? account.user.user_metadata.full_name ?? '')},
            ${account.user.email ?? ''}, ${Boolean(account.user.email_confirmed_at)})
          on conflict (id) do update set name = excluded.name, email = excluded.email,
            "emailVerified" = excluded."emailVerified", "updatedAt" = now()`;
        await tx`insert into career_identity.organization (id, name, slug, "createdAt")
          values (${id}::uuid, ${name}, ${id}, now())`;
        await tx`insert into career_identity.member (id, "organizationId", "userId", role, "createdAt")
          values (${randomUUID()}::uuid, ${id}::uuid, ${account.user.id}::uuid, 'owner', now())`;
        await authorize(tx, { userId: account.user.id, tenantId: id });
        await tx`insert into app.tenants(id, owner_id, name) values (${id}::uuid, ${account.user.id}::uuid, ${name})`;
      });
    } else {
      id = z.object({ id: z.string().uuid() }).parse(input).id;
      const [member] = await sql`select id from career_identity.member
        where "organizationId" = ${id}::uuid and "userId" = ${account.user.id}::uuid`;
      if (!member) return new Response('Forbidden', { status: 403 });
    }
    (await cookies()).set(workspaceCookie, id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: applicationOrigin().protocol === 'https:',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return Response.json({ id }, { headers: noStore });
  } catch (error) {
    return new Response('Workspace change rejected', {
      status:
        error instanceof PayloadTooLargeError
          ? 413
          : error instanceof z.ZodError || error instanceof SyntaxError
            ? 400
            : 503,
    });
  }
}
