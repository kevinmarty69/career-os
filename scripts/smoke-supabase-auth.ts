import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  chromium,
  expect,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { databaseTls } from '../lib/database-tls';
import {
  applicationContactListSchema,
  applicationContactSchema,
} from '../lib/application-contact';
import { workspaceExportVersion } from '../lib/workspace-export-contract';

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
  let confirmationHash: string | undefined;
  let databaseConnected = false;
  try {
    await sql.connect();
    databaseConnected = true;
    for (let i = 0; i < 2; i++) {
      const email = `career-os-smoke-${randomUUID()}@example.com`;
      const password = randomBytes(24).toString('hex');
      if (i === 0) {
        // generateLink creates an unconfirmed signup without delivering email.
        // Exercise our real confirmation handler, not SMTP deliverability.
        const generated = await admin.auth.admin.generateLink({
          type: 'signup',
          email,
          password,
          options: { data: { name: 'Supabase smoke test' } },
        });
        if (generated.error)
          throw new Error(
            `Test signup link creation failed: ${generated.error.code}`,
          );
        identities.push({ id: generated.data.user.id, email, password });
        assert.ok(
          !generated.data.user.email_confirmed_at,
          'Synthetic signup starts unconfirmed',
        );
        confirmationHash = generated.data.properties.hashed_token;
        continue;
      }
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
    assert.ok(
      confirmationHash,
      'Synthetic signup confirmation token generated',
    );
    const confirmationPage = await contextA.newPage();
    let confirmationStep = 'callback redirect';
    try {
      const confirmationUrl = new URL('/auth/confirm', base);
      confirmationUrl.searchParams.set('token_hash', confirmationHash);
      confirmationUrl.searchParams.set('type', 'signup');
      await confirmationPage.goto(confirmationUrl.href);
      await confirmationPage.waitForURL('**/sign-in?workspace=1');
      assert.equal(
        new URL(confirmationPage.url()).origin,
        new URL(base).origin,
        'Confirmation retains cookie origin',
      );
      confirmationStep = 'authenticated session';
      const confirmationSession = await api(
        confirmationPage,
        '/api/auth/session',
      );
      assert.equal(
        confirmationSession.status,
        200,
        'Confirmation creates a valid server session',
      );
      const confirmed = await admin.auth.admin.getUserById(identities[0].id);
      confirmationStep = 'confirmed identity';
      assert.equal(confirmed.error, null);
      assert.ok(
        confirmed.data.user.email_confirmed_at,
        'Email marked confirmed by the real callback',
      );
      confirmationStep = 'confirmation session sign-out';
      assert.equal(
        (await api(confirmationPage, '/api/auth/sign-out', 'POST')).status,
        204,
      );
      await contextA.clearCookies();
    } catch {
      // Never leak the one-time confirmation token through a navigation error.
      throw new Error(
        `Synthetic signup confirmation failed at ${confirmationStep}. No SMTP delivery was attempted.`,
      );
    } finally {
      await confirmationPage.close();
    }
    console.log(
      'PASS: unconfirmed signup, real /auth/confirm route and verified session; generated link only, not SMTP deliverability.',
    );
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
    const contactsPath = `/api/applications/${applicationId}/contacts`;
    const initialContacts = await api(pageA, contactsPath);
    assert.equal(initialContacts.status, 200);
    assert.deepEqual(
      applicationContactListSchema.parse(JSON.parse(initialContacts.text))
        .contacts,
      [],
    );
    const contactDraft = {
      rank: 1,
      name: 'Synthetic Contact',
      role: 'Engineering leader',
      profileUrl: 'https://example.test/team/synthetic-contact',
      relationship: 'team_leader',
      rationale:
        'Synthetic fixture; not a real person and not evidence of hiring ownership.',
      sources: [
        {
          url: 'https://example.test/team',
          title: 'Synthetic source fixture',
          collectedAt: new Date().toISOString(),
          trust: 'weak',
          supports: ['identity', 'current_role'],
          excerpt:
            'Synthetic Contact is an Engineering leader at Synthetic smoke company.',
        },
      ],
      confidence: 'uncertain',
      connectionNote: 'Synthetic draft, never send.',
      acceptedMessage: 'Synthetic follow-up, never send.',
      followUpMessage: 'Synthetic reminder, never send.',
    };
    const contactCreated = await api(pageA, contactsPath, 'POST', contactDraft);
    assert.equal(
      contactCreated.status,
      201,
      'Human-authored contact persisted',
    );
    let contact = applicationContactSchema.parse(
      JSON.parse(contactCreated.text),
    );
    assert.equal(contact.status, 'suggested');
    const originalRevision = contact.revision;
    const contactPath = `${contactsPath}/${contact.contactId}`;
    for (const status of ['contacted', 'accepted', 'follow_up'] as const) {
      const updated = await api(pageA, contactPath, 'PATCH', {
        connectionNote: contact.connectionNote,
        acceptedMessage: contact.acceptedMessage,
        followUpMessage: contact.followUpMessage ?? null,
        status,
        followUpAt:
          status === 'follow_up'
            ? new Date(Date.now() + 86_400_000).toISOString()
            : null,
        expectedRevision: contact.revision,
      });
      assert.equal(updated.status, 200, `Contact status ${status} persisted`);
      const previousRevision = contact.revision;
      contact = applicationContactSchema.parse(JSON.parse(updated.text));
      assert.equal(contact.status, status);
      assert.equal(contact.revision, previousRevision + 1);
    }
    const staleUpdate = {
      connectionNote: 'Conflicting synthetic draft',
      acceptedMessage: contact.acceptedMessage,
      followUpMessage: contact.followUpMessage ?? null,
      status: contact.status,
      followUpAt: contact.followUpAt,
      expectedRevision: originalRevision,
    };
    assert.equal(
      (await api(pageA, contactPath, 'PATCH', staleUpdate)).status,
      409,
      'Stale contact edits cannot overwrite newer tracking',
    );
    assert.equal(
      (await api(pageB, contactsPath)).status,
      404,
      'Another account cannot list contacts',
    );
    assert.equal(
      (await api(pageB, contactsPath, 'POST', contactDraft)).status,
      404,
      'Another account cannot add a contact',
    );
    assert.equal(
      (await api(pageB, contactPath, 'PATCH', staleUpdate)).status,
      404,
      'Another account cannot update contacts',
    );
    assert.equal(
      (await api(pageB, `${contactsPath}/research`)).status,
      404,
      'Another account cannot read contact research',
    );

    // This synthetic application deliberately has no public URL/company sources.
    // Even if the local server has a model configured unexpectedly, this request
    // cannot fetch a page, reserve a run or dispatch a billable model request.
    const unavailableResearch = await api(
      pageA,
      `${contactsPath}/research`,
      'POST',
      { urls: [], locale: 'en' },
    );
    assert.equal(
      unavailableResearch.status,
      503,
      'Unconfigured/no-source research fails safely',
    );
    const researchReservations = await sql.query<{ total: string }>(
      'select count(*) as total from app.contact_research_runs where tenant_id = $1::uuid and application_id = $2::uuid',
      [workspaces[0].id, applicationId],
    );
    assert.equal(
      Number(researchReservations.rows[0].total),
      0,
      'Unavailable research consumed no reservation or provider call',
    );
    const emptyResearch = await api(pageA, `${contactsPath}/research`);
    assert.equal(emptyResearch.status, 200);
    assert.equal(JSON.parse(emptyResearch.text).research, null);

    await pageA.goto(
      `${base}/applications/${applicationId}/timeline?contacts=1`,
    );
    await expect(
      pageA.getByRole('dialog', {
        name: 'People to contact at Synthetic smoke company',
      }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      pageA.getByRole('textbox', { name: 'Connection note', exact: true }),
    ).toHaveValue(contact.connectionNote);
    await expect(
      pageA.getByRole('combobox', { name: /^Manual status/ }),
    ).toHaveValue('follow_up');
    await pageA.reload();
    await expect(
      pageA.getByRole('textbox', { name: 'Connection note', exact: true }),
    ).toHaveValue(contact.connectionNote);
    await expect(
      pageA.getByRole('combobox', { name: /^Manual status/ }),
    ).toHaveValue('follow_up');
    const persistedContacts = await api(pageA, contactsPath);
    assert.equal(persistedContacts.status, 200);
    assert.deepEqual(
      applicationContactListSchema.parse(JSON.parse(persistedContacts.text))
        .contacts,
      [contact],
      'Reload preserves sourced contact and manual follow-up',
    );
    console.log(
      'PASS: sourced contact creation, manual statuses, revision conflict, reload persistence, contact/research tenant isolation and unavailable research without provider reservation. No messages sent.',
    );
    if (process.env.CAREER_OS_SMOKE_CV) {
      await pageA.goto(`${base}/memory/import`);
      await pageA
        .locator('input[type="file"]')
        .setInputFiles(process.env.CAREER_OS_SMOKE_CV);
      await expect(
        pageA.getByRole('heading', { name: 'Review what was extracted' }),
      ).toBeVisible({ timeout: 30_000 });
      await pageA
        .getByLabel('I reviewed this selection and authorize the listed uses.')
        .check();
      await pageA
        .getByRole('button', { name: 'Confirm and save', exact: true })
        .click();
      await expect(
        pageA.getByRole('heading', { name: 'Your selection is saved.' }),
      ).toBeVisible({ timeout: 20_000 });
      const saved = await api(pageA, '/api/profile');
      assert.equal(saved.status, 200);
      const { profile, revision } = JSON.parse(saved.text);
      assert.ok(profile.claims.length > 0, 'PDF claims persisted');
      assert.equal(profile.sources.length, 1, 'PDF source persisted');
      profile.sources[0].title = 'Synthetic smoke provenance correction';
      profile.sources[0].locator = 'page 1, reviewed in synthetic workspace';
      const corrected = await api(pageA, '/api/profile', 'PUT', {
        profile,
        expectedRevision: revision,
      });
      assert.equal(corrected.status, 200, 'Provenance correction persisted');
      await pageA.reload();
      const reread = await api(pageA, '/api/profile');
      const savedSources = JSON.parse(reread.text).profile.sources;
      assert.equal(savedSources.length, 1);
      // A new profile revision gets new internal source IDs; compare provenance.
      assert.deepEqual(
        { ...savedSources[0], id: profile.sources[0].id },
        profile.sources[0],
      );
      const history = await api(pageA, '/api/profile/history');
      assert.equal(history.status, 200);
      assert.equal(
        JSON.parse(history.text).length,
        2,
        'Import and correction remain versioned',
      );
      console.log(
        `PASS: PDF import, human confirmation, provenance correction and revision history (${profile.claims.length} claims).`,
      );
    }
    for (const offerUrl of process.env.CAREER_OS_SMOKE_OFFERS?.split(
      ',',
    ).filter(Boolean) ?? []) {
      const imported = await api(
        pageA,
        '/api/opportunities/import-url',
        'POST',
        { url: offerUrl },
      );
      assert.ok(
        [200, 201].includes(imported.status),
        `Offer import failed (${new URL(offerUrl).hostname}): ${imported.status}`,
      );
      const opportunity = JSON.parse(imported.text).opportunity;
      assert.ok(opportunity.opportunityId, 'Imported opportunity persisted');
      const promoted = await api(
        pageA,
        `/api/opportunities/${opportunity.opportunityId}/application`,
        'POST',
      );
      assert.ok(
        [200, 201].includes(promoted.status),
        'Explicit opportunity promotion succeeds',
      );
      const promotedId = JSON.parse(promoted.text).applicationId;
      assert.equal(
        (await api(pageA, `/api/applications/${promotedId}`)).status,
        200,
      );
      await pageA.goto(`${base}/applications/${promotedId}`);
      await expect(
        pageA.getByRole('heading', { name: opportunity.role, exact: true }),
      ).toBeVisible();
      console.log(`PASS: offer imported from ${new URL(offerUrl).hostname}.`);
    }
    const exported = await api(pageA, '/api/workspace/export', 'POST');
    assert.equal(
      exported.status,
      200,
      'Workspace export uses the new membership schema',
    );
    const exportLines = exported.text.trimEnd().split('\n');
    const records = exportLines.map((line) => JSON.parse(line));
    assert.equal(records[0].type, 'manifest');
    assert.equal(records[0].data.version, workspaceExportVersion);
    assert.equal(records.at(-1).type, 'complete', 'Export stream completed');
    assert.equal(
      records.at(-1).data.sha256,
      createHash('sha256')
        .update(`${exportLines.slice(0, -1).join('\n')}\n`)
        .digest('hex'),
      'Export checksum verifies',
    );
    const exportedContact = records.find(
      (record) =>
        record.type === 'application_contacts' &&
        record.data.id === contact.contactId,
    )?.data;
    assert.ok(exportedContact, 'Export includes the persisted contact');
    assert.equal(exportedContact.status, 'follow_up');
    assert.equal(
      new Date(exportedContact.follow_up_at).toISOString(),
      contact.followUpAt,
    );
    assert.deepEqual(exportedContact.sources, contact.sources);
    assert.ok(
      records.every(
        (record) =>
          !record.data?.tenant_id || record.data.tenant_id === workspaces[0].id,
      ),
      'Export contains no other tenant rows',
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
    await expect(
      pageA.getByRole('heading', { name: 'Profile settings', exact: true }),
    ).toBeVisible();
    await expect(
      pageA.getByRole('heading', { name: 'Supabase smoke test', exact: true }),
    ).toBeVisible();
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
    const cleanupFailures: string[] = [];
    for (const workspace of workspaces) {
      try {
        await sql.query('begin');
        await sql.query(
          "select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.tenant_id', $2, true)",
          [workspace.ownerId, workspace.id],
        );
        await sql.query('select app.delete_workspace($1::uuid, $2)', [
          workspace.id,
          `DELETE ${workspace.id}`,
        ]);
        await sql.query('commit');
        const remaining = await sql.query<{ total: string }>(
          'select (select count(*) from app.application_contacts where tenant_id=$1::uuid) + (select count(*) from app.contact_research_runs where tenant_id=$1::uuid) as total',
          [workspace.id],
        );
        assert.equal(
          Number(remaining.rows[0].total),
          0,
          'Synthetic workspace deletion cascades to contacts/research',
        );
      } catch {
        cleanupFailures.push(`workspace ${workspace.id}`);
        await sql.query('rollback').catch(() => undefined);
      }
    }
    for (const identity of identities) {
      try {
        await sql.query(
          'delete from career_identity."user" where id=$1::uuid',
          [identity.id],
        );
      } catch {
        cleanupFailures.push(`identity mirror ${identity.id}`);
      }
      try {
        const deleted = await admin.auth.admin.deleteUser(identity.id);
        if (deleted.error) throw new Error('Synthetic identity cleanup failed');
      } catch {
        cleanupFailures.push(`Supabase identity ${identity.id}`);
      }
    }
    try {
      if (databaseConnected) await sql.end();
    } catch {
      cleanupFailures.push('database connection');
    }
    try {
      await browser.close();
    } catch {
      cleanupFailures.push('browser');
    }
    if (cleanupFailures.length) {
      // Preserve the original test failure while still attempting every cleanup.
      // These are only UUIDs captured from synthetic objects created above.
      console.error(
        `Cleanup incomplete for synthetic smoke objects: ${cleanupFailures.join(', ')}`,
      );
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
