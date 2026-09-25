import { defineConfig } from '@playwright/test'

/**
 * Browser tests of the whole product: the built frontend talking to the real
 * backend and database. Bring the stack up first:
 *
 *   docker compose up --build -d      (from the repository root)
 *   pnpm e2e
 *
 * E2E_BASE_URL / E2E_API_URL point it at another deployment. It drives the
 * Chrome that is already installed (no browser download); set E2E_BROWSER to
 * "chromium" to use Playwright's own after `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
    channel: process.env.E2E_BROWSER === 'chromium' ? undefined : 'chrome',
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
})
