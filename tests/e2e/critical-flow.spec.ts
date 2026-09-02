import { expect, test, type Page } from '@playwright/test';

async function openApplications(page: Page) {
  const navigation = page.getByRole('button', {
    name: 'Candidatures',
    exact: true,
  });
  await navigation.first().waitFor({ state: 'attached' });
  for (let index = 0; index < (await navigation.count()); index += 1) {
    const candidate = navigation.nth(index);
    if (await candidate.isVisible()) {
      await candidate.click();
      const application = page.getByRole('button', {
        name: 'Ouvrir la candidature Northstar Labs',
      });
      await application.waitFor();
      await application.click();
      return;
    }
  }
  await page
    .getByRole('button', {
      name: /Commencer par l’offre|Ouvrir la candidature/,
    })
    .first()
    .click();
}

async function useDemo(page: Page) {
  const button = page.getByRole('button', {
    name: 'Explorer avec des données fictives',
  });
  if (await button.isVisible()) await button.click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (
      location.pathname === '/' &&
      !sessionStorage.getItem('career-os-test-initialized')
    ) {
      localStorage.removeItem('career-os-demo');
      sessionStorage.removeItem('career-os-onboarding:anonymous');
      sessionStorage.setItem('career-os-test-initialized', '1');
    }
  });
  await page.goto('/');
});

test('starts honestly and restores a local CV review after reload', async ({
  page,
}) => {
  await expect(
    page.getByRole('heading', {
      name: 'Construisons votre mémoire professionnelle.',
    }),
  ).toBeVisible();
  await expect(page.getByText('Alex Morgan')).toHaveCount(0);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'kevin-cv.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      [
        'Kévin Marty',
        'Senior Product Engineer',
        'Produit shippé en solo, de l’idée à la production.',
      ].join('\n'),
    ),
  });
  await expect(
    page.getByRole('heading', {
      name: 'Gardez seulement ce qui vous ressemble.',
    }),
  ).toBeVisible();
  await expect(
    page
      .locator('.import-candidate-list article')
      .first()
      .getByRole('checkbox'),
  ).toBeChecked();
  await page
    .getByLabel('Affirmation 1')
    .fill('Produit shippé en solo, avec une revue humaine avant production.');
  await page.reload();
  await expect(page.getByLabel('Affirmation 1')).toHaveValue(
    'Produit shippé en solo, avec une revue humaine avant production.',
  );
});

test('expires and discards a temporary CV review', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Covered by the desktop flow.');
  await page.getByRole('button', { name: /Coller le texte de mon CV/ }).click();
  await page
    .getByLabel('Contenu du CV')
    .fill(
      'Kévin Marty\nSenior Product Engineer\nBuilt and operated a production agent platform.',
    );
  await page.getByRole('button', { name: 'Relire les informations' }).click();
  await page.evaluate(() => {
    const key = 'career-os-onboarding:anonymous';
    const review = JSON.parse(sessionStorage.getItem(key)!);
    review.expiresAt = Date.now() + 50;
    sessionStorage.setItem(key, JSON.stringify(review));
  });
  await page.reload();
  await expect(page.locator('p[role="alert"]')).toContainText(
    'Cette revue a expiré après 30 minutes.',
  );
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('career-os-onboarding:anonymous'),
    ),
  ).toBeNull();

  await page.getByRole('button', { name: /Coller le texte de mon CV/ }).click();
  await page
    .getByLabel('Contenu du CV')
    .fill(
      'Kévin Marty\nSenior Product Engineer\nBuilt and operated a production agent platform.',
    );
  await page.getByRole('button', { name: 'Relire les informations' }).click();
  await page.getByRole('button', { name: 'Recommencer' }).click();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('career-os-onboarding:anonymous'),
    ),
  ).toBeNull();
});

test('restores an anonymous draft after reload', async ({ page }) => {
  await useDemo(page);
  await openApplications(page);
  await page.getByRole('button', { name: 'Générer la page' }).click();
  await expect(
    page.getByRole('button', { name: 'Ouvrir la revue' }),
  ).toBeVisible();

  await page.evaluate(() =>
    sessionStorage.setItem('preserve-career-os-demo', '1'),
  );
  await page.reload();

  await expect(
    page.getByRole('button', { name: 'Ouvrir la revue' }),
  ).toBeVisible();
});

test('builds, reviews, approves and issues one private capability', async ({
  browser,
  page,
}) => {
  await page.goto('/sign-in?next=/');
  await page
    .getByRole('button', { name: 'Create Account', exact: true })
    .first()
    .click();
  await page.getByLabel('Name').fill('Alex Morgan');
  await page
    .getByLabel('Email')
    .fill(`alex-${crypto.randomUUID()}@example.test`);
  await page.getByLabel('Password').fill('safe-local-password');
  await page
    .locator('form')
    .getByRole('button', { name: 'Create Account' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Create your workspace' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Create Workspace' }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Construisons votre mémoire professionnelle.',
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Coller le texte de mon CV/ }).click();
  await page
    .getByLabel('Contenu du CV')
    .fill(
      [
        'Alex Morgan',
        'Evidence-backed Product Engineer',
        'Reduced a fictional deployment workflow from 40 to 12 minutes.',
        'Enjoys turning ambiguous requirements into small, operated product slices.',
        'Publishes a monthly reading list for friends and former colleagues.',
      ].join('\n'),
    );
  await page.getByRole('button', { name: 'Relire les informations' }).click();
  await expect(page.getByLabel('Affirmation 2')).toBeEnabled();
  await expect(page.getByLabel('Affirmation 2')).toHaveAttribute(
    'readonly',
    '',
  );
  const excluded = page
    .locator('.import-candidate-list article')
    .filter({ has: page.getByRole('textbox', { name: 'Affirmation 3' }) });
  await excluded.getByRole('checkbox').first().uncheck();
  await page.getByLabel(/Je valide les .* affirmations sélectionnées/).check();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole('button', { name: 'Enregistrer ma mémoire' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Mémoire professionnelle enregistrée dans cet espace.',
  );
  await expect(
    page.getByRole('heading', { name: 'Votre mémoire est prête.' }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page
    .getByRole('button', { name: 'Créer ma première candidature' })
    .click();
  await expect(page.getByLabel('Entreprise', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Poste', { exact: true })).toHaveValue('');
  await page
    .getByLabel('Entreprise', { exact: true })
    .fill('Northstar Labs');
  await page
    .getByLabel('Poste', { exact: true })
    .fill('Senior Product Engineer');
  await page
    .getByLabel('Description du poste')
    .fill(
      'Build dependable customer-facing workflows with a small product team.',
    );
  await page.reload();
  await page.getByRole('button', { name: 'Ouvrir la mémoire pro' }).click();
  await expect(page.getByLabel('Positionnement')).toHaveValue(
    'Evidence-backed Product Engineer',
  );
  await openApplications(page);
  await page.getByRole('button', { name: 'Générer la page' }).click();
  await page.getByRole('button', { name: 'Page privée' }).click();
  await expect(page.getByText('Alex Morgan × Northstar Labs')).toBeVisible();
  await page
    .getByRole('button', {
      name: /Reduced a fictional deployment workflow.*Voir la preuve/,
    })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Pourquoi ces affirmations ?' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Fermer l’inspecteur de preuves' })
    .click();
  const forgedStatus = await page.evaluate(async () => {
    const key = Object.keys(localStorage).find((item) =>
      item.startsWith('career-os-workspace:'),
    )!;
    const saved = JSON.parse(localStorage.getItem(key)!);
    const response = await fetch('/api/publications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        spec: saved.spec,
        approved: true,
        profileRevision: 1,
        opportunity: {
          company: 'Cosmos Institute',
          role: 'Astrophysicist',
          description: 'Calibrate telescope optics and model stellar spectra.',
          accent: '#21504b',
        },
      }),
    });
    return response.status;
  });
  expect(forgedStatus).toBe(400);
  await page.getByRole('button', { name: 'Parcours', exact: true }).click();
  await page.getByRole('button', { name: 'Ouvrir la revue' }).click();
  const approval = page.getByLabel(
    /J’ai vérifié les preuves et je valide cette candidature/,
  );
  await expect(approval).toBeEnabled();
  await approval.check();
  await page.getByRole('button', { name: 'Continuer vers le partage' }).click();
  await page.getByRole('button', { name: 'Créer le lien privé' }).click();
  await expect(page.getByRole('status')).toContainText('/p/');
  await expect(page.getByRole('status')).toContainText('Actif');
  const href = await page
    .getByRole('link', { name: 'Ouvrir la page privée' })
    .getAttribute('href');
  await page.reload();
  await openApplications(page);
  await expect(
    page.getByRole('button', { name: 'Remplacer le lien privé' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Remplacer le lien privé' }).click();
  const refreshedHref = await page
    .getByRole('link', { name: 'Ouvrir la page privée' })
    .getAttribute('href');
  expect(refreshedHref).not.toBe(href);
  const freshContext = await browser.newContext();
  const freshPage = await freshContext.newPage();
  await freshPage.goto(new URL(href!, page.url()).href);
  await expect(
    freshPage.getByRole('heading', {
      name: 'Private application unavailable.',
    }),
  ).toBeVisible();
  await freshPage.goto(new URL(refreshedHref!, page.url()).href);
  await expect(
    freshPage.getByRole('heading', { name: 'Alex Morgan × Northstar Labs' }),
  ).toBeVisible();
  await freshPage.locator('details').first().locator('summary').click();
  await expect(freshPage.getByText('CV collé').first()).toBeVisible();
  await expect(
    freshPage.getByText(/Publishes a monthly reading list/),
  ).toHaveCount(0);
  expect(freshPage.url()).not.toContain('#');
  await expect(freshPage.locator('nav')).toHaveCount(0);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Révoquer le lien privé' }).click();
  await expect(
    page.getByRole('button', { name: 'Créer le lien privé' }),
  ).toBeVisible();
  await freshPage.reload();
  await expect(
    freshPage.getByRole('heading', {
      name: 'Private application unavailable.',
    }),
  ).toBeVisible();
  await freshContext.close();
});

test('requires an explicit workspace choice when several are available', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Covered by the desktop flow.');
  const email = `multi-${crypto.randomUUID()}@example.test`;
  await page.goto('/sign-in');
  await page
    .getByRole('button', { name: 'Create Account', exact: true })
    .first()
    .click();
  await page.getByLabel('Name').fill('Multi Workspace');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('safe-local-password');
  await page
    .locator('form')
    .getByRole('button', { name: 'Create Account' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Create your workspace' }),
  ).toBeVisible();

  const secondOrganizationId = await page.evaluate(async () => {
    const create = (name: string, slug: string) =>
      fetch('/api/auth/organization/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, slug }),
      }).then((response) => response.json());
    await create('Workspace One', `workspace-one-${crypto.randomUUID()}`);
    const second = await create(
      'Workspace Two',
      `workspace-two-${crypto.randomUUID()}`,
    );
    await fetch('/api/auth/sign-out', { method: 'POST' });
    return second.id as string;
  });

  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('safe-local-password');
  await page.locator('form').getByRole('button', { name: 'Sign In' }).click();
  await expect(
    page.getByRole('heading', { name: 'Choose a workspace' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Use Workspace Two' }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Construisons votre mémoire professionnelle.',
    }),
  ).toBeVisible();
  const activeOrganizationId = await page.evaluate(async () => {
    const session = await fetch('/api/auth/get-session').then((response) =>
      response.json(),
    );
    return session.session.activeOrganizationId as string;
  });
  expect(activeOrganizationId).toBe(secondOrganizationId);
});

test('records a declared claim and exposes provenance progressively', async ({
  page,
}) => {
  await useDemo(page);
  await page.getByRole('button', { name: 'Ouvrir la mémoire pro' }).click();
  await page.getByText('Ajouter une affirmation').click();
  await page.getByLabel('Titre de la source').fill('Synthetic interview notes');
  await page
    .getByLabel('Affirmation', { exact: true })
    .fill('Built a fictional customer feedback loop.');
  await page.getByRole('button', { name: 'Ajouter' }).click();
  await expect(page.getByText('3 affirmations')).toBeVisible();
  await expect(
    page.getByText('Built a fictional customer feedback loop.'),
  ).toBeVisible();
  await expect(page.getByText('Aucune preuve rattachée').last()).toBeVisible();
});

test('fits 375, 768, and 1440 widths without horizontal overflow', async ({
  page,
}) => {
  await useDemo(page);
  await openApplications(page);
  await page.getByRole('button', { name: 'Retour aux candidatures' }).click();
  await expect(
    page.getByRole('heading', { name: 'Candidatures' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Ouvrir la candidature Northstar Labs' })
    .click();
  await page.getByRole('button', { name: 'Générer la page' }).click();
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow, `${width}px viewport`).toBe(false);
  }
});

test('preserves the opportunity and offers retry when evidence does not match', async ({
  page,
}) => {
  await useDemo(page);
  await openApplications(page);
  await page.getByLabel('Poste', { exact: true }).fill('Astrophysicist');
  await page
    .getByLabel('Description du poste')
    .fill('Calibrate telescope optics and model stellar spectra.');
  await page.getByRole('button', { name: 'Générer la page' }).click();
  await expect(page.locator('.inline-error')).toContainText(
    'Aucune preuve ne correspond à ce poste.',
  );
  await expect(page.getByLabel('Poste', { exact: true })).toHaveValue(
    'Astrophysicist',
  );
  await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
});

test('keeps run mechanics in Activity details', async ({ page }) => {
  await useDemo(page);
  await openApplications(page);
  await page.getByRole('button', { name: 'Générer la page' }).click();
  await page.getByRole('button', { name: 'À trancher' }).click();
  await expect(
    page.getByRole('heading', { name: 'Revue avant publication' }),
  ).toBeVisible();
  await expect(page.getByText('Brouillon terminé').first()).toBeVisible();
  const rawLog = page.getByText(/^01 · company-researcher ·/);
  await expect(rawLog).toBeHidden();
  await page.getByText('Métadonnées techniques').first().click();
  await expect(rawLog).toBeVisible();
});
