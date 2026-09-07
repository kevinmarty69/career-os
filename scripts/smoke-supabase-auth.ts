import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { databaseTls } from '../lib/database-tls';

// Opt-in integration test. Only synthetic accounts created by this run are removed.
async function main() {
  const base = process.env.CAREER_OS_APP_URL;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !url || !key || process.env.ALLOW_SUPABASE_AUTH_SMOKE !== '1')
    throw new Error(
      'Set app/Supabase configuration and ALLOW_SUPABASE_AUTH_SMOKE=1.',
    );
  if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname))
    throw new Error('Run against the local app only.');
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sql = new Client({
    connectionString: process.env.MIGRATION_DATABASE_URL,
    ssl: databaseTls(),
  });
  const browser = await chromium.launch();
  const identities: { id: string; email: string; password: string }[] = [];
  const workspaces: { id: string; ownerId: string }[] = [];
  await sql.connect();
  try {
    for (let i = 0; i < 2; i++) {
      const email = `career-os-smoke-${randomUUID()}@example.com`;
      const password = randomBytes(24).toString('hex');
      const result = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: 'Supabase smoke test' },
      });
      if (result.error)
        throw new Error(`Test user creation failed: ${result.error.code}`);
      identities.push({ id: result.data.user.id, email, password });
    }

    async function signIn(
      context: BrowserContext,
      identity: (typeof identities)[number],
    ) {
      await context.addCookies([
        { name: 'career-os-locale', value: 'en', url: base! },
      ]);
      const page = await context.newPage();
      await page.goto(`${base}/sign-in`);
      await page.locator('input[name=email]').fill(identity.email);
      await page.locator('input[name=password]').fill(identity.password);
      await page.locator('form button[type=submit]').click();
      await page.waitForFunction(
        () =>
          Boolean(
            document.querySelector('input[name=workspace]') ||
            document.querySelector('.organization-list'),
          ),
        undefined,
        { timeout: 20_000 },
      );
      return page;
    }

    async function api(
      page: Page,
      path: string,
      method = 'GET',
      body?: unknown,
    ) {
      return page.evaluate(
        async ({ path, method, body }) => {
          const response = await fetch(path, {
            method,
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': crypto.randomUUID(),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
          });
          return { status: response.status, text: await response.text() };
        },
        { path, method, body },
      );
    }

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await signIn(contextA, identities[0]);
    const pageB = await signIn(contextB, identities[1]);
    for (const [page, identity] of [
      [pageA, identities[0]],
      [pageB, identities[1]],
    ] as const) {
      const created = await api(page, '/api/auth/workspaces', 'POST', {
        name: 'Supabase test workspace',
      });
      assert.equal(created.status, 200, 'Authenticated workspace creation');
      workspaces.push({
        id: JSON.parse(created.text).id,
        ownerId: identity.id,
      });
    }
    assert.equal((await api(pageA, '/api/profile')).status, 200);
    const application = await api(pageA, '/api/applications', 'POST', {
      company: 'Synthetic smoke company',
      role: 'Product Engineer',
      description:
        'Synthetic job used only to verify Supabase persistence and tenant isolation.',
      accent: '#5847e8',
    });
    assert.equal(
      application.status,
      201,
      'Application persisted with restricted backend credentials',
    );
    const applicationId = JSON.parse(application.text).applicationId;
    assert.equal(
      (await api(pageA, `/api/applications/${applicationId}`)).status,
      200,
    );
    assert.equal(
      (await api(pageB, `/api/applications/${applicationId}`)).status,
      404,
      'Another account cannot read persisted application data',
    );
    assert.equal(
      (await api(pageA, '/api/workspace/export', 'POST')).status,
      200,
      'Workspace export uses the new membership schema',
    );
    const denied = await api(pageB, '/api/auth/workspaces', 'PATCH', {
      id: workspaces[0].id,
    });
    assert.equal(
      denied.status,
      403,
      'Cross-account workspace selection denied',
    );
    await contextB.addCookies([
      { name: 'career-os-workspace', value: workspaces[0].id, url: base },
    ]);
    assert.equal(
      (await api(pageB, '/api/profile')).status,
      401,
      'Forged workspace cookie denied',
    );
    await contextB.addCookies([
      { name: 'career-os-workspace', value: workspaces[1].id, url: base },
    ]);
    const crossOrigin = await contextA.request.post(
      `${base}/api/auth/workspaces`,
      {
        headers: { origin: 'https://attacker.example' },
        data: { name: 'Forbidden workspace' },
      },
    );
    assert.equal(crossOrigin.status(), 403, 'Cross-origin mutation denied');

    const before = await api(pageA, '/api/auth/sessions');
    assert.equal(before.status, 200);
    assert.equal(JSON.parse(before.text).sessions.length, 1);
    await pageA.goto(`${base}/settings/profile`);
    await pageA.waitForSelector('h2:text("Supabase smoke test")');
    if (process.env.SMOKE_SCREENSHOT_PATH)
      await pageA.screenshot({ path: process.env.SMOKE_SCREENSHOT_PATH });
    const staleCookies = await contextA.cookies();
    await pageA.locator('details summary').first().click();
    await pageA.getByRole('button', { name: 'Sign out', exact: true }).click();
    await pageA.waitForURL('**/sign-in');
    await contextA.addCookies(staleCookies);
    assert.equal(
      (await api(pageA, '/api/profile')).status,
      401,
      'Signed-out session cannot be replayed',
    );
    console.log(
      'PASS: Supabase login, workspace creation, application persistence, export, two-account isolation, forged cookie, CSRF, session listing, UI logout and revoked-token replay.',
    );
  } finally {
    for (const workspace of workspaces) {
      await sql.query('begin');
      try {
        await sql.query(
          "select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.tenant_id', $2, true)",
          [workspace.ownerId, workspace.id],
        );
        await sql.query('select app.delete_workspace($1::uuid, $2)', [
          workspace.id,
          `DELETE ${workspace.id}`,
        ]);
        await sql.query('commit');
      } catch (error) {
        await sql.query('rollback');
        throw error;
      }
    }
    for (const identity of identities) {
      await sql.query('delete from career_identity."user" where id=$1::uuid', [
        identity.id,
      ]);
      const deleted = await admin.auth.admin.deleteUser(identity.id);
      if (deleted.error)
        throw new Error('Synthetic test account cleanup failed');
    }
    await sql.end();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
