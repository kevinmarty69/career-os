import { expect, test, type Page, type Route } from '@playwright/test';

type StoredProfile = {
  searchProfileId: string;
  name: string;
  alertThreshold: number | null;
  active: boolean;
  hardConstraints: Record<string, unknown>;
  softPreferences: Record<string, unknown>;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

test('creates multiple profiles and explains deterministic hard-criterion effects', async ({
  page,
}) => {
  const stored: StoredProfile[] = [];
  await mockSearchProfiles(page, stored);
  await page.goto('/search-profiles');

  await expect(
    page.getByRole('heading', { name: 'Profils de recherche' }),
  ).toBeVisible();
  await expect(
    page.getByText('Inconnu ne signifie jamais refusé.'),
  ).toBeVisible();

  await page.getByLabel('Nom du profil').fill('Product Europe');
  await page.getByLabel('Seuil d’alerte').fill('75');
  await page.getByLabel('Rôles').fill('Product Engineer, Software Engineer');
  await page.getByRole('button', { name: 'Enregistrer le profil' }).click();
  await expect(page.getByText('Profil enregistré.')).toBeVisible();

  await page.getByLabel('Valeur de l’offre').fill('Sales Engineer');
  await expect(page.getByRole('status')).toContainText(
    'BloquéLa valeur ne respecte pas ce critère obligatoire.',
  );
  await page.getByLabel('Valeur de l’offre').fill('Product Engineer');
  await expect(page.getByRole('status')).toContainText('Compatible');

  await page.getByRole('button', { name: 'Nouveau profil' }).click();
  await page.getByLabel('Nom du profil').fill('Founding US overlap');
  await page.getByLabel('Fuseaux horaires').fill('UTC-5, UTC-4');
  await page.getByRole('button', { name: 'Enregistrer le profil' }).click();

  await expect(
    page.getByRole('button', { name: /Product Europe/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Founding US overlap/ }),
  ).toBeVisible();
  expect(stored).toHaveLength(2);
  expect(
    stored.find(({ name }) => name === 'Product Europe')?.alertThreshold,
  ).toBe(75);
});

test('keeps the search profile editor inside a mobile viewport', async ({
  page,
}) => {
  await mockSearchProfiles(page, []);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/search-profiles');
  await expect(
    page.getByRole('heading', { name: 'Profils de recherche' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

async function mockSearchProfiles(page: Page, stored: StoredProfile[]) {
  await page.route('**/api/search-profiles', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ searchProfiles: stored }),
      });
      return;
    }
    const now = new Date().toISOString();
    const body = route.request().postDataJSON() as Omit<
      StoredProfile,
      'searchProfileId' | 'revision' | 'createdAt' | 'updatedAt'
    >;
    const created = {
      ...body,
      searchProfileId: crypto.randomUUID(),
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    stored.unshift(created);
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(created),
    });
  });
  await page.route('**/api/search-profiles/*', async (route) => {
    await handleItem(route, stored);
  });
}

async function handleItem(route: Route, stored: StoredProfile[]) {
  const id = route.request().url().split('/').at(-1);
  const index = stored.findIndex((profile) => profile.searchProfileId === id);
  if (index < 0) {
    await route.fulfill({ status: 404, body: 'Not found' });
    return;
  }
  if (route.request().method() === 'DELETE') {
    stored.splice(index, 1);
    await route.fulfill({ status: 204 });
    return;
  }
  const body = route.request().postDataJSON() as Partial<StoredProfile>;
  const updated = {
    ...stored[index],
    ...body,
    revision: stored[index].revision + 1,
    updatedAt: new Date().toISOString(),
  };
  stored[index] = updated;
  await route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(updated),
  });
}
