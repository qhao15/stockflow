import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-cleanup.js',
  globalTeardown: './e2e/global-cleanup.js',
  // One test file at a time, in name order, each in its own browser window.
  workers: 1,
  // The limit for one test. Long, because npm run test:e2e:headed slows every action down.
  timeout: 120_000,
  // How long a check keeps retrying. Longer than the default 5 seconds, because some requests
  // take a few seconds on a local database with a small cache.
  expect: { timeout: 15_000 },
  // A saved trace shows every step of a failed test: npx playwright show-trace <file>
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    // npm run test:e2e:headed waits 2 seconds before each browser action, so you can watch.
    launchOptions: { slowMo: process.env.npm_lifecycle_event === 'test:e2e:headed' ? 2000 : 0 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // The tests' own API and client, on their own ports, so they don't touch npm run dev. The API
  // runs without --watch: on Windows, the test scripts reading server files can look like a
  // change to --watch, which would restart the API in the middle of a test.
  webServer: [
    {
      command: 'node src/index.js',
      cwd: 'server',
      env: { PORT: '5001', API_RATE_LIMIT: '100000' },
      url: 'http://localhost:5001/api/health',
      timeout: 120_000,
    },
    {
      command: 'npm run dev -- --port 5174 --strictPort',
      cwd: 'client',
      env: { API_URL: 'http://localhost:5001', VITE_CACHE_DIR: 'node_modules/.vite-e2e' },
      url: 'http://localhost:5174',
      timeout: 120_000,
    },
  ],
});
