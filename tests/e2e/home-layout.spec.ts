import { expect, test } from '@playwright/test';
import {
  applicationId,
  mockPersistedWorkspace,
  pendingReviewRun,
} from './persisted-workspace';

for (const locale of ['en', 'fr']) {
  test(`home keeps the handoff desktop grid and responsive cards (${locale})`, async ({
    page,
    context,
  }, testInfo) => {
    await context.addCookies([
      {
        name: 'career-os-locale',
        value: locale,
        domain: 'localhost',
        path: '/',
      },
    ]);
    await mockPersistedWorkspace(page, pendingReviewRun);
    await page.goto('/');
    await expect(
      page.getByRole('heading', {
        name:
          locale === 'en'
            ? '1 decision needs your review for Signal Forge.'
            : '1 décision à trancher pour Signal Forge.',
      }),
    ).toBeVisible();
    const widths =
      testInfo.project.name === 'mobile'
        ? [390]
        : [1600, 1440, 1280, 1024, 768];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 1000 });
      const layout = await page.evaluate(() => {
        const rect = (selector: string) =>
          document.querySelector(selector)!.getBoundingClientRect().toJSON();
        return {
          list: rect('.co-home-applications'),
          rail: rect('.co-home-strengthen'),
          card: rect('.co-home-applications > a'),
          icon: rect('.co-home-applications > a > i'),
          text: rect('.co-home-applications > a > span'),
          arrow: rect('.co-home-applications > a > .co-icon'),
          scrollWidth: document.documentElement.scrollWidth,
        };
      });
      expect(layout.scrollWidth).toBeLessThanOrEqual(width);
      if (width >= 900) {
        expect(Math.abs(layout.list.y - layout.rail.y)).toBeLessThan(2);
        expect(
          layout.rail.x - (layout.list.x + layout.list.width),
        ).toBeGreaterThanOrEqual(17);
      } else {
        expect(layout.rail.y).toBeGreaterThanOrEqual(
          layout.list.y + layout.list.height,
        );
      }
      expect(layout.card.height).toBeLessThan(110);
      expect(layout.icon.width).toBe(width > 760 ? 44 : 40);
      expect(layout.text.x).toBeGreaterThan(layout.icon.x + layout.icon.width);
      expect(
        Math.abs(
          layout.icon.y +
            layout.icon.height / 2 -
            (layout.text.y + layout.text.height / 2),
        ),
      ).toBeLessThan(2);
      expect(layout.arrow.x + layout.arrow.width).toBeLessThanOrEqual(
        layout.card.x + layout.card.width - 10,
      );
      const action = page.locator('.co-home-signal a').first();
      await action.focus();
      await expect(action).toBeFocused();
      await expect(action).toHaveAttribute(
        'href',
        `/applications/${applicationId}`,
      );
      await page.screenshot({
        path: testInfo.outputPath(`home-${locale}-${width}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    }
    // The publication-activity variant uses the same restored banner grid.
    await page.route('**/api/publications', (route) =>
      route.fulfill({
        json: {
          publications: [
            {
              publicationId: '988c0a00-0000-4000-8000-000000000047',
              applicationId,
              company: 'Signal Forge',
              role: 'Staff Platform Engineer',
              publishedAt: '2026-09-09T12:00:00.000Z',
              revokedAt: null,
              expiresAt: '2099-01-01T00:00:00.000Z',
              status: 'active',
              version: 1,
              isCurrent: true,
              firstOpenedAt: '2026-09-10T09:00:00.000Z',
              lastOpenedAt: '2026-09-10T10:00:00.000Z',
              opens: 3,
              sections: 2,
              actions: 1,
              downloads: 1,
            },
          ],
        },
      }),
    );
    await page.setViewportSize({ width: widths[0], height: 1000 });
    await page.reload();
    await expect(page.locator('.co-home-signal > aside')).toBeVisible();
    await expect(page.locator('.co-home-signal')).toHaveCSS(
      'padding-left',
      widths[0] < 900 ? '20px' : '32px',
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(widths[0]);
    await page.screenshot({
      path: testInfo.outputPath(`home-signal-${locale}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  });
}
