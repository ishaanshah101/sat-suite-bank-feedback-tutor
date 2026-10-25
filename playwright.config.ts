import { defineConfig, devices } from "@playwright/test";

const port = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next build && pnpm exec next start --port ${port}`,
    url: `http://localhost:${port}/unlock`,
    reuseExistingServer: false,
    timeout: 400_000,
    env: {
      DATABASE_URL: "pglite://memory",
      APP_PASSCODE: "test-passcode-123",
      SESSION_SECRET: "e2e-session-secret-that-is-long-enough-0123456789",
      CRON_SECRET: "e2e-cron-secret",
      RULECARD_STUB_AI: "1",
    },
  },
});
