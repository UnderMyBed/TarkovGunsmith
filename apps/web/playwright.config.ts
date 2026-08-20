import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = 4173;
const API_PORT = 8787;
/** Serves the captured upstream documents to the OG Pages Functions. */
const UPSTREAM_PORT = 8790;

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
    },
  ],
  webServer: [
    {
      // The OG Pages Functions fetch json.tarkov.dev server-side, out of reach of the
      // browser-side interception in e2e/upstream.ts. This serves them the same captures.
      command: `pnpm exec tsx e2e/upstream-fixture-server.ts ${UPSTREAM_PORT}`,
      url: `http://127.0.0.1:${UPSTREAM_PORT}/healthz`,
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `pnpm --filter @tarkov/builds-api exec wrangler dev --ip 127.0.0.1 --port ${API_PORT} --var OG_FIXTURE_BUILD_ID:abcd2345 --var OG_FIXTURE_PAIR_ID:efgh6789`,
      url: `http://127.0.0.1:${API_PORT}/healthz`,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `pnpm --filter @tarkov/web exec wrangler pages dev dist --ip 127.0.0.1 --port ${WEB_PORT} --binding BUILDS_API_URL=http://127.0.0.1:${API_PORT} --binding TARKOV_JSON_API_BASE=http://127.0.0.1:${UPSTREAM_PORT}/regular/`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
