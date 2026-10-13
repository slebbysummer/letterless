import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 10 * 60 * 1000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  // One game at a time: Supabase limits new anonymous players per hour from one network.
  workers: 1,
  use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
});
