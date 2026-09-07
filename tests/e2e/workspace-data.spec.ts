import { expect, test } from '@playwright/test';

test('exports the workspace and requires an exact deletion confirmation', async ({
  page,
}) => {
  let exported = false;
  let deleted = false;
  await page.route('**/api/workspace/export', async (route) => {
    exported = true;
    await route.fulfill({
      body: '{"type":"manifest"}\n',
      contentType: 'application/x-ndjson',
      headers: {
        'content-disposition': 'attachment; filename="careeros-export.ndjson"',
      },
    });
  });
  await page.route('**/api/workspace', async (route) => {
    expect(route.request().method()).toBe('DELETE');
    expect(route.request().postDataJSON()).toEqual({
      confirmation: 'SUPPRIMER',
    });
    deleted = true;
    await route.fulfill({ status: 204 });
  });

  await page.goto('/settings/data');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Générer l’archive' }).click();
  await expect.poll(() => exported).toBe(true);
  await expect(page.getByRole('status')).toContainText('Export téléchargé');
  await expect((await download).suggestedFilename()).toBe(
    'careeros-export.ndjson',
  );

  const remove = page.getByRole('button', {
    name: 'Supprimer définitivement',
  });
  await expect(remove).toBeDisabled();
  await page.getByLabel('Tapez SUPPRIMER pour confirmer').fill('supprimer');
  await expect(remove).toBeDisabled();
  await page.getByLabel('Tapez SUPPRIMER pour confirmer').fill('SUPPRIMER');
  await expect(remove).toBeEnabled();
  await remove.click();
  await expect.poll(() => deleted).toBe(true);
});
