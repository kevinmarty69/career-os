import { expect, test } from '@playwright/test';

const screens = [
  ['/', 'Trois affirmations à trancher avant d’envoyer votre page privée.'],
  ['/memory', 'Mémoire professionnelle'],
  ['/applications', 'Candidatures'],
  ['/applications/nimbus/review', '3 modifications proposées'],
  ['/memory/import', 'Ajoutez votre parcours'],
  [
    '/applications/nimbus/page',
    'Faire tenir une flotte de 12 000 robots sur une plateforme opérable par trois personnes.',
  ],
  ['/links', 'Liens privés'],
  ['/insights', 'Insights'],
  [
    '/memory/interview',
    'Sur la migration du monorepo, qu’est-ce qui n’a pas marché comme prévu ?',
  ],
  ['/interviews/demo', 'Entretien technique · Vantage Labs'],
  ['/assets', 'Assets'],
  ['/settings/models', 'Modèles & agents'],
  ['/applications/nimbus?state=running', 'Platform Engineer'],
  ['/memory/conflicts', 'Conflits entre sources'],
  ['/settings/privacy', 'Confidentialité des preuves'],
  [
    '/applications/nimbus/published',
    'Votre page privée est en ligne pour Nimbus Robotics.',
  ],
  ['/interviews/demo/debrief', 'Débrief d’entretien'],
  ['/applications/nimbus/versions', '3 modifications · 1 section ajoutée'],
  ['/runs', 'Runs d’agents'],
  ['/applications/nimbus/company', 'Dossier entreprise'],
  ['/messages', 'Messages'],
  ['/memory/skills', 'Compétences'],
  ['/onboarding/hosting', 'Choisissez votre mode d’hébergement'],
  ['/inbox', 'À trancher'],
  ['/settings/billing', 'Abonnement'],
  ['/settings/integrations', 'Intégrations & API'],
  ['/settings/data', 'Export & suppression'],
] as const;

test('renders every routed handoff screen', async ({ page }) => {
  for (const [route, heading] of screens) {
    await test.step(route, async () => {
      await page.goto(route);
      await expect(
        page.getByRole('heading', { level: 1, name: heading, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Écran non documenté' }),
      ).toHaveCount(0);
    });
  }
});

test('opens the documented command palette with the keyboard shortcut', async ({
  page,
}) => {
  await page.goto('/memory');
  await page.keyboard.press('ControlOrMeta+K');
  await expect(
    page.getByRole('dialog', { name: 'Palette de commandes' }),
  ).toBeVisible();
});

test('keeps the documented mobile surfaces inside the viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    '/',
    '/applications/nimbus/review',
    '/applications/nimbus/page',
    '/applications/nimbus/company',
    '/links',
    '/memory/interview',
    '/interviews/demo',
    '/assets',
    '/memory/import',
    '/settings/billing',
    '/settings/integrations',
    '/settings/data',
  ]) {
    await test.step(route, async () => {
      await page.goto(route);
      const overflows = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(overflows).toBe(false);
    });
  }
});

test('navigates from memory to the kit home without reviving the legacy shell', async ({
  page,
}) => {
  await page.goto('/memory');
  await page.getByRole('link', { name: 'Accueil', exact: true }).click();

  await expect(page).toHaveURL('/');
  await expect(
    page.getByRole('heading', {
      name: 'Trois affirmations à trancher avant d’envoyer votre page privée.',
    }),
  ).toBeVisible();
  await expect(page.locator('main.co-shell')).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveCount(0);
});

test('shows a private source choice before human validation', async ({
  page,
}) => {
  await page.goto('/memory/import');
  await expect(
    page.getByRole('heading', { name: 'Déposez votre CV ici' }),
  ).toBeVisible();
  await expect(
    page.getByText('Le fichier brut n’est pas envoyé au serveur.'),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Ou collez du texte' }),
  ).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveCount(0);
});

test('keeps the CV import readable at tablet width', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/memory/import');

  await expect(
    page.getByRole('navigation', { name: 'Navigation principale' }),
  ).toBeHidden();
  const mobileNavigation = page.getByRole('navigation', {
    name: 'Navigation mobile',
  });
  await expect(mobileNavigation).toBeVisible();
  await expect(mobileNavigation.getByRole('link')).toHaveCount(4);
  await expect(
    page.getByRole('heading', { name: 'Déposez votre CV ici' }),
  ).toBeVisible();

  const overflows = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});

test('exposes keyboard navigation and readable informational copy', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/memory/import');

  const desktopNavigation = page.getByRole('navigation', {
    name: 'Navigation principale',
  });
  const links = desktopNavigation.getByRole('link');
  await expect(links).toHaveCount(5);
  await expect(links.nth(0)).toHaveAttribute('href', '/');
  await expect(links.nth(1)).toHaveAttribute('href', '/applications');
  await expect(links.nth(2)).toHaveAttribute('href', '/memory');
  await expect(links.nth(3)).toHaveAttribute('href', '/links');
  await expect(links.nth(4)).toHaveAttribute('href', '/settings/models');

  const shell = await page
    .getByRole('region', { name: 'Import de la mémoire' })
    .boundingBox();
  expect(shell).toMatchObject({ x: 0, y: 0, width: 1440 });
  expect(shell?.height).toBeGreaterThanOrEqual(900);

  await page.keyboard.press('Tab');
  await expect(page.getByText('Aller à l’import')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Career OS, accueil' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(links.first()).toBeFocused();
  await expect(links.first()).toHaveCSS('outline-style', 'solid');
});

test('keeps the main application shell edge to edge', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const shell = page.locator('main.co-shell');
  await expect(shell).toBeVisible();
  const box = await shell.boundingBox();
  expect(box).toMatchObject({ x: 0, y: 0, width: 1440 });
  expect(box?.height).toBeGreaterThanOrEqual(900);
  await expect(shell).toHaveCSS('border-radius', '0px');
});

test('shows the privacy-safe expired-link screen', async ({ page }) => {
  await page.goto('/p/unknown-capability');
  await expect(
    page.getByRole('heading', { name: 'Ce lien n’est plus actif.' }),
  ).toBeVisible();
  await expect(page.getByText('Nimbus Robotics')).toHaveCount(0);
});

test('identifies a valid private page as an independent application', async ({
  context,
  page,
}) => {
  await context.clearCookies();
  const publicationId = '988c0a00-0000-4000-8000-000000000024';
  await page.route(`**/api/publications/${publicationId}`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        profile: {
          name: 'Alex Morgan',
          headline: 'Product engineer',
          sources: [],
          evidence: [],
          claims: [],
        },
        spec: {
          version: 1,
          company: {
            name: 'Signal Forge',
            role: 'Staff Platform Engineer',
            accent: '#5847e8',
          },
          hero: {
            eyebrow: 'Private application',
            title: 'Alex Morgan × Signal Forge',
            thesis: 'A focused application for a reliable platform role.',
          },
          blocks: [
            {
              type: 'gap',
              title: 'What to explore together',
              text: 'Small-team operations remain an interview topic.',
            },
          ],
        },
      }),
    }),
  );

  await page.goto(`/p/${publicationId}`);
  await expect(
    page.getByText(
      'Independent application prepared and approved by Alex Morgan',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Alex Morgan × Signal Forge' }),
  ).toBeVisible();
});
