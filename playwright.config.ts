import { defineConfig, devices } from "@playwright/test";

const port = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next dev --port ${port}`,
    url: `http://127.0.0.1:${port}/unlock`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL: "pglite://memory",
      APP_PASSCODE: "test-passcode-123",
      SESSION_SECRET: "e2e-session-secret-that-is-long-enough-0123456789",
      CRON_SECRET: "e2e-cron-secret",
      RULECARD_STUB_AI: "1",
    },
  },
});
