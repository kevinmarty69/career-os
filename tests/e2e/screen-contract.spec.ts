import { expect, test } from '@playwright/test';

const screens = [
  ['/memory', 'Mémoire professionnelle'],
  ['/applications', 'Candidatures'],
  [
    '/applications/nimbus',
    'L’opérabilité par une petite équipe, pas la performance brute.',
  ],
  ['/applications/nimbus/review', '3 modifications proposées'],
  ['/memory/import', 'Constituer votre mémoire'],
  [
    '/applications/nimbus/page',
    'Faire tenir une flotte de 12 000 robots sur une plateforme opérable par trois personnes.',
  ],
  ['/links', 'Liens privés'],
  ['/insights', 'Insights'],
  [
    '/memory/interview',
    'À quel moment as-tu compris que l’outillage pouvait quitter tes mains ?',
  ],
  ['/interviews/demo', 'Préparer l’entretien technique'],
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
        page.getByRole('heading', { name: heading, exact: true }),
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
    '/applications/nimbus',
    '/applications/nimbus/review',
    '/applications/nimbus/page',
    '/links',
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

test('shows the privacy-safe expired-link screen', async ({ page }) => {
  await page.goto('/p/unknown-capability');
  await expect(
    page.getByRole('heading', { name: 'Ce lien n’est plus actif.' }),
  ).toBeVisible();
  await expect(page.getByText('Nimbus Robotics')).toHaveCount(0);
});
