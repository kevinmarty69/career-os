import { expect, test } from '@playwright/test';

test('magic-link entry uses Supabase PKCE and reports delivery errors without creating a session', async ({
  page,
  context,
}) => {
  await context.clearCookies();
  let fail = true;
  let attempts = 0;
  let releaseResponse!: () => void;
  const pendingResponse = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await page.route('**/auth/v1/**', async (route) => {
    const url = new URL(route.request().url());
    expect(url.pathname).toBe('/auth/v1/otp');
    expect(url.searchParams.get('redirect_to')).toBe(
      'http://localhost:3117/auth/callback',
    );
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({
      email: 'test@example.com',
      create_user: false,
      code_challenge_method: 's256',
    });
    expect(body.code_challenge).toBeTruthy();
    attempts++;
    await pendingResponse;
    await route.fulfill(
      fail
        ? { status: 503, json: { message: 'Synthetic outage' } }
        : { json: {} },
    );
  });
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: true }).fill('test@example.com');
  await page.getByRole('button', { name: 'Send my sign-in link' }).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeDisabled();
  await expect(page.locator('.auth-tabs button')).toHaveCount(2);
  for (const tab of await page.locator('.auth-tabs button').all()) {
    await expect(tab).toBeDisabled();
  }
  releaseResponse();
  await expect(page.locator('.auth-card').getByRole('alert')).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Send my sign-in link' }).click();
  await expect(page.locator('.auth-card').getByRole('status')).toContainText(
    'If this address is eligible',
  );
  expect(attempts).toBe(2);
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('public introduction links to auth and marks its sample evidence', async ({
  page,
  context,
}, testInfo) => {
  await context.addCookies([
    { name: 'career-os-locale', value: 'en', domain: 'localhost', path: '/' },
  ]);
  await page.goto('/welcome');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Application AI',
  );
  await page.getByRole('button', { name: 'corvid_postmortem.md · §4' }).click();
  await expect(page.getByText(/Example document:/)).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Get started', exact: true }),
  ).toHaveAttribute('href', '/sign-in');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('welcome-en.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('link', { name: 'Get started', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome back' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Send my sign-in link' }),
  ).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Use a password', exact: true })
    .click();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Use an email sign-in link', exact: true })
    .click();
  await page.getByLabel('Email', { exact: true }).fill('test@example.com');
  expect(
    await page
      .getByLabel('Email', { exact: true })
      .evaluate((el) => getComputedStyle(el).outlineStyle),
  ).toBe('none');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('sign-in-en.png'),
    fullPage: true,
    animations: 'disabled',
  });
});
