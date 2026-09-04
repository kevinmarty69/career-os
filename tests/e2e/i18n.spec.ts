import { expect, test } from '@playwright/test';

test('switches from English to French and persists after reload', async ({
  context,
  page,
}) => {
  await context.clearCookies();
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    page.getByRole('heading', {
      name: 'Three claims need your decision before you send your private page.',
    }),
  ).toBeVisible();

  const switcher = page.getByRole('group', { name: 'Language' });
  await switcher.getByRole('button', { name: 'FR' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(
    page.getByRole('heading', {
      name: 'Trois affirmations à trancher avant d’envoyer votre page privée.',
    }),
  ).toBeVisible();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(
    page.getByRole('heading', {
      name: 'Trois affirmations à trancher avant d’envoyer votre page privée.',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'FR', pressed: true }),
  ).toBeVisible();

  await page.goto('/applications');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Candidatures',
      exact: true,
    }),
  ).toBeVisible();
});
