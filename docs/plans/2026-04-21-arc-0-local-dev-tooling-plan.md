# M3.5 Arc 0 — Ops & Local Dev-Tooling Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-04-21-local-dev-tooling-design.md`](../superpowers/specs/2026-04-21-local-dev-tooling-design.md)

**Goal:** Make the full stack runnable locally via a single `pnpm dev`, codify the `.dev.vars` convention, add a `pnpm seed:build` helper for `/builder/:id` testing, and document the whole local-dev + prod-ops story in one runbook — including the outstanding `BUILDS_API_URL` Pages secret.

**Architecture:** All changes are configuration, scripts, and docs. Zero code changes in `apps/` or `packages/`. Turbo already orchestrates `pnpm dev` fan-out via `persistent: true`, so the real work is: pin wrangler dev ports so the two Workers don't collide, template `.dev.vars` per workspace, add a small `tsx` seed script that POSTs a zod-validated fixture to local builds-api, write the runbook, and cross-link the runbook from every CLAUDE.md that mentions local dev.

**Tech Stack:** Wrangler 4 (existing), Turbo (existing), Node 22 + `tsx` (new root devDep), Zod via `@tarkov/data` (existing).

**Branch & rollout:** Already on `feat/m3.5-arc-0-local-dev` off `origin/main`. Spec commit `f28db13` already present. ONE PR at end. Commits in this plan (after the existing spec commit):

1. `docs(m3.5): Arc 0 implementation plan` (this task's deliverable)
2. `chore(dev): pin wrangler dev ports + .dev.vars convention`
3. `chore(dev): seed-build helper + M4A1 fixture`
4. `docs(ops): local-development runbook + CLAUDE.md cross-links`

---

## File map

**New files (7):**

| Path                                                    | Purpose                                                                |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `apps/builds-api/.dev.vars.example`                     | Template for OG fixture env vars.                                      |
| `apps/data-proxy/.dev.vars.example`                     | Template for GraphQL upstream override.                                |
| `apps/web/.dev.vars.example`                            | Template for `BUILDS_API_URL=http://localhost:8788` (fixes pages:dev). |
| `scripts/seed-local-build.ts`                           | POSTs fixture to local builds-api, prints share URL.                   |
| `scripts/fixtures/build-m4a1.json`                      | Realistic M4A1 build JSON validated against `Build` schema.            |
| `docs/operations/local-development.md`                  | Full local-dev runbook + prod-secret instructions.                     |
| `docs/plans/2026-04-21-arc-0-local-dev-tooling-plan.md` | This plan.                                                             |

**Modified files (7):**

| Path                             | What changes                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `apps/builds-api/wrangler.jsonc` | Add `"dev": { "port": 8788 }`; remove `OG_FIXTURE_BUILD_ID` + `OG_FIXTURE_PAIR_ID` from `vars` block.                   |
| `apps/data-proxy/wrangler.jsonc` | Add `"dev": { "port": 8787 }`.                                                                                          |
| `.gitignore`                     | Add `.dev.vars` glob (excluding `.dev.vars.example`).                                                                   |
| `package.json` (root)            | Add `"seed:build"` script; add `tsx` to `devDependencies`.                                                              |
| `apps/builds-api/CLAUDE.md`      | Replace local-dev snippet with runbook link + `.dev.vars.example` mention.                                              |
| `apps/data-proxy/CLAUDE.md`      | Same treatment.                                                                                                         |
| `apps/web/CLAUDE.md`             | Same treatment + cross-link the "Env vars on Cloudflare Pages" section.                                                 |
| `CLAUDE.md` (root)               | Add "Local development" pointer to runbook; remove the "Production action still open" callout (now covered by runbook). |

---

## Phase A — Baseline

### Task 1: Confirm baseline green before touching anything

**Files:** (none — verification only)

- [ ] **Step 1: Confirm we're on the arc branch**

Run: `git branch --show-current`
Expected: `feat/m3.5-arc-0-local-dev`

- [ ] **Step 2: Confirm the spec is present**

Run: `git log --oneline -3`
Expected: three commits, latest is `f28db13 docs(m3.5): Arc 0 — Ops & local dev-tooling sweep design` (or newer if plan commit already landed).

- [ ] **Step 3: Baseline checks**

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

Expected: all pass. If anything fails, STOP and report — don't mix a baseline-repair commit with Arc 0 changes.

---

## Phase B — Port pinning + `.dev.vars` convention

### Task 2: Pin wrangler dev ports and clean up OG_FIXTURE vars

**Files:**

- Modify: `apps/data-proxy/wrangler.jsonc`
- Modify: `apps/builds-api/wrangler.jsonc`

- [ ] **Step 1: Pin data-proxy to :8787**

Edit `apps/data-proxy/wrangler.jsonc`. The current file (from exploration):

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "tarkov-gunsmith-data-proxy",
  "main": "src/index.ts",
  "compatibility_date": "2024-09-23",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },
  "vars": {
    "UPSTREAM_GRAPHQL_URL": "https://api.tarkov.dev/graphql",
  },
}
```

Add a `dev` block after `observability`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "tarkov-gunsmith-data-proxy",
  "main": "src/index.ts",
  "compatibility_date": "2024-09-23",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },
  "dev": { "port": 8787 },
  "vars": {
    "UPSTREAM_GRAPHQL_URL": "https://api.tarkov.dev/graphql",
  },
}
```

- [ ] **Step 2: Pin builds-api to :8788 and remove OG_FIXTURE vars**

Edit `apps/builds-api/wrangler.jsonc`. Current file:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "tarkov-gunsmith-builds-api",
  "main": "src/index.ts",
  "compatibility_date": "2024-09-23",
  "observability": { "enabled": true },
  "kv_namespaces": [
    {
      "binding": "BUILDS",
      "id": "c42204b518fd4af2a5f3aa5bd8f24d69",
    },
  ],
  "vars": {
    "BUILD_TTL_SECONDS": "2592000",
    "OG_FIXTURE_BUILD_ID": "",
    "OG_FIXTURE_PAIR_ID": "",
  },
}
```

Replace with (add `dev` block, drop `OG_FIXTURE_*`):

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "tarkov-gunsmith-builds-api",
  "main": "src/index.ts",
  "compatibility_date": "2024-09-23",
  "observability": { "enabled": true },
  "dev": { "port": 8788 },
  "kv_namespaces": [
    {
      "binding": "BUILDS",
      "id": "c42204b518fd4af2a5f3aa5bd8f24d69",
    },
  ],
  "vars": {
    "BUILD_TTL_SECONDS": "2592000",
  },
}
```

- [ ] **Step 3: Verify data-proxy binds to 8787**

Run (will hang — Ctrl-C after the Ready line):

```bash
pnpm --filter @tarkov/data-proxy dev
```

Expected output contains a line like `[wrangler:info] Ready on http://localhost:8787`. If it binds to any other port, the `dev.port` field was written wrong — re-check.

- [ ] **Step 4: Verify builds-api binds to 8788**

```bash
pnpm --filter @tarkov/builds-api dev
```

Expected: `Ready on http://localhost:8788`.

- [ ] **Step 5: Confirm no regressions**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all pass. The OG-cards tests that reference `OG_FIXTURE_BUILD_ID` should still pass — they read the env var at runtime, and the test harness supplies its own value regardless of what's in `wrangler.jsonc`. If one of those tests fails, it was relying on the empty-string default; look at the test setup in `apps/builds-api/src/` and pass the env var explicitly in the test's `SELF.fetch({ env: { ... } })` call.

### Task 3: Add `.dev.vars.example` templates and gitignore

**Files:**

- Create: `apps/builds-api/.dev.vars.example`
- Create: `apps/data-proxy/.dev.vars.example`
- Create: `apps/web/.dev.vars.example`
- Modify: `.gitignore`

- [ ] **Step 1: Create `apps/builds-api/.dev.vars.example`**

Contents:

```
# Local-only dev fixture hooks. Copy to .dev.vars (gitignored) and fill in
# to exercise the OG card Pages Functions in local dev. Leave blank in
# production — OG_FIXTURE_* is never set in prod wrangler.jsonc.
OG_FIXTURE_BUILD_ID=
OG_FIXTURE_PAIR_ID=
```

- [ ] **Step 2: Create `apps/data-proxy/.dev.vars.example`**

Contents:

```
# Override the upstream GraphQL endpoint for local staging-swap experiments.
# The default (https://api.tarkov.dev/graphql) is set in wrangler.jsonc — only
# copy this file to .dev.vars and edit if you need to point at a different
# upstream for a session.
UPSTREAM_GRAPHQL_URL=https://api.tarkov.dev/graphql
```

- [ ] **Step 3: Create `apps/web/.dev.vars.example`**

Contents:

```
# Read by `wrangler pages dev` for apps/web Pages Functions. Without this,
# functions/api/builds/[[path]].ts returns 500 (same root cause as the
# outstanding prod-secret gap documented in docs/operations/local-development.md).
BUILDS_API_URL=http://localhost:8788
```

- [ ] **Step 4: Update `.gitignore`**

Current file (relevant section):

```gitignore
# env
.env
.env.local
.env.*.local
```

Add `.dev.vars` below `.env.*.local` (so `.dev.vars.example` stays tracked):

```gitignore
# env
.env
.env.local
.env.*.local
.dev.vars
```

- [ ] **Step 5: Verify the example files are tracked and `.dev.vars` is ignored**

```bash
echo "PROBE=value" > apps/builds-api/.dev.vars
git status --short
```

Expected: `.dev.vars` is NOT listed (gitignored); the three `.dev.vars.example` files ARE listed as `??`.

Clean up the probe:

```bash
rm apps/builds-api/.dev.vars
```

- [ ] **Step 6: Commit Phase B**

```bash
git add apps/data-proxy/wrangler.jsonc apps/builds-api/wrangler.jsonc \
        apps/builds-api/.dev.vars.example apps/data-proxy/.dev.vars.example \
        apps/web/.dev.vars.example \
        .gitignore
git commit -m "chore(dev): pin wrangler dev ports + .dev.vars convention

data-proxy pinned to :8787, builds-api pinned to :8788 (matches Vite
proxy config). OG_FIXTURE_* env vars moved from prod wrangler.jsonc
into builds-api/.dev.vars.example — they're dev-only fixture hooks
and shouldn't ship with the deployed Worker config.

Three .dev.vars.example templates added; .dev.vars is now gitignored
globally."
```

---

## Phase C — Seed-build helper

### Task 4: Add tsx devDep, scripts scaffolding, and fixture

**Files:**

- Create: `scripts/fixtures/build-m4a1.json`
- Modify: `package.json` (root) — add `tsx` devDep, `seed:build` script

- [ ] **Step 1: Add tsx as a root devDep**

```bash
pnpm add -Dw tsx@^4
```

Expected: `package.json` gains `"tsx": "^4.x.y"` under `devDependencies`; `pnpm-lock.yaml` updates. Version should be `^4.21.0` or newer (already present transitively).

- [ ] **Step 2: Add `seed:build` script to root package.json**

Edit `package.json` `scripts` block. Current:

```json
"scripts": {
  "build": "turbo run build",
  "commitlint": "commitlint --edit",
  "dev": "turbo run dev",
  "test": "turbo run test",
  "typecheck": "turbo run typecheck",
  "lint": "turbo run lint",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "prepare": "husky"
}
```

Add `"seed:build": "tsx scripts/seed-local-build.ts"` between `prepare` and the closing brace (alphabetical placement isn't enforced elsewhere; keep it next to `dev` for discoverability):

```json
"scripts": {
  "build": "turbo run build",
  "commitlint": "commitlint --edit",
  "dev": "turbo run dev",
  "seed:build": "tsx scripts/seed-local-build.ts",
  "test": "turbo run test",
  "typecheck": "turbo run typecheck",
  "lint": "turbo run lint",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "prepare": "husky"
}
```

- [ ] **Step 3: Create the fixtures directory and M4A1 fixture**

First, determine the exact schema shape. Read the current `Build` zod schema:

```bash
cat packages/tarkov-data/src/build-schema.ts
```

The fixture must match the `Build` export (the discriminated union on `schemaVersion`). Current is v4 — include `schemaVersion: 4`, `weaponId`, `slotAssignments`, any optional fields the schema allows (`name`, `description`, `profile`, etc.).

Create `scripts/fixtures/build-m4a1.json`. Use a realistic-looking M4A1 loadout with a handful of slot assignments. Example skeleton (fill in real item IDs from `apps/web/src/features/landing-hero.tsx` or wherever the landing sample lives — grep for "M4A1" in apps/web/src/ first):

```json
{
  "schemaVersion": 4,
  "weaponId": "5447a9cd4bdc2dbd208b4567",
  "name": "M4A1 — seed build",
  "description": "Local dev fixture. Regenerate via `pnpm seed:build`.",
  "slotAssignments": {
    "mod_pistol_grip": "55d4b9964bdc2d1d4e8b456e",
    "mod_stock": "5c0faeddd174af02a962601f"
  }
}
```

IMPORTANT: Before committing, run this inline validation to confirm the fixture parses against the schema:

```bash
pnpm --filter @tarkov/data build
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { Build } from './packages/tarkov-data/dist/build-schema.js';
const fixture = JSON.parse(readFileSync('scripts/fixtures/build-m4a1.json', 'utf-8'));
const result = Build.safeParse(fixture);
if (!result.success) {
  console.error('FIXTURE INVALID:', JSON.stringify(result.error.issues, null, 2));
  process.exit(1);
}
console.log('fixture validates OK');
"
```

Expected: `fixture validates OK`. If it fails, adjust the fixture to match the schema (the error output tells you exactly which field is off). Do not proceed until this passes.

### Task 5: Write the seed script

**Files:**

- Create: `scripts/seed-local-build.ts`

- [ ] **Step 1: Write `scripts/seed-local-build.ts`**

```ts
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

import { Build } from "@tarkov/data";

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
```

Note: The script imports from `@tarkov/data`. This works because pnpm workspaces make workspace packages resolvable from the root. No path alias or tsconfig edit needed.

- [ ] **Step 2: Verify tsx can resolve the workspace import**

```bash
pnpm --filter @tarkov/data build
pnpm exec tsx --eval "import('@tarkov/data').then(m => console.log(Object.keys(m).sort()))"
```

Expected: an array of exports that includes `"Build"`. If `Build` is missing, check `packages/tarkov-data/src/index.ts` for the export statement; don't proceed until the import works.

- [ ] **Step 3: Dry-run the seed script (expect connection failure)**

```bash
pnpm seed:build
```

Expected with NO local builds-api running: the script prints

```
✗ POST http://localhost:8788/builds failed to connect.
Is the builds-api Worker running? ...
```

and exits non-zero. This confirms the error-path handling works.

- [ ] **Step 4: Start builds-api and re-run**

In a separate terminal:

```bash
pnpm --filter @tarkov/builds-api dev
```

Wait for `Ready on http://localhost:8788`. Then in the original terminal:

```bash
pnpm seed:build
```

Expected output:

```
✓ seeded build: abc12345
  share URL:    http://localhost:5173/builder/abc12345
  compare URL:  http://localhost:5173/builder/compare

Open the share URL in the browser that's running `pnpm dev` (Vite on :5173).
```

The `id` will be an 8-char nanoid; shape may differ. Kill the builds-api terminal (Ctrl-C) after verifying.

- [ ] **Step 5: Run lint/format/typecheck on the new script**

```bash
pnpm lint
pnpm format:check
pnpm typecheck
```

Expected: all pass. If `lint` flags the script (e.g., because `scripts/` isn't covered by an ESLint `files` pattern), the fix is to add `scripts/**/*.ts` to the root eslint config's file patterns, or — preferred — leave the script outside the ESLint scope (it's a build-side utility, not app code). Check the current `eslint.config.js` and decide. A single `// eslint-disable-file` at the top of the script is NOT acceptable; either include scripts in the lint scope or exclude cleanly.

- [ ] **Step 6: Commit Phase C**

```bash
git add package.json pnpm-lock.yaml \
        scripts/seed-local-build.ts scripts/fixtures/build-m4a1.json
git commit -m "chore(dev): seed-build helper + M4A1 fixture

New \`pnpm seed:build\` script: POSTs a zod-validated M4A1 fixture to
the local builds-api Worker at :8788 and prints the /builder/:id
share URL. Fails loudly with a diagnostic if the fixture drifts out
of sync with the current Build schema.

Unblocks local iteration on features that exercise /builder/:id
(Arcs 1 & 2) without push-and-pray."
```

---

## Phase D — Runbook + CLAUDE.md cross-links

### Task 6: Write `docs/operations/local-development.md`

**Files:**

- Create: `docs/operations/local-development.md`

- [ ] **Step 1: Write the runbook**

Full content:

````markdown
# Local development

How to run the full TarkovGunsmith stack on your machine and how to manage env vars / secrets for both local dev and production.

## Quick start — fresh clone

```bash
git clone https://github.com/UnderMyBed/TarkovGunsmith.git
cd TarkovGunsmith
pnpm install

# Copy .dev.vars templates (see "Secrets & env vars" below for what each file does)
cp apps/builds-api/.dev.vars.example apps/builds-api/.dev.vars
cp apps/data-proxy/.dev.vars.example apps/data-proxy/.dev.vars
cp apps/web/.dev.vars.example apps/web/.dev.vars

pnpm dev        # starts web + both workers in one terminal

# In a second terminal:
pnpm seed:build # POSTs a fixture build to local builds-api; prints the share URL
```

Open the printed share URL (`http://localhost:5173/builder/<id>`) to confirm the full save/load round-trip works.

## What runs where

| Service                    | Port             | Started by                            | Notes                                                                                                                                            |
| -------------------------- | ---------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web` (Vite)          | `5173`           | `pnpm dev`                            | SPA. Proxies `/api/data/*` → `:8787`, `/api/builds/*` → `:8788`.                                                                                 |
| `apps/data-proxy`          | `8787`           | `pnpm dev`                            | GraphQL cache in front of `api.tarkov.dev`.                                                                                                      |
| `apps/builds-api`          | `8788`           | `pnpm dev`                            | KV-backed build save/load.                                                                                                                       |
| `apps/web` Pages Functions | `8789` (default) | `pnpm --filter @tarkov/web pages:dev` | Power-user escape hatch — needed to exercise `/og/build/:id`, `/og/pair/:pairId`, and `/functions/api/builds/*` locally. Not part of `pnpm dev`. |

Ports are pinned in each app's `wrangler.jsonc` (`dev.port`) + `apps/web/vite.config.ts`. If you hit "port already in use," see "Troubleshooting" below.

## Secrets & env vars

Wrangler reads `.dev.vars` automatically during `wrangler dev` (Workers) and `wrangler pages dev` (Pages Functions). Values there override `wrangler.jsonc`'s `vars` block for the local dev session only.

### Committed templates (copy to `.dev.vars` to activate)

| File                                | Variable               | Purpose                                                                                         |
| ----------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/builds-api/.dev.vars.example` | `OG_FIXTURE_BUILD_ID`  | Set to a seeded build id to unlock `/og/build/:id` rendering in `wrangler pages dev`.           |
| `apps/builds-api/.dev.vars.example` | `OG_FIXTURE_PAIR_ID`   | Same, for pair OG cards.                                                                        |
| `apps/data-proxy/.dev.vars.example` | `UPSTREAM_GRAPHQL_URL` | Override the GraphQL endpoint (default `https://api.tarkov.dev/graphql`).                       |
| `apps/web/.dev.vars.example`        | `BUILDS_API_URL`       | Must be `http://localhost:8788` for Pages Functions `/api/builds/*` to proxy correctly locally. |

### Production secrets (set via wrangler, NOT committed)

| Variable         | Set via                                                                                                      | Used by                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `BUILDS_API_URL` | `pnpm --filter @tarkov/web exec wrangler pages secret put BUILDS_API_URL --project-name tarkov-gunsmith-web` | `apps/web/functions/api/builds/[[path]].ts` |

**This is the one prod-only secret the runbook covers explicitly.** Without it, the production `/builder` save/load endpoint returns 500. To set it:

```bash
pnpm --filter @tarkov/web exec wrangler pages secret put BUILDS_API_URL --project-name tarkov-gunsmith-web
# Paste the production builds-api URL when prompted, e.g.:
# https://tarkov-gunsmith-builds-api.<your-subdomain>.workers.dev
```

Verify:

```bash
pnpm --filter @tarkov/web exec wrangler pages secret list --project-name tarkov-gunsmith-web
# Expected: BUILDS_API_URL appears in the list.
```

Rotate by running `wrangler pages secret put` again with a new value; the old value is overwritten atomically.

## Exercising save/load locally

The `pnpm seed:build` helper (see `scripts/seed-local-build.ts`) is the fastest path. It POSTs a zod-validated M4A1 fixture to `http://localhost:8788/builds` and prints:

```
✓ seeded build: abc12345
  share URL:    http://localhost:5173/builder/abc12345
  compare URL:  http://localhost:5173/builder/compare
```

If the fixture ever drifts from the current `Build` schema in `@tarkov/data`, the script fails loudly with the zod parse issues — update `scripts/fixtures/build-m4a1.json` to match.

For ad-hoc testing, POST directly:

```bash
curl -X POST http://localhost:8788/builds \
  -H 'content-type: application/json' \
  -d '{"schemaVersion":4,"weaponId":"...","slotAssignments":{}}'
# → {"id":"abc12345","url":"/builds/abc12345"}
```

## Exercising OG cards locally

The Pages Functions emulator is a separate process from `pnpm dev`:

```bash
# Terminal 1: seed a build and remember the id
pnpm --filter @tarkov/builds-api dev
pnpm seed:build   # copy the printed id

# Terminal 2: put that id into apps/builds-api/.dev.vars
echo "OG_FIXTURE_BUILD_ID=<paste-id-here>" >> apps/builds-api/.dev.vars
# (leave the OG_FIXTURE_PAIR_ID line too)

# Terminal 3: run the Pages emulator
pnpm --filter @tarkov/web build
pnpm --filter @tarkov/web pages:dev

# Visit http://localhost:8789/og/build/<id>
```

The Pages emulator reads `apps/web/.dev.vars` (for `BUILDS_API_URL`) and speaks to the builds-api Worker on :8788.

## Troubleshooting

- **"Port 8787 already in use"** — another wrangler instance is running. Find it with `lsof -i :8787` (macOS/Linux) or `netstat -ano | findstr 8787` (Windows) and kill it. Or restart `pnpm dev` after making sure no stray `wrangler dev` terminals are open.
- **`.dev.vars` changes not taking effect** — wrangler only reads `.dev.vars` at startup. Kill the dev server (Ctrl-C) and `pnpm dev` again.
- **Stale KV state in builds-api** — KV is simulated locally in `apps/builds-api/.wrangler/state/`. To reset:
  ```bash
  rm -rf apps/builds-api/.wrangler/state
  ```
- **`pnpm seed:build` fixture validation fails** — the Build schema changed. Update `scripts/fixtures/build-m4a1.json` to match `packages/tarkov-data/src/build-schema.ts`. The error output names the exact field that's off.
- **Fresh-install issues after pulling main** — `pnpm install --frozen-lockfile` from the repo root; if that complains, delete the root `node_modules` and retry.
- **Pages Functions return 500 on `pages:dev`** — `apps/web/.dev.vars` is missing or doesn't have `BUILDS_API_URL=http://localhost:8788`. Copy from `.dev.vars.example`.

## Deeper references

- Full deploy runbook (tokens, KV setup, Pages project): [`docs/operations/cloudflare-deploys.md`](./cloudflare-deploys.md)
- Per-app local-dev notes: [`apps/builds-api/CLAUDE.md`](../../apps/builds-api/CLAUDE.md), [`apps/data-proxy/CLAUDE.md`](../../apps/data-proxy/CLAUDE.md), [`apps/web/CLAUDE.md`](../../apps/web/CLAUDE.md)
- Build schema: [`packages/tarkov-data/src/build-schema.ts`](../../packages/tarkov-data/src/build-schema.ts)
````

- [ ] **Step 2: Verify the runbook renders**

```bash
pnpm format:check docs/operations/local-development.md
```

Expected: passes (or `pnpm format` cleans it up). Open in your preferred Markdown previewer to eyeball the tables.

### Task 7: Update CLAUDE.md files

**Files:**

- Modify: `apps/builds-api/CLAUDE.md`
- Modify: `apps/data-proxy/CLAUDE.md`
- Modify: `apps/web/CLAUDE.md`
- Modify: `CLAUDE.md` (root)

- [ ] **Step 1: Update `apps/builds-api/CLAUDE.md`**

Find the "## Local dev" section. Current:

````markdown
## Local dev

```bash
pnpm --filter @tarkov/builds-api dev    # wrangler dev → http://localhost:8787 (real KV simulated)
pnpm --filter @tarkov/builds-api test   # vitest in workerd, real KV per test
pnpm --filter @tarkov/builds-api build  # wrangler --dry-run --outdir dist
```

`wrangler dev` simulates the `BUILDS` KV namespace locally; values persist in `.wrangler/state/`.
````

Replace with:

````markdown
## Local dev

```bash
pnpm --filter @tarkov/builds-api dev    # wrangler dev → http://localhost:8788 (real KV simulated)
pnpm --filter @tarkov/builds-api test   # vitest in workerd, real KV per test
pnpm --filter @tarkov/builds-api build  # wrangler --dry-run --outdir dist
```

`wrangler dev` simulates the `BUILDS` KV namespace locally; values persist in `.wrangler/state/`.

Copy `.dev.vars.example` → `.dev.vars` to override env vars for local runs (e.g. `OG_FIXTURE_BUILD_ID` for OG-card local testing).

Full local-dev workflow (full stack in one terminal, seed-build helper, troubleshooting): [`docs/operations/local-development.md`](../../docs/operations/local-development.md).
````

Note the port bump `:8787 → :8788` — this CLAUDE.md had the wrong port before (historical artifact from when data-proxy wasn't yet pinned).

- [ ] **Step 2: Update `apps/data-proxy/CLAUDE.md`**

Find the "## Local dev" section. Current:

````markdown
## Local dev

```bash
pnpm --filter @tarkov/data-proxy dev    # wrangler dev → http://localhost:8787
pnpm --filter @tarkov/data-proxy test   # vitest in workerd, real Cache API
pnpm --filter @tarkov/data-proxy build  # wrangler --dry-run --outdir dist (no deploy)
```

`wrangler dev` simulates Cache API + bindings locally; state persists in `.wrangler/state/`. Use `wrangler dev --remote` to test against real Cloudflare resources before a production deploy.
````

Replace with:

````markdown
## Local dev

```bash
pnpm --filter @tarkov/data-proxy dev    # wrangler dev → http://localhost:8787
pnpm --filter @tarkov/data-proxy test   # vitest in workerd, real Cache API
pnpm --filter @tarkov/data-proxy build  # wrangler --dry-run --outdir dist (no deploy)
```

`wrangler dev` simulates Cache API + bindings locally; state persists in `.wrangler/state/`. Use `wrangler dev --remote` to test against real Cloudflare resources before a production deploy.

Copy `.dev.vars.example` → `.dev.vars` to override `UPSTREAM_GRAPHQL_URL` for local staging-swap experiments.

Full local-dev workflow: [`docs/operations/local-development.md`](../../docs/operations/local-development.md).
````

- [ ] **Step 3: Update `apps/web/CLAUDE.md`**

Find the "### Env vars on Cloudflare Pages" subsection. Current:

```markdown
### Env vars on Cloudflare Pages

- `BUILDS_API_URL` (required in production) — URL of the `apps/builds-api` Worker (e.g. `https://tarkov-gunsmith-builds-api.<subdomain>.workers.dev`). Used by `apps/web/functions/api/builds/[[path]].ts` to proxy build save/load requests same-origin.

Set via `wrangler pages secret put BUILDS_API_URL --project-name tarkov-gunsmith-web` or via the Cloudflare dashboard. The Pages deploy action does not set this automatically — if the var is missing, the Pages Function returns a 500.
```

Replace with:

```markdown
### Env vars on Cloudflare Pages

- `BUILDS_API_URL` (required in production) — URL of the `apps/builds-api` Worker (e.g. `https://tarkov-gunsmith-builds-api.<subdomain>.workers.dev`). Used by `apps/web/functions/api/builds/[[path]].ts` to proxy build save/load requests same-origin.
- Locally, set `BUILDS_API_URL=http://localhost:8788` in `apps/web/.dev.vars` (copy from `.dev.vars.example`) so `wrangler pages dev` can exercise the Pages Functions.

Production setup + verification + rotation commands live in [`docs/operations/local-development.md`](../../docs/operations/local-development.md#production-secrets-set-via-wrangler-not-committed).
```

- [ ] **Step 4: Update root `CLAUDE.md`**

Two edits:

**Edit 4a** — Remove the "Production action still open" callout inside the status blockquote. Find this line:

```markdown
> **Production action still open:** `wrangler pages secret put BUILDS_API_URL --project-name tarkov-gunsmith-web` — without this, `/builder` save/load returns 500 in prod.
```

Delete it and the blank blockquote line above it (if any). The runbook now owns this instruction.

**Edit 4b** — Add a "Local development" section. Find the existing `## Local development` heading. Current block:

````markdown
## Local development

```bash
pnpm install          # install everything
pnpm typecheck        # tsc across all packages
pnpm lint             # eslint across all packages
pnpm format:check     # prettier check
pnpm test             # vitest across all packages
pnpm format           # auto-format
echo "feat: foo" | pnpm exec commitlint --stdin-only  # test a commit message
```
````

Append, immediately after the closing ``` fence:

````markdown
### Running the full stack locally

```bash
pnpm dev              # turbo fan-out → web (5173) + data-proxy (8787) + builds-api (8788)
pnpm seed:build       # POST a fixture build to local builds-api; prints /builder/:id URL
```

Fresh-clone setup, `.dev.vars` conventions, OG-card local testing, and the production secret runbook all live in [`docs/operations/local-development.md`](docs/operations/local-development.md).
````

- [ ] **Step 5: Verify all four files parse**

```bash
pnpm format:check
```

Expected: passes (or format auto-fixes). If Prettier rewrites anything in these files, run `pnpm format` and inspect the diff.

- [ ] **Step 6: Commit Phase D**

```bash
git add docs/operations/local-development.md \
        apps/builds-api/CLAUDE.md apps/data-proxy/CLAUDE.md apps/web/CLAUDE.md \
        CLAUDE.md
git commit -m "docs(ops): local-development runbook + CLAUDE.md cross-links

New docs/operations/local-development.md covers fresh-clone setup,
port map, .dev.vars convention, seed:build workflow, OG-card local
testing, and the BUILDS_API_URL production-secret command that has
been outstanding since OG cards shipped.

All four CLAUDE.md files (three app-level + root) now cross-link the
runbook instead of carrying duplicated snippets."
```

---

## Phase E — End-to-end smoke + open PR

### Task 8: Full fresh-start smoke

**Files:** (none — verification only)

- [ ] **Step 1: Clean state**

```bash
# From repo root
rm -rf node_modules apps/*/node_modules packages/*/node_modules
rm -rf apps/*/.wrangler
rm -f apps/*/.dev.vars
```

- [ ] **Step 2: Simulate a fresh clone**

```bash
pnpm install --frozen-lockfile
cp apps/builds-api/.dev.vars.example apps/builds-api/.dev.vars
cp apps/data-proxy/.dev.vars.example apps/data-proxy/.dev.vars
cp apps/web/.dev.vars.example apps/web/.dev.vars
```

Expected: `pnpm install` completes without errors.

- [ ] **Step 3: Boot full stack**

```bash
pnpm dev
```

Wait ~20s for all three processes to log "Ready" / listening messages. Expected in the streamed output:

- `@tarkov/web` — Vite ready, `Local: http://localhost:5173/`
- `@tarkov/data-proxy` — `Ready on http://localhost:8787`
- `@tarkov/builds-api` — `Ready on http://localhost:8788`

Leave this terminal running.

- [ ] **Step 4: Seed a build from a second terminal**

```bash
cd ~/TarkovGunsmith  # or your repo root
pnpm seed:build
```

Expected: prints `✓ seeded build: <id>` and the two URLs. Note the id.

- [ ] **Step 5: Load the share URL in a browser**

Open `http://localhost:5173/builder/<id>`. Expected: the `/builder` route loads, the M4A1 fixture build renders with no console errors related to save/load.

- [ ] **Step 6: Kill `pnpm dev`**

Ctrl-C the first terminal. Expected: all three child processes shut down cleanly.

- [ ] **Step 7: Final CI-parity check**

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

Expected: all pass.

### Task 9: Push and open the PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/m3.5-arc-0-local-dev
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "feat(ops): M3.5 Arc 0 — local dev tooling + runbook" --body "$(cat <<'EOF'
## Summary

First arc of M3.5 "Depth & Polish." Closes the local-dev friction that
would otherwise bite us across Arcs 1/2/4:

- Pin wrangler dev ports (data-proxy :8787, builds-api :8788) so both
  Workers can run concurrently under \`pnpm dev\`
- Ship \`.dev.vars.example\` templates for all three apps; \`.dev.vars\`
  is now gitignored globally
- New \`pnpm seed:build\` helper — POSTs a zod-validated M4A1 fixture to
  local builds-api and prints the share URL (unblocks \`/builder/:id\`
  iteration without push-and-pray)
- New \`docs/operations/local-development.md\` covering fresh-clone
  quickstart, port map, secrets/env runbook (including the outstanding
  \`BUILDS_API_URL\` Pages secret command), seed-build workflow,
  OG-card local testing, and troubleshooting
- CLAUDE.md cross-links across all three apps + root

## Spec + plan

- Spec: \`docs/superpowers/specs/2026-04-21-local-dev-tooling-design.md\`
- Plan: \`docs/plans/2026-04-21-arc-0-local-dev-tooling-plan.md\`

## Test plan

- [x] \`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test\` pass locally
- [x] Fresh-clone smoke: \`pnpm install\` → copy \`.dev.vars.example\` → \`pnpm dev\` → \`pnpm seed:build\` → load share URL → round-trip works
- [x] OG_FIXTURE_* removal from \`apps/builds-api/wrangler.jsonc\` doesn't break existing OG-cards tests (they set their own env in the test harness)
- [ ] Verify CI green on the PR check
EOF
)"
```

- [ ] **Step 3: Wait for CI and admin-merge**

```bash
gh pr checks --watch
# When green:
gh pr merge --squash --admin
```

- [ ] **Step 4: Post-merge cleanup**

```bash
git checkout main
git fetch --prune origin
git branch -D feat/m3.5-arc-0-local-dev
```

Note: `release-please` will open (or update) its chore PR automatically with the `chore(dev):` and `docs(ops):` entries. No version bump expected — these commit types don't trigger one.

---

## Self-review checklist

Before handing off to execution, the author reran this list:

1. **Spec coverage** — every design section has a task:
   - Spec §1 (port pinning) → Task 2 steps 1-4
   - Spec §2 (.dev.vars convention) → Task 3 steps 1-5
   - Spec §3 (pnpm dev) → Task 1 step 3 (baseline) + Task 8 step 3 (e2e)
   - Spec §4 (seed helper) → Tasks 4 + 5
   - Spec §5 (runbook) → Task 6
   - Spec §6 (CLAUDE.md updates) → Task 7
   - Spec "Rollout" → Task 9
   - Spec "Testing" → Tasks 2/3/5/8 verification steps
2. **Placeholder scan** — no "TBD", "TODO", or "similar to…" references; every code block is the complete content the engineer writes.
3. **Type consistency** — the script uses `Build` from `@tarkov/data`; the fixture at `scripts/fixtures/build-m4a1.json` is validated against that same export. No mismatched names.
4. **Ambiguity** — one resolved inline: the eslint coverage of `scripts/**/*.ts` is an explicit decision point in Task 5 Step 5 rather than left ambiguous.
