import { expect, test } from '@playwright/test';
import {
  applicationId,
  mockPersistedWorkspace,
  pendingReviewRun,
} from './persisted-workspace';

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

// Check rendered styles after the entire CSS cascade, with actual loaded data.
// API mocking isolates UI behavior; persistence and RLS have separate SQL/HTTP tests.
test('rendered status labels and primary actions meet AA text contrast', async ({
  page,
}) => {
  await mockPersistedWorkspace(page, pendingReviewRun);
  for (const path of [
    '/applications',
    '/memory',
    `/applications/${applicationId}/review`,
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    if (path === '/memory') {
      await expect(
        page.getByRole('textbox', { name: 'Affirmation', exact: true }),
      ).toHaveValue('Reduced build p50 from 11 to 7 minutes.');
    } else {
      await expect(
        page
          .locator('#main-content')
          .getByText('Signal Forge', { exact: true })
          .first(),
      ).toBeVisible();
    }
    const labels = await page
      .locator('.co-badge, [data-proof-status], .co-button:not(:disabled)')
      .evaluateAll((elements) => {
        function rgba(value: string) {
          const channels = value.match(/[\d.]+/g)?.map(Number);
          if (!channels || channels.length < 3)
            throw new Error(`Unsupported computed color: ${value}`);
          return [channels[0], channels[1], channels[2], channels[3] ?? 1];
        }
        function over(front: number[], back: number[]) {
          return front
            .slice(0, 3)
            .map((channel, i) => channel * front[3] + back[i] * (1 - front[3]));
        }
        function luminance(rgb: number[]) {
          const linear = rgb.map((channel) => {
            const c = channel / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          });
          return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
        }
        return elements
          .filter(
            (element) =>
              element.getClientRects().length && element.textContent?.trim(),
          )
          .map((element) => {
            const ancestors: Element[] = [];
            for (
              let node: Element | null = element;
              node;
              node = node.parentElement
            )
              ancestors.unshift(node);
            let background = [255, 255, 255];
            for (const node of ancestors)
              background = over(
                rgba(getComputedStyle(node).backgroundColor),
                background,
              );
            const style = getComputedStyle(element);
            const foreground = over(rgba(style.color), background);
            const [light, dark] = [
              luminance(foreground),
              luminance(background),
            ].sort((a, b) => b - a);
            return {
              text: element.textContent?.trim(),
              ratio: (light + 0.05) / (dark + 0.05),
            };
          });
      });
    expect(
      labels.length,
      `${path} must load status labels or actions`,
    ).toBeGreaterThan(0);
    for (const label of labels)
      expect(label.ratio, `${path}: ${label.text}`).toBeGreaterThanOrEqual(4.5);
  }
});
