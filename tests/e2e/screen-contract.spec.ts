import { expect, test } from '@playwright/test';
import { syntheticProfile } from '../../lib/fixture';
import { applicationId, mockPersistedWorkspace } from './persisted-workspace';

const screens = [
  ['/', 'Bonjour Alex'],
  ['/memory', 'Mémoire professionnelle'],
  ['/applications', 'Candidatures'],
  [`/applications/${applicationId}/review`, 'Aucune review pour le moment.'],
  ['/memory/import', 'Ajoutez votre parcours'],
  [`/applications/${applicationId}/page`, 'Staff Platform Engineer'],
  ['/links', 'Liens privés'],
  ['/insights', 'Insights'],
  ['/memory/interview', 'Entretien guidé'],
  ['/interviews/demo', 'Entretiens'],
  ['/assets', 'Assets'],
  ['/settings/models', 'Modèles & agents'],
  [`/applications/${applicationId}?state=running`, 'Staff Platform Engineer'],
  ['/memory/conflicts', 'Conflits entre sources'],
  ['/settings/privacy', 'Confidentialité des preuves'],
  [`/applications/${applicationId}/published`, 'Staff Platform Engineer'],
  ['/interviews/demo/debrief', 'Entretiens'],
  [
    `/applications/${applicationId}/versions`,
    'Historique des versions et décisions',
  ],
  ['/runs', 'Journal des agents'],
  [`/applications/${applicationId}/company`, 'Dossier entreprise'],
  ['/messages', 'Messages'],
  ['/memory/skills', 'Compétences'],
  ['/onboarding/hosting', 'Hébergement'],
  ['/inbox', 'À trancher'],
  ['/settings/billing', 'Abonnement'],
  ['/settings/integrations', 'Intégrations'],
  ['/settings/data', 'Vos données vous appartiennent'],
  ['/settings/profile', 'Paramètres du profil'],
] as const;

test('renders route headings with mocked persisted data', async ({ page }) => {
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

test('keeps sidebar labels and counters on one line in both languages', async ({
  page,
  context,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockPersistedWorkspace(page);
  await page.route('**/api/profile', (route) =>
    route.fulfill({
      json: {
        revision: 1,
        profile: {
          ...syntheticProfile,
          claims: Array.from({ length: 20 }, (_, index) => ({
            ...syntheticProfile.claims[0],
            id: `claim-${index}`,
          })),
        },
      },
    }),
  );
  for (const locale of ['en', 'fr']) {
    await context.addCookies([
      { name: 'career-os-locale', value: locale, url: 'http://localhost:3117' },
    ]);
    await page.goto('/memory');
    const link = page.locator('.co-sidebar nav > a[href="/memory"]');
    await expect(link).toBeVisible();
    await expect(link.locator('b')).toHaveText('20');
    const label = link.locator('span:not(.co-icon)');
    await expect(label).toHaveCSS('white-space', 'nowrap');
    expect(
      await label.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    const labelBounds = await label.boundingBox();
    const countBounds = await link.locator('b').boundingBox();
    const linkBounds = await link.boundingBox();
    const navBounds = await page.locator('.co-sidebar nav').boundingBox();
    expect(linkBounds!.x + linkBounds!.width).toBeLessThanOrEqual(
      navBounds!.x + navBounds!.width,
    );
    expect(countBounds!.x + countBounds!.width).toBeLessThanOrEqual(
      linkBounds!.x + linkBounds!.width - 12,
    );
    expect(labelBounds!.x + labelBounds!.width).toBeLessThanOrEqual(
      countBounds!.x,
    );
    await page.locator('.co-sidebar nav').screenshot({
      path: testInfo.outputPath(`sidebar-${locale}.png`),
    });
  }
});

test('opens the documented command palette with the keyboard shortcut', async ({
  page,
}) => {
  await mockPersistedWorkspace(page);
  await page.goto('/');
  const trigger = page.getByRole('button', {
    name: 'Recherche globale',
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press('ControlOrMeta+K');
  const dialog = page.getByRole('dialog', { name: 'Palette de commandes' });
  await expect(dialog).toBeVisible();
  const search = dialog.getByRole('searchbox', { name: 'Recherche globale' });
  await expect(search).toBeFocused();
  await expect(search).toHaveCSS('outline-style', 'none');
  await expect(dialog.locator('form label')).toHaveCSS(
    'border-bottom-color',
    'rgb(13, 13, 15)',
  );
  await page.keyboard.press('Shift+Tab');
  await expect(
    dialog.getByRole('link', {
      name: /Importer un document dans la mémoire/,
    }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(search).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('link', { name: 'Nouvelle candidature depuis une URL' })
    .click();
  await expect(page).toHaveURL('/applications/new');
  await expect(
    page.getByRole('dialog', { name: 'Coller une offre' }),
  ).toBeVisible();
});

test('exposes current navigation and traps focus in the job import dialog', async ({
  page,
}) => {
  await mockPersistedWorkspace(page);
  await page.goto('/applications');
  await expect(
    page
      .getByRole('navigation', { name: 'Navigation principale' })
      .locator('a[href="/applications"]'),
  ).toHaveAttribute('aria-current', 'page');

  const trigger = page.getByRole('button', { name: 'Coller une offre' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Coller une offre' });
  const input = dialog.getByRole('textbox', { name: 'URL de l’annonce' });
  await expect(input).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Fermer' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Annuler' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('offers a visible skip link to the primary content', async ({ page }) => {
  await mockPersistedWorkspace(page);
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Aller au contenu' });
  await expect(skip).toBeFocused();
  await skip.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
});

test('keeps the documented mobile surfaces inside the viewport', async ({
  page,
}) => {
  await mockPersistedWorkspace(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    '/',
    `/applications/${applicationId}/review`,
    `/applications/${applicationId}/page`,
    `/applications/${applicationId}/company`,
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
      const screen = screens.find(([path]) => path === route);
      expect(screen, `${route} needs a loaded-state assertion`).toBeDefined();
      await expect(
        page.getByRole('heading', { level: 1, name: screen![1], exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Sign in', exact: true }),
      ).toHaveCount(0);
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
      name: 'Bonjour Alex',
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
    page.getByText('Ou collez du texte', { exact: true }),
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
  isMobile,
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
  // The secondary side panel is intentionally hidden below 1180px.
  if (!isMobile)
    await expect(
      page.getByText('No fingerprint, IP address, or user agent is recorded.'),
    ).toBeVisible();
  const row = page.getByRole('article').filter({ hasText: 'Signal Forge' });
  await expect(
    row.getByRole('heading', { name: 'Staff Platform Engineer', exact: true }),
  ).toBeVisible();
  for (const [label, value] of [
    ['Opens', '4'],
    ['Sections', '3'],
    ['Actions', '2'],
    ['Downloads', '1'],
  ]) {
    const metric = row.locator('dl > div').filter({
      has: page.locator('dt').filter({ hasText: new RegExp(`^${label}$`) }),
    });
    await expect(metric.getByRole('definition')).toHaveText(value);
  }
  await row.getByRole('button', { name: 'Revoke' }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Revoke the Signal Forge link?',
  });
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole('button', { name: 'Revoke', exact: true });
  await expect(confirm).toBeDisabled();
  expect(revoked).toBe(false);
  await dialog.getByLabel('Type REVOKE to confirm').fill('REVOKE');
  await confirm.click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText('Revoked');
  expect(revoked).toBe(true);
});

test('settings expose measured worker availability and honest unavailable services', async ({
  context,
  page,
  isMobile,
}) => {
  await context.clearCookies();
  await mockPersistedWorkspace(page);
  const services = [
    'company-researcher',
    'evidence-archivist',
    'recruiter-strategist',
    'page-composer',
    'recruiter-reviewer',
    'hiring-manager-reviewer',
    'factuality-reviewer',
    'job-discovery',
  ];
  await page.route('**/api/instance-status', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        mode: 'self-hosted',
        services: services.map((service) => ({ service, status: 'missing' })),
      }),
    }),
  );
  await page.goto('/settings/models');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Models & agents',
      exact: true,
    }),
  ).toBeVisible();
  if (!isMobile) {
    await expect(
      page.getByRole('link', { name: 'Models & agents', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
  }
  await expect(page.getByText('missing', { exact: true })).toHaveCount(
    services.length,
  );
  await expect(page.getByText('3 / 3 actifs')).toHaveCount(0);
  await page.goto('/settings/billing');
  await expect(
    page.getByRole('heading', { name: 'Billing unavailable' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Upgrade|Subscribe|Pay/ }),
  ).toHaveCount(0);
  await page.goto('/settings/integrations');
  await expect(
    page.getByRole('heading', { name: 'Connectors unavailable' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Import a document' }),
  ).toHaveAttribute('href', '/memory/import');
});
