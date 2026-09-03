import 'server-only';
import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins';
import { Pool } from 'pg';
import { z } from 'zod';
import { organizationOptions } from './auth-config';

const authenticatedSessionSchema = z.object({
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
});

export const authPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  options: '-c search_path=auth,public',
});

export const auth = betterAuth({
  appName: 'Career OS',
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: authPool,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
  },
  rateLimit: {
    customRules:
      process.env.CAREER_OS_E2E === '1'
        ? { '/sign-up/email': false }
        : undefined,
  },
  advanced: {
    cookiePrefix: 'career_os',
    database: { generateId: 'uuid' },
  },
  plugins: [organization(organizationOptions)],
});

export async function authenticatedPublicationSession(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true, disableRefresh: true },
  });
  const identity = authenticatedSessionSchema.safeParse({
    userId: session?.user.id,
    tenantId: session?.session.activeOrganizationId,
  });
  if (!identity.success) return;
  const membership = await authPool.query<{ name: string }>(
    `select o.name from auth."member" m
     join auth.organization o on o.id = m."organizationId"
     where m."organizationId" = $1::uuid and m."userId" = $2::uuid
     limit 1`,
    [identity.data.tenantId, identity.data.userId],
  );
  return membership.rowCount === 1
    ? { ...identity.data, tenantName: membership.rows[0].name }
    : undefined;
}
