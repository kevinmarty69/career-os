import { expect, test } from '@playwright/test';

test('persists a reviewed source, then reopens and corrects its provenance', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile',
    'The mobile layout is covered by memory-import.spec.ts.',
  );

  await page.goto('/sign-in');
  await page
    .getByRole('button', { name: 'Créer un compte', exact: true })
    .click();
  await page.getByLabel('Nom').fill('Memory Tester');
  await page
    .getByLabel('Email')
    .fill(`memory-${crypto.randomUUID()}@example.test`);
  await page.getByLabel('Mot de passe').fill('safe-local-password');
  await page
    .locator('form')
    .getByRole('button', { name: 'Créer un compte' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Créez votre espace' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Créer l’espace' }).click();

  await page.goto('/memory/import');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'memory-test.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'Memory Tester\nSenior Product Engineer\nResults\nReduced build time from eleven to seven minutes.',
    ),
  });
  await expect(
    page.getByRole('heading', { name: 'Relisez ce qui a été extrait' }),
  ).toBeVisible();
  await page
    .getByLabel('J’ai relu cette sélection et j’autorise les usages indiqués.')
    .check();
  await page.getByRole('button', { name: 'Valider et enregistrer' }).click();
  await expect(
    page.getByRole('heading', { name: 'Votre sélection est enregistrée.' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Ouvrir ma mémoire' }).click();

  await expect(page.getByRole('textbox', { name: 'Affirmation' })).toHaveValue(
    'Reduced build time from eleven to seven minutes.',
  );
  await page
    .getByRole('button', { name: 'Voir et corriger la provenance' })
    .click();
  await page.getByLabel('Source', { exact: true }).fill('CV corrigé');
  await page.getByLabel('Localisation').fill('page 2, expérience principale');
  await page
    .getByLabel('Extrait')
    .fill('Reduced build time from 11 to 7 minutes.');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('status')).toContainText('Mémoire enregistrée');

  await page.reload();
  await page
    .getByRole('button', { name: 'Voir et corriger la provenance' })
    .click();
  await expect(page.getByLabel('Source', { exact: true })).toHaveValue(
    'CV corrigé',
  );
  await expect(page.getByLabel('Localisation')).toHaveValue(
    'page 2, expérience principale',
  );
  await expect(page.getByLabel('Extrait')).toHaveValue(
    'Reduced build time from 11 to 7 minutes.',
  );

  const history = await page.request.get('/api/profile/history');
  expect(history.ok()).toBe(true);
  expect((await history.json()) as unknown[]).toHaveLength(2);
});
