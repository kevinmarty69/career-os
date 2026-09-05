import { expect, test } from '@playwright/test';
import { applicationId, mockPersistedWorkspace } from './persisted-workspace';

const screens = [
  ['/', 'Lancez le workflow de preuves pour Signal Forge.'],
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
  [
    `/applications/${applicationId}/versions`,
    'Historique des versions et décisions',
  ],
  ['/runs', 'Journal des agents'],
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
  await mockPersistedWorkspace(page);
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
    `/applications/${applicationId}/versions`,
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
  await mockPersistedWorkspace(page);
  await page.goto('/memory');
  await page.getByRole('link', { name: 'Accueil', exact: true }).click();

  await expect(page).toHaveURL('/');
  await expect(
    page.getByRole('heading', {
      name: 'Lancez le workflow de preuves pour Signal Forge.',
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
  await mockPersistedWorkspace(page);
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
  const events: Array<{ type: string; key?: string }> = [];
  let thirdPartyLogoRequests = 0;
  await page.route(
    `**/api/publications/${publicationId}/events`,
    async (route) => {
      events.push(route.request().postDataJSON());
      await route.fulfill({ status: 204 });
    },
  );
  await page.route(`**/api/publications/${publicationId}`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        brand: { logoUrl: 'https://assets.example.test/signal-forge.svg' },
        profile: {
          name: 'Alex Morgan',
          headline: 'Product engineer',
          publicLinks: {
            email: 'alex@example.test',
            resume: 'https://example.test/alex-resume.pdf',
            linkedin: 'https://linkedin.com/in/alex',
            github: 'https://github.com/alex',
            portfolio: 'https://alex.example.test',
          },
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
  await page.route(`**/api/publications/${publicationId}/logo`, (route) =>
    route.fulfill({
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
      contentType: 'image/png',
    }),
  );
  await page.route('https://assets.example.test/**', (route) => {
    thirdPartyLogoRequests += 1;
    return route.abort();
  });

  await page.goto(`/p/${publicationId}`);
  await expect(
    page.getByText(
      'Independent application prepared and approved by Alex Morgan',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Alex Morgan × Signal Forge' }),
  ).toBeVisible();
  await expect(page.getByAltText('Signal Forge logo')).toBeVisible();
  expect(thirdPartyLogoRequests).toBe(0);
  await expect
    .poll(() => events.some((event) => event.type === 'open'))
    .toBe(true);
  await page.getByRole('link', { name: 'View key evidence' }).click();
  await expect
    .poll(() =>
      events.some(
        (event) =>
          event.type === 'action' && event.key === 'strongest-evidence',
      ),
    )
    .toBe(true);
  await expect(page.getByRole('link', { name: 'Resume' })).toHaveAttribute(
    'href',
    'https://example.test/alex-resume.pdf',
  );
  await expect(page.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/alex',
  );
  await expect(
    page.getByRole('link', { name: 'Start a conversation' }),
  ).toHaveAttribute(
    'href',
    'mailto:alex@example.test?subject=Staff%20Platform%20Engineer',
  );
});

test('shows anonymous private-page metrics in the links inventory', async ({
  context,
  page,
}) => {
  await context.clearCookies();
  const publicationId = '988c0a00-0000-4000-8000-000000000025';
  let revoked = false;
  await page.route(`**/api/publications/${publicationId}`, async (route) => {
    expect(route.request().method()).toBe('DELETE');
    revoked = true;
    await route.fulfill({ status: 204 });
  });
  await page.route('**/api/publications', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        publications: [
          {
            publicationId,
            applicationId: '988c0a00-0000-4000-8000-000000000026',
            company: 'Signal Forge',
            role: 'Staff Platform Engineer',
            publishedAt: '2026-09-04T13:00:00.000Z',
            revokedAt: null,
            expiresAt: '2026-09-11T13:00:00.000Z',
            status: 'active',
            version: 2,
            isCurrent: true,
            firstOpenedAt: '2026-09-04T14:00:00.000Z',
            lastOpenedAt: '2026-09-04T15:00:00.000Z',
            opens: 4,
            sections: 3,
            actions: 2,
            downloads: 1,
          },
        ],
        nextCursor: null,
      }),
    }),
  );

  await page.goto('/links');
  await expect(
    page.getByText('No fingerprint, IP address, or user agent is recorded.'),
  ).toBeVisible();
  const row = page.locator('.co-table-row').filter({ hasText: 'Signal Forge' });
  await expect(row).toContainText('Staff Platform Engineer');
  await expect(row.locator(':scope > span').nth(1)).toHaveText('4');
  await expect(row.locator(':scope > span').nth(2)).toHaveText('3');
  await expect(row.locator(':scope > span').nth(3)).toHaveText('2');
  page.once('dialog', (dialog) => void dialog.accept());
  await row.getByRole('button', { name: 'Revoke' }).click();
  await expect(row).toContainText('Revoked');
  expect(revoked).toBe(true);
});
