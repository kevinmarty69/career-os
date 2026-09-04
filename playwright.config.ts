import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  webServer: {
    command: 'pnpm exec next start --port 3117',
    port: 3117,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: 'postgres://career_os:career_os@127.0.0.1:54329/career_os',
      BETTER_AUTH_URL: 'http://localhost:3117',
      BETTER_AUTH_SECRET: 'career-os-local-test-secret-change-me',
      CAREER_OS_E2E: '1',
    },
  },
  use: {
    baseURL: 'http://localhost:3117',
    storageState: {
      cookies: [
        {
          name: 'career-os-locale',
          value: 'fr',
          domain: 'localhost',
          path: '/',
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: 'Lax',
        },
      ],
      origins: [],
    },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
  ],
});
