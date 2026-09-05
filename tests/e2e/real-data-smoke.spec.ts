import { expect, test } from '@playwright/test';

const cvPath = process.env.CAREER_OS_SMOKE_CV;
const offerUrls =
  process.env.CAREER_OS_SMOKE_OFFERS?.split(',').filter(Boolean);
type OfferImportSuccess = {
  url: string;
  status: number;
  opportunityId: string;
  company?: string;
  role?: string;
  lifecycle: string;
};

test('imports a real CV and real offer URLs through the persisted workflow', async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    !cvPath || !offerUrls?.length,
    'Real smoke inputs are not configured.',
  );
  test.setTimeout(120_000);

  await context.addCookies([
    { name: 'career-os-locale', value: 'fr', url: 'http://localhost:3117' },
  ]);
  await page.goto('/sign-in');
  await page
    .getByRole('button', { name: 'Créer un compte', exact: true })
    .click();
  await page.getByLabel('Nom').fill('Kevin Marty Smoke');
  await page
    .getByLabel('Email')
    .fill(`kevin-smoke-${crypto.randomUUID()}@example.test`);
  await page.getByLabel('Mot de passe').fill('safe-local-smoke-password');
  await page
    .locator('form')
    .getByRole('button', { name: 'Créer un compte' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Créez votre espace' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Créer l’espace' }).click();

  await page.goto('/memory/import');
  await page.locator('input[type="file"]').setInputFiles(cvPath!);
  await expect(
    page.getByRole('heading', { name: 'Relisez ce qui a été extrait' }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Formulation')).toBeVisible();
  await page
    .getByLabel('J’ai relu cette sélection et j’autorise les usages indiqués.')
    .check();
  await page.getByRole('button', { name: 'Valider et enregistrer' }).click();
  await expect(
    page.getByRole('heading', { name: 'Votre sélection est enregistrée.' }),
  ).toBeVisible();

  const profileResponse = await page.request.get('/api/profile');
  expect(profileResponse.ok()).toBe(true);
  const profile = (await profileResponse.json()) as {
    profile: { claims: unknown[]; sources: unknown[] };
  };
  expect(profile.profile.claims.length).toBeGreaterThan(0);
  expect(profile.profile.sources).toHaveLength(1);

  const imports = [];
  for (const url of offerUrls!) {
    imports.push(
      await page.evaluate(async (offerUrl) => {
        const response = await fetch('/api/opportunities/import-url', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: offerUrl }),
        });
        const body = await response.text();
        if (!response.ok)
          return { url: offerUrl, status: response.status, error: body };
        const imported = JSON.parse(body) as {
          opportunity: {
            opportunityId: string;
            company?: string;
            role?: string;
            lifecycle: string;
          };
        };
        return {
          url: offerUrl,
          status: response.status,
          ...imported.opportunity,
        };
      }, url),
    );
  }
  await testInfo.attach('real-offer-imports.json', {
    body: JSON.stringify(imports, null, 2),
    contentType: 'application/json',
  });
  const imported = imports.filter(
    (result): result is OfferImportSuccess => 'opportunityId' in result,
  );
  expect(imported.length).toBeGreaterThan(0);

  await page.goto('/applications');
  for (const opportunity of imported)
    await expect(
      page
        .getByRole('heading', { name: opportunity.role ?? 'À vérifier' })
        .first(),
    ).toBeVisible();

  const promotable = imported.find(
    (opportunity) => opportunity.lifecycle !== 'closed',
  );
  expect(promotable).toBeTruthy();
  const promoted = await page.evaluate(async (opportunityId) => {
    const response = await fetch(
      `/api/opportunities/${opportunityId}/application`,
      {
        method: 'POST',
      },
    );
    return { status: response.status, body: await response.text() };
  }, promotable!.opportunityId);
  expect([200, 201]).toContain(promoted.status);
  const application = JSON.parse(promoted.body) as { applicationId: string };
  await page.goto(`/applications/${application.applicationId}`);
  await expect(
    page.getByText('Dossier de candidature', { exact: true }),
  ).toBeVisible();

  const exportResponse = await page.evaluate(async () => {
    const response = await fetch('/api/workspace/export', { method: 'POST' });
    return { status: response.status, body: await response.text() };
  });
  expect(exportResponse.status).toBe(200);
  const exported = exportResponse.body;
  expect(exported).toContain('"type":"profiles"');
  expect(exported).toContain('"type":"applications"');
  expect(exported).toContain('"type":"complete"');

  const session = (await (
    await page.request.get('/api/auth/get-session')
  ).json()) as {
    session: { activeOrganizationId: string };
  };
  const deletion = await page.evaluate(async (tenantId) => {
    const response = await fetch('/api/workspace', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: `DELETE ${tenantId}` }),
    });
    return response.status;
  }, session.session.activeOrganizationId);
  expect(deletion).toBe(204);
});
