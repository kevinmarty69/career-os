import { expect, test, type Page } from '@playwright/test';

const profileText = `Kevin Marty
Senior Product Engineer

Experience
Built a production agent workflow with explicit human review.
Reduced a deployment workflow from eleven minutes to seven minutes.

Projects
Created a private portfolio for evidence-backed applications.`;

test('keeps the desktop sidebar viewport-sized while the import content scrolls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockProfilePort(page, []);
  await page.goto('/memory/import');
  const sidebar = page.locator('aside[class*="sidebar"]').first();
  const initial = await sidebar.boundingBox();
  expect(initial?.height).toBe(900);
  await page.getByLabel('Contenu à analyser').fill(profileText);
  await page.getByRole('button', { name: 'Lire ce texte' }).click();
  await expect(
    page.getByRole('heading', { name: 'Relisez ce qui a été extrait' }),
  ).toBeVisible();
  const content = page.locator('#memory-import-content');
  expect(
    await content.evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(true);
  await content.hover();
  await page.mouse.wheel(0, 700);
  await expect
    .poll(() => content.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  expect(await sidebar.boundingBox()).toEqual(initial);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  // A short desktop viewport must still allow access to the sidebar footer.
  await page.setViewportSize({ width: 1440, height: 600 });
  await sidebar.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect((await sidebar.boundingBox())?.height).toBe(600);
  await expect(sidebar.locator('details > summary')).toBeInViewport();
});

test('keeps accordion and secondary action hovers on light surfaces', async ({
  page,
}) => {
  await mockProfilePort(page, []);
  await page.goto('/memory/import');
  await page.getByLabel('Contenu à analyser').fill(profileText);
  await page.getByRole('button', { name: 'Lire ce texte' }).click();
  const summary = page.locator('button[aria-expanded]').first();
  for (let state = 0; state < 2; state++) {
    await summary.hover();
    await expect(summary).toHaveCSS('background-color', 'rgb(244, 244, 247)');
    await expect(summary.locator('strong')).toHaveCSS(
      'color',
      'rgb(38, 41, 50)',
    );
    await expect(summary.locator('small')).toHaveCSS(
      'color',
      'rgb(92, 94, 104)',
    );
    await summary.click();
  }
  const secondary = page.locator('button[class*="secondaryButton"]').first();
  await secondary.hover();
  await expect(secondary).toHaveCSS('background-color', 'rgb(244, 244, 247)');
  await expect(secondary).toHaveCSS('color', 'rgb(13, 13, 15)');
  await page.locator('article > header input[type="checkbox"]').first().focus();
  await page.keyboard.press('Tab');
  await expect(summary).toBeFocused();
  await expect(summary).not.toHaveCSS('outline-style', 'none');
});

test('keeps the file local until review, then saves the edited selection', async ({
  page,
}) => {
  const savedBodies: unknown[] = [];
  await mockProfilePort(page, savedBodies);

  await page.goto('/memory/import');
  await expect(
    page.getByRole('heading', { name: 'Ajoutez votre parcours' }),
  ).toBeVisible();
  expect(savedBodies).toHaveLength(0);

  await page.locator('input[type="file"]').setInputFiles({
    name: 'kevin-profile.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(profileText),
  });

  await expect(
    page.getByRole('heading', { name: 'Relisez ce qui a été extrait' }),
  ).toBeVisible();
  expect(savedBodies).toHaveLength(0);

  const firstCandidate = page.locator('article').filter({
    has: page.getByText('Built a production agent workflow'),
  });
  await firstCandidate
    .getByLabel('Formulation')
    .fill(
      'Built and operated a production agent workflow with explicit human review.',
    );
  await firstCandidate.getByLabel('Type').selectOption('project');
  await firstCandidate.getByLabel('Sensibilité').selectOption('restricted');
  await firstCandidate.getByLabel('Statut').selectOption('unsupported');
  await firstCandidate.getByRole('checkbox', { name: 'CV' }).check();

  await page
    .getByLabel('J’ai relu cette sélection et j’autorise les usages indiqués.')
    .check();
  expect(savedBodies).toHaveLength(0);

  await page.getByRole('button', { name: 'Valider et enregistrer' }).click();
  await expect(
    page.getByRole('heading', { name: 'Votre sélection est enregistrée.' }),
  ).toBeVisible();
  expect(savedBodies).toHaveLength(1);

  const payload = savedBodies[0] as {
    profile: {
      sources: Array<{ kind: string; title: string }>;
      claims: Array<{
        statement: string;
        kind: string;
        level: string;
        sensitivity: string;
        allowedUses: string[];
      }>;
    };
    expectedRevision: number;
  };
  expect(payload.expectedRevision).toBe(0);
  expect(payload.profile.sources[0]).toMatchObject({
    kind: 'document',
    title: 'kevin-profile.txt',
  });
  expect(payload.profile.claims[0]).toMatchObject({
    statement:
      'Built and operated a production agent workflow with explicit human review.',
    kind: 'project',
    level: 'unsupported',
    sensitivity: 'restricted',
  });
  expect(payload.profile.claims[0].allowedUses).toEqual([
    'application',
    'resume',
  ]);
});

test('restores a pasted LinkedIn review without saving it prematurely', async ({
  page,
}) => {
  const savedBodies: unknown[] = [];
  await mockProfilePort(page, savedBodies);

  await page.goto('/memory/import');
  await page.getByLabel('Nature de la source').selectOption('linkedin');
  await page.getByLabel('Contenu à analyser').fill(profileText);
  await page.getByRole('button', { name: 'Lire ce texte' }).click();
  await expect(
    page.getByRole('heading', { name: 'Relisez ce qui a été extrait' }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Relisez ce qui a été extrait' }),
  ).toBeVisible();
  await expect(
    page.getByText('Profil LinkedIn collé', { exact: true }),
  ).toBeVisible();
  expect(savedBodies).toHaveLength(0);

  await page
    .getByLabel('J’ai relu cette sélection et j’autorise les usages indiqués.')
    .check();
  await page.getByRole('button', { name: 'Valider et enregistrer' }).click();
  await expect(
    page.getByRole('heading', { name: 'Votre sélection est enregistrée.' }),
  ).toBeVisible();

  const payload = savedBodies[0] as {
    profile: { sources: Array<{ kind: string }> };
  };
  expect(payload.profile.sources[0].kind).toBe('linkedin');
});

test('keeps the source and review surfaces inside a mobile viewport', async ({
  page,
}) => {
  await mockProfilePort(page, []);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/memory/import');
  await expect(
    page.getByRole('navigation', { name: 'Navigation mobile' }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByLabel('Contenu à analyser').fill(profileText);
  await page.getByRole('button', { name: 'Lire ce texte' }).click();
  await expect(
    page.getByRole('heading', { name: 'Relisez ce qui a été extrait' }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

async function mockProfilePort(page: Page, savedBodies: unknown[]) {
  await page.route('**/api/profile', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ profile: null, revision: 0 }),
      });
      return;
    }
    const body = route.request().postDataJSON() as {
      profile: unknown;
      expectedRevision: number;
    };
    savedBodies.push(body);
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ profile: body.profile, revision: 1 }),
    });
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
}
