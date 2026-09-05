import { expect, test } from '@playwright/test';
import { mockPersistedWorkspace } from './persisted-workspace';

test('keeps the English dashboard keyboard and screen-reader navigable', async ({
  context,
  page,
}) => {
  await context.clearCookies();
  await mockPersistedWorkspace(page);
  await page.goto('/');

  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skipLink).toBeFocused();
  await skipLink.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();

  const tree = await page.locator('#main-content').ariaSnapshot();
  expect(tree).toContain(
    '- heading "Start the evidence workflow for Signal Forge." [level=1]',
  );
  expect(tree).toContain('- region "Key metrics"');
  expect(tree).toContain('- link "Open application');
});
