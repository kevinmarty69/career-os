import { expect, test } from '@playwright/test';
import {
  mockPersistedWorkspace,
  pendingReviewRun,
} from './persisted-workspace';

test('sidebar footer stays in the viewport while content and navigation scroll', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile',
    'Mobile uses the bottom navigation.',
  );
  await mockPersistedWorkspace(page, pendingReviewRun);

  for (const path of ['/', '/memory']) {
    await page.goto(path);
    const sidebar = page.locator('.co-sidebar');
    const footer = sidebar.locator('.co-sidebar-footer');
    const account = footer.locator('summary');
    await expect(account).toBeVisible();

    for (const height of [1000, 768, 600, 400, 320]) {
      await page.setViewportSize({ width: 1280, height });
      await page.evaluate(() => window.scrollTo(0, 0));
      const initial = await footer.boundingBox();
      expect(initial).not.toBeNull();
      expect(initial!.y).toBeGreaterThanOrEqual(0);
      expect(initial!.y + initial!.height).toBeLessThanOrEqual(height);
      await expect(sidebar).toHaveCSS('height', `${height}px`);

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect
        .poll(async () => (await footer.boundingBox())!.y)
        .toBeCloseTo(initial!.y, 0);
      if (height <= 320 || (path === '/' && height <= 600)) {
        await expect
          .poll(() => page.evaluate(() => window.scrollY))
          .toBeGreaterThan(0);
      }

      const scroll = sidebar.locator('.co-sidebar-scroll');
      await scroll.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      if (height <= 400) {
        expect(
          await scroll.evaluate((element) => element.scrollTop),
        ).toBeGreaterThan(0);
      }
      expect((await footer.boundingBox())!.y).toBeCloseTo(initial!.y, 0);
      await account.click();
      const settings = footer.locator('a[href="/settings/profile"]');
      await expect(settings).toBeVisible();
      const menu = await settings.boundingBox();
      expect(menu!.y).toBeGreaterThanOrEqual(0);
      expect(menu!.y + menu!.height).toBeLessThan(height);
      await account.press('Escape');
      await page.screenshot({
        path: testInfo.outputPath(
          `sidebar-${path === '/' ? 'home' : 'memory'}-${height}.png`,
        ),
        animations: 'disabled',
      });
    }
  }
});
