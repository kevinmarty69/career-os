import { expect, test } from '@playwright/test';
import { syntheticProfile } from '../../lib/fixture';
import { livingProfileInputSchema, type Profile } from '../../lib/schemas';
import { mockPersistedWorkspace } from './persisted-workspace';

test('guided interview resumes, preserves failed saves and signs only a private declared claim', async ({
  page,
  context,
}, testInfo) => {
  await context.addCookies([
    { name: 'career-os-locale', value: 'en', domain: 'localhost', path: '/' },
  ]);
  await mockPersistedWorkspace(page);
  let profile: Profile = {
    ...syntheticProfile,
    claims: syntheticProfile.claims.map((claim) => ({
      ...claim,
      level: 'declared',
    })),
  };
  let revision = 1;
  let fail = false;
  let pendingSave: Promise<void> | undefined;
  await page.route('**/api/profile', async (route) => {
    if (route.request().method() === 'PUT') {
      await pendingSave;
      if (fail)
        return route.fulfill({ status: 503, json: { error: 'unavailable' } });
      const input = route.request().postDataJSON();
      expect(input.expectedRevision).toBe(revision);
      profile = livingProfileInputSchema.parse(input.profile);
      revision++;
    }
    await route.fulfill({ json: { profile, revision } });
  });
  await page.goto('/memory');
  // Follow the real entry point; the feature must not be an orphan route.
  await page
    .getByRole('link', { name: 'Guided interview', exact: true })
    .click();
  await page.getByRole('button', { name: 'Start the 5 questions' }).click();
  await page.getByLabel('Your answer').fill('Built a deployment cache.');
  const skip = page.getByRole('button', { name: 'I don’t know', exact: true });
  await expect(skip).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await skip.hover();
  await expect(skip).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'What exactly did you change?',
  );
  await page.screenshot({
    path: testInfo.outputPath('guided-interview-question-en.png'),
    fullPage: true,
    animations: 'disabled',
  });
  fail = true;
  await page.getByRole('button', { name: 'Next question' }).click();
  await expect(page.locator('#main-content').getByRole('alert')).toContainText(
    'Could not save',
  );
  await expect(page.getByLabel('Your answer')).toHaveValue(
    'Built a deployment cache.',
  );
  fail = false;
  let releaseSave!: () => void;
  pendingSave = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  await page.getByRole('button', { name: 'Next question' }).click();
  await expect(page.getByLabel('Your answer')).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Save and exit' }),
  ).toBeDisabled();
  releaseSave();
  pendingSave = undefined;
  await expect(page.getByText('Question 2 of 5')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByText('Question 2 of 5')).toBeVisible();
  for (let question = 2; question <= 5; question++) {
    await page
      .getByRole('button', { name: 'I don’t know', exact: true })
      .click();
    await expect(
      page.getByText(
        question === 5
          ? 'Review before signing'
          : `Question ${question + 1} of 5`,
        { exact: true },
      ),
    ).toBeVisible();
  }
  await page
    .getByLabel('Your testimony', { exact: true })
    .fill('Built a deployment cache.');
  const sign = page.getByRole('button', { name: 'Sign and add to my memory' });
  await expect(sign).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath('guided-interview-review-en.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('checkbox').check();
  await page
    .getByLabel('Your testimony', { exact: true })
    .fill('Built a deployment cache. Reviewed.');
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await expect(sign).toBeDisabled();
  await page
    .getByLabel('Your testimony', { exact: true })
    .fill('Built a deployment cache.');
  await page.getByRole('checkbox').check();
  await sign.click();
  await expect(
    page.getByRole('heading', {
      name: 'Your experience is now in your memory',
    }),
  ).toBeVisible();
  expect(profile.claims).toHaveLength(syntheticProfile.claims.length + 1);
  expect(profile.claims.at(-1)).toMatchObject({
    level: 'declared',
    sensitivity: 'private',
    allowedUses: ['interview'],
  });
  await page.reload();
  await expect(
    page.getByText('Signed testimony', { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('guided-interview-signed-en.png'),
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Open career memory' }).click();
  await page.getByRole('button', { name: /Built a deployment cache/ }).click();
  await expect(page.locator('blockquote')).toHaveText(
    '“Built a deployment cache.”',
  );
});
