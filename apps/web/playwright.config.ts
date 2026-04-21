import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = 4173;
const API_PORT = 8787;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: `pnpm --filter @tarkov/builds-api exec wrangler dev --ip 127.0.0.1 --port ${API_PORT} --var OG_FIXTURE_BUILD_ID:abcd2345 --var OG_FIXTURE_PAIR_ID:efgh6789`,
      url: `http://127.0.0.1:${API_PORT}/healthz`,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `pnpm --filter @tarkov/web exec wrangler pages dev dist --ip 127.0.0.1 --port ${WEB_PORT} --binding BUILDS_API_URL=http://127.0.0.1:${API_PORT}`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
