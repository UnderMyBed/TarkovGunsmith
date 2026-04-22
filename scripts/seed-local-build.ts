#!/usr/bin/env tsx
/**
 * Seeds a build into the local builds-api Worker and prints the share URL.
 *
 * Prerequisites:
 *   - `pnpm dev` is running (or at least the builds-api Worker is up on :8788)
 *   - `scripts/fixtures/build-m4a1.json` validates against the current Build schema
 *
 * Usage: `pnpm seed:build`
 *
 * See docs/operations/local-development.md for the full workflow.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Use a relative import to the built dist — the scripts/ dir is not a workspace
// package, so the @tarkov/data alias is not resolved from here.
import { Build } from "../packages/tarkov-data/dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, "fixtures/build-m4a1.json");
const BUILDS_API = process.env.BUILDS_API_URL ?? "http://localhost:8788";
const WEB = process.env.WEB_URL ?? "http://localhost:5173";

async function main(): Promise<void> {
  // 1. Load fixture + validate against the current schema. Throws on drift.
  const fixtureJson = readFileSync(FIXTURE_PATH, "utf-8");
  const fixture: unknown = JSON.parse(fixtureJson);
  const parsed = Build.safeParse(fixture);
  if (!parsed.success) {
    console.error("✗ fixture does not match current Build schema:");
    console.error(JSON.stringify(parsed.error.issues, null, 2));
    console.error(
      "\nUpdate scripts/fixtures/build-m4a1.json to match packages/tarkov-data/src/build-schema.ts.",
    );
    process.exit(1);
  }

  // 2. POST to local builds-api.
  const postUrl = `${BUILDS_API}/builds`;
  let response: Response;
  try {
    response = await fetch(postUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
  } catch (err) {
    console.error(`✗ POST ${postUrl} failed to connect.`);
    console.error(
      "Is the builds-api Worker running? Start it with `pnpm dev` " +
        "or `pnpm --filter @tarkov/builds-api dev`.",
    );
    console.error(`\nUnderlying error: ${(err as Error).message}`);
    process.exit(1);
  }

  if (!response.ok) {
    console.error(`✗ builds-api returned ${response.status} ${response.statusText}`);
    console.error(await response.text());
    process.exit(1);
  }

  const body = (await response.json()) as { id: string; url: string };

  // 3. Print the useful URLs.
  console.log(`✓ seeded build: ${body.id}`);
  console.log(`  share URL:    ${WEB}/builder/${body.id}`);
  console.log(`  compare URL:  ${WEB}/builder/compare`);
  console.log(`\nOpen the share URL in the browser that's running \`pnpm dev\` (Vite on :5173).`);
}

main().catch((err) => {
  console.error("✗ seed-local-build failed:", err);
  process.exit(1);
});
