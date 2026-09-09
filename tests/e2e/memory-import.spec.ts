import { expect, test, type Page } from '@playwright/test';

const profileText = `Kevin Marty
Senior Product Engineer

Experience
Built a production agent workflow with explicit human review.
Reduced a deployment workflow from eleven minutes to seven minutes.

Projects
Created a private portfolio for evidence-backed applications.`;

// Synthetic ZIP: deflated Positions.csv plus a messages.csv that must stay unread.
const linkedinArchive = Buffer.from(
  'UEsDBBQAAAAIAAAAAAAAAAAAcQAAAIEAAAANAAAAUG9zaXRpb25zLmNzdh3LPQrDMAxA4b2n0AFECaEn6E/GdkgvIBJhC2zZyHJCbl/S5fEt71FyJT3gTZnxK54Yn9wWk+pSFGcnc17hoziJSot/X2YJSgmmYoHxpUGU2fDeJTlUK2tfzhva0Zxzg108QuyZFIw34f2K4zAOZ24/UEsDBBQAAAAAAAAAAAAAAAAAJgAAACYAAAAMAAAAbWVzc2FnZXMuY3N2UFJJVkFURSBDT05URU5UIE1VU1QgTkVWRVIgQkUgSU1QT1JURURQSwECFAAUAAAACAAAAAAAAAAAAHEAAACBAAAADQAAAAAAAAAAAAAAAAAAAAAAUG9zaXRpb25zLmNzdlBLAQIUABQAAAAAAAAAAAAAAAAAJgAAACYAAAAMAAAAAAAAAAAAAAAAAJwAAABtZXNzYWdlcy5jc3ZQSwUGAAAAAAIAAgB1AAAA7AAAAAAA',
  'base64',
);

test('imports only LinkedIn positions locally and persists the human-approved source', async ({
  page,
}) => {
  const savedBodies: unknown[] = [];
  const posted: string[] = [];
  page.on('request', (request) => {
    if (request.postData()) posted.push(request.postData()!);
  });
  await mockProfilePort(page, savedBodies);
  await page.goto('/memory/import');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'linkedin.zip',
    mimeType: 'application/zip',
    buffer: linkedinArchive,
  });
  await expect(
    page.getByRole('heading', { name: 'Relisez ce qui a été extrait' }),
  ).toBeVisible();
  expect(savedBodies).toHaveLength(0);
  await expect(
    page.getByRole('textbox', { name: 'Formulation', exact: true }),
  ).toHaveValue(
    'Engineer — Signal Forge\n2020 — 2024\nBuilt production systems with human review.',
  );
  await expect(
    page.getByRole('button', {
      name: /Déclaré par vous Positions.csv, record 2/,
    }),
  ).toBeVisible();
  await expect(page.getByLabel('Statut')).toHaveValue('declared');
  await page.getByLabel('Nom complet').fill('Alex Morgan');
  await page.getByLabel('Positionnement').fill('Product engineer');
  await expectNoHorizontalOverflow(page);
  if (process.env.CAREER_OS_LINKEDIN_SCREENSHOT) {
    for (const locale of ['en', 'fr']) {
      await page.context().addCookies([
        {
          name: 'career-os-locale',
          value: locale,
          domain: 'localhost',
          path: '/',
        },
      ]);
      await page.reload();
      await expect(
        page.getByRole('heading', {
          name:
            locale === 'en'
              ? 'Review what was extracted'
              : 'Relisez ce qui a été extrait',
        }),
      ).toBeVisible();
      if (locale === 'en')
        await page.screenshot({
          path: process.env.CAREER_OS_LINKEDIN_SCREENSHOT.replace(
            '-desktop',
            (page.viewportSize()?.width ?? 1440) < 600 ? '-mobile' : '-desktop',
          ),
          animations: 'disabled',
        });
    }
  }
  await page
    .getByLabel('J’ai relu cette sélection et j’autorise les usages indiqués.')
    .check();
  await page.getByRole('button', { name: 'Valider et enregistrer' }).click();
  await expect(
    page.getByRole('heading', { name: 'Votre sélection est enregistrée.' }),
  ).toBeVisible();
  expect(savedBodies).toHaveLength(1);
  expect(savedBodies[0]).toMatchObject({
    profile: {
      sources: [{ kind: 'linkedin', title: 'linkedin.zip' }],
      claims: [{ kind: 'experience', level: 'declared' }],
    },
  });
  expect(posted.join('\n')).not.toContain('PRIVATE CONTENT');
  expect(posted.join('\n')).not.toContain(linkedinArchive.toString('base64'));
});

test('rejects an unrelated CSV and lets the user retry with Positions.csv', async ({
  page,
}) => {
  const savedBodies: unknown[] = [];
  await mockProfilePort(page, savedBodies);
  await page.goto('/memory/import');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'Contacts.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Name,Email\nAlex,private@example.com'),
  });
  await expect(
    page.getByText(/Importez Positions.csv ou un ZIP contenant ce fichier/),
  ).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'Positions.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Company Name,Title,Description,Started On,Finished On\nSignal Forge,Engineer,Implemented review workflows.,2020,2024',
    ),
  });
  await expect(
    page.getByRole('heading', { name: 'Relisez ce qui a été extrait' }),
  ).toBeVisible();
  expect(savedBodies).toHaveLength(0);
});

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
  let releaseSave!: () => void;
  const pendingSave = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  await mockProfilePort(page, savedBodies, pendingSave);

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
  await expect(firstCandidate.getByLabel('Formulation')).toBeDisabled();
  await expect(page.getByLabel('Nom complet')).toBeDisabled();
  await expect(
    page.getByLabel(
      'J’ai relu cette sélection et j’autorise les usages indiqués.',
    ),
  ).toBeDisabled();
  releaseSave();
  await expect(
    page.getByRole('heading', { name: 'Votre sélection est enregistrée.' }),
  ).toBeVisible();
  expect(savedBodies).toHaveLength(1);

  const jobSource = page.locator('input[name="source"]');
  await jobSource.focus();
  await expect(jobSource).toHaveCSS('outline-style', 'none');
  const jobForm = page.locator('form').filter({ has: jobSource });
  await expect(jobForm).toHaveCSS('outline-style', 'solid');
  await expect(jobForm).toHaveCSS('outline-color', 'rgb(13, 13, 15)');
  await jobSource.fill('https://example.com/job');
  await page.keyboard.press('Tab');
  await expect(jobForm.locator('button')).toBeFocused();
  await expect(jobForm.locator('button')).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Shift+Tab');
  await expect(jobSource).toBeFocused();
  await expect(jobSource).toHaveCSS('outline-style', 'none');
  await expect(jobForm).toHaveCSS('outline-style', 'solid');

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

async function mockProfilePort(
  page: Page,
  savedBodies: unknown[],
  pendingSave?: Promise<void>,
) {
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
    await pendingSave;
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
