import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { API_PORT, WEB_PORT, devServers } from "./e2e/dev-servers.js";

// Each server writes wrangler's full debug log to a kept per-run file, so a server that dies
// mid-run leaves its cause behind; `e2e/global-setup.ts` prints the tail when that happens.
const { api: API_SERVER, web: WEB_SERVER } = devServers();

// `wrangler pages dev dist` serves whatever is in `dist/`, and serves nothing at all when it
// is missing — which surfaces as a 120-second webServer timeout or a wall of 404s several
// minutes into the run. Config evaluation happens before any server starts, so checking here
// costs nothing and fails immediately with the command that fixes it.
const DIST_ENTRY = new URL("./dist/index.html", import.meta.url);
if (!existsSync(DIST_ENTRY)) {
  throw new Error(
    "apps/web/dist is missing or unbuilt — Playwright serves the built SPA, not the dev server.\n" +
      "Build it first:\n\n" +
      "  pnpm --filter @tarkov/web build && pnpm --filter @tarkov/web test:e2e\n",
  );
}

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
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
      testIgnore: /phone\.spec\.ts$/,
    },
    {
      // A phone-width Chromium: the shipped routes and one core Builder flow, not the whole
      // suite a second time. CI minutes are spend, and every other spec's subject renders the
      // same at any width.
      name: "phone",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
      testMatch: /phone\.spec\.ts$/,
    },
  ],
  webServer: [
    {
      // A fresh KV store per run, made by the shell when the server starts. The default
      // `.wrangler/state` outlives the run, and with it builds-api's per-IP daily write
      // counter: the suite's share and pair writes used up a day's admissions after a handful
      // of local runs, and every later run failed with 429s. CI starts empty anyway.
      command: `pnpm --filter @tarkov/builds-api exec wrangler dev --persist-to "$(mktemp -d -t tarkov-e2e-kv.XXXXXX)" --ip 127.0.0.1 --port ${API_PORT} --var OG_FIXTURE_BUILD_ID:abcd2345 --var OG_FIXTURE_PAIR_ID:efgh6789 --var OG_FIXTURE_V1_BUILD_ID:abcd2346 --var OG_FIXTURE_V1_PAIR_ID:efgh6782`,
      url: `http://127.0.0.1:${API_PORT}/healthz`,
      timeout: 60_000,
      env: { WRANGLER_LOG_PATH: API_SERVER.logFile },
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `pnpm --filter @tarkov/web exec wrangler pages dev dist --ip 127.0.0.1 --port ${WEB_PORT} --binding BUILDS_API_URL=http://127.0.0.1:${API_PORT}`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      timeout: 120_000,
      env: { WRANGLER_LOG_PATH: WEB_SERVER.logFile },
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
