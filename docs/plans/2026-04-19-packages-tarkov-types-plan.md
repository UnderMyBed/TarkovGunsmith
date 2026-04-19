# `packages/tarkov-types` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `packages/tarkov-types` — a workspace package that publishes generated TypeScript types from the `api.tarkov.dev` GraphQL schema. Consumed by `packages/tarkov-data` (next plan) and any other code that needs the upstream type surface.

**Architecture:** Use `graphql-codegen` to convert the live schema into TS. Generated files are **committed to the repo** so builds never depend on the upstream API being reachable; refreshing the schema is an explicit developer/automation action via `pnpm codegen:refresh`. Zod runtime schemas live in `packages/tarkov-data` (next to each query); this package is type-only.

**Tech Stack:** TypeScript 6, GraphQL 16, `@graphql-codegen/cli` v5, `@graphql-codegen/typescript`, `@graphql-codegen/schema-ast`. No Vitest (tests live in consumers).

---

## File map (what exists at the end of this plan)

```
packages/tarkov-types/
├── CLAUDE.md                       Per-package agent guide
├── README.md                       Brief usage example
├── package.json                    @tarkov/types, scripts: build, lint, typecheck, codegen, codegen:refresh
├── tsconfig.json                   Extends ../../tsconfig.base.json
├── tsconfig.test.json              For ESLint projectService (no tests yet, kept for forward compat)
├── codegen.ts                      graphql-codegen config (TypeScript form)
└── src/
    ├── index.ts                    Public barrel: re-export everything from generated
    └── generated/
        ├── schema.graphql          Cached SDL (source of truth for codegen)
        └── types.ts                Generated TypeScript types (do not edit by hand)
```

`packages/tarkov-types` exposes ONLY type-only surface — there is no runtime code.

---

## Phase 1: Package skeleton

### Task 1: Scaffold `packages/tarkov-types/` and `package.json`

**Files:**

- Create: `packages/tarkov-types/package.json`

- [ ] **Step 1: Create the directory and `package.json`**

```bash
mkdir -p packages/tarkov-types/src/generated
```

Create `packages/tarkov-types/package.json` with EXACTLY this content:

```json
{
  "name": "@tarkov/types",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Generated TypeScript types for the api.tarkov.dev GraphQL schema. Type-only; no runtime code. Refresh with `pnpm codegen:refresh`.",
  "license": "MIT",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint . --max-warnings 0",
    "codegen": "graphql-codegen --config codegen.ts",
    "codegen:refresh": "SCHEMA_REFRESH=1 graphql-codegen --config codegen.ts"
  },
  "dependencies": {
    "graphql": "^16.0.0"
  },
  "devDependencies": {
    "@graphql-codegen/cli": "^5.0.0",
    "@graphql-codegen/typescript": "^4.0.0",
    "@graphql-codegen/schema-ast": "^4.0.0",
    "@parcel/watcher": "^2.0.0"
  }
}
```

The `@parcel/watcher` is a peer used by `@graphql-codegen/cli` for the `--watch` mode; declaring it explicitly avoids an install warning.

- [ ] **Step 2: Verify the workspace picks it up**

```bash
pnpm install
```

Expected: pnpm reports new package, installs deps, no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/tarkov-types/package.json pnpm-lock.yaml
git commit -m "feat(types): scaffold @tarkov/types package"
```

---

### Task 2: TypeScript configs

**Files:**

- Create: `packages/tarkov-types/tsconfig.json`
- Create: `packages/tarkov-types/tsconfig.test.json`

- [ ] **Step 1: Create `packages/tarkov-types/tsconfig.json`** with EXACTLY:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "tsBuildInfoFile": ".tsbuildinfo"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "**/*.test.ts"]
}
```

- [ ] **Step 2: Create `packages/tarkov-types/tsconfig.test.json`** with EXACTLY:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": "."
  },
  "include": ["src/**/*", "codegen.ts"],
  "exclude": ["dist", "node_modules"]
}
```

This is the variant ESLint's `projectService` uses to type-check files outside `src/` (like `codegen.ts`).

- [ ] **Step 3: Update root `eslint.config.js`** to include this package's test files in `allowDefaultProject`

The root `eslint.config.js` already has `allowDefaultProject` for `packages/*/vitest.config.ts` and `packages/ballistics` test files. Inspect the current state:

```bash
cat eslint.config.js
```

Add `"packages/tarkov-types/codegen.ts"` to the `allowDefaultProject` array. Keep all existing entries. The block should look approximately:

```js
projectService: {
  allowDefaultProject: [
    "packages/*/vitest.config.ts",
    "packages/ballistics/src/*/*.test.ts",
    "packages/ballistics/src/*.test.ts",
    "packages/tarkov-types/codegen.ts",
  ],
  maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 20,
},
```

(Use `Read` first to see the existing structure, then `Edit` minimally.)

- [ ] **Step 4: Verify typecheck on the empty package fails clean**

```bash
pnpm --filter @tarkov/types typecheck
```

Expected: `error TS18003: No inputs were found in config file` because `src/` is empty until Task 4. That's expected.

- [ ] **Step 5: Commit**

```bash
git add packages/tarkov-types/tsconfig.json packages/tarkov-types/tsconfig.test.json eslint.config.js
git commit -m "feat(types): add tsconfig and eslint allowDefaultProject entry"
```

---

### Task 3: graphql-codegen config

**Files:**

- Create: `packages/tarkov-types/codegen.ts`

- [ ] **Step 1: Create `packages/tarkov-types/codegen.ts`** with EXACTLY:

```ts
import type { CodegenConfig } from "@graphql-codegen/cli";

const REFRESH = process.env.SCHEMA_REFRESH === "1";

const config: CodegenConfig = {
  schema: REFRESH ? "https://api.tarkov.dev/graphql" : "./src/generated/schema.graphql",
  documents: [],
  generates: {
    "./src/generated/schema.graphql": {
      plugins: ["schema-ast"],
      config: {
        includeDirectives: true,
      },
    },
    "./src/generated/types.ts": {
      plugins: ["typescript"],
      config: {
        useTypeImports: true,
        skipTypename: true,
        enumsAsTypes: true,
        avoidOptionals: false,
        scalars: {
          DateTime: "string",
          ID: "string",
        },
      },
    },
  },
  hooks: {
    afterAllFileWrite: ["prettier --write"],
  },
};

export default config;
```

The `SCHEMA_REFRESH=1` env var swaps the schema source from the local cached SDL to the live API. Default operation uses the local cache, so builds never depend on the upstream being reachable.

- [ ] **Step 2: Verify lint passes on this file**

```bash
pnpm exec eslint packages/tarkov-types/codegen.ts --max-warnings 0
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/tarkov-types/codegen.ts
git commit -m "feat(types): add graphql-codegen config"
```

---

### Task 4: Per-package `CLAUDE.md` and `README.md`

**Files:**

- Create: `packages/tarkov-types/CLAUDE.md`
- Create: `packages/tarkov-types/README.md`

- [ ] **Step 1: Create `packages/tarkov-types/CLAUDE.md`** with EXACTLY:

```markdown
# `@tarkov/types`

Generated TypeScript types for the [api.tarkov.dev](https://api.tarkov.dev) GraphQL schema. Type-only — no runtime code.

## What's in this package

- `src/generated/schema.graphql` — the cached upstream schema (source of truth for codegen)
- `src/generated/types.ts` — generated TS types from the cached schema
- `src/index.ts` — public barrel that re-exports the generated types

## How codegen works

- **Default:** `pnpm --filter @tarkov/types codegen` reads the local cached schema and regenerates types. Builds never depend on the upstream being reachable.
- **Refresh:** `pnpm --filter @tarkov/types codegen:refresh` fetches the latest schema from the live API, writes it to `src/generated/schema.graphql`, then regenerates types.

Both modes auto-format the output with Prettier.

## Conventions

- **Never edit `src/generated/` by hand.** Anything you touch will be lost on the next codegen.
- **Always commit generated files.** Builds use them as-is.
- **Refresh on demand.** Schema drift is detected by re-running `codegen:refresh` and inspecting the diff. The Tier C cron will automate this later.
- **Zod runtime schemas live elsewhere** — in `packages/tarkov-data`, next to each query. This package is type-only.

## How to add a new field

You don't. Upstream owns the schema. To pick up a new field:

1. `pnpm --filter @tarkov/types codegen:refresh`
2. Inspect the diff in `src/generated/`
3. Commit it
4. Update consumers in `packages/tarkov-data` to query the new field

## Out of scope

- Runtime data fetching (that's `@tarkov/data`)
- Zod schemas (also `@tarkov/data`, per query)
- The data layer's TanStack Query hooks
```

- [ ] **Step 2: Create `packages/tarkov-types/README.md`** with EXACTLY:

````markdown
# @tarkov/types

Generated TypeScript types for the api.tarkov.dev GraphQL schema.

## Use

```ts
import type { Item, Weapon, Ammo } from "@tarkov/types";

function pickBestAmmo(ammo: readonly Ammo[]): Ammo | undefined {
  return ammo.find((a) => a.penetrationPower > 50);
}
```

## Refresh schema

```bash
pnpm --filter @tarkov/types codegen:refresh
```

See [`CLAUDE.md`](./CLAUDE.md) for conventions.
````

- [ ] **Step 3: Commit**

```bash
git add packages/tarkov-types/CLAUDE.md packages/tarkov-types/README.md
git commit -m "docs(types): add per-package CLAUDE.md and README"
```

---

## Phase 2: Generation + barrel

### Task 5: Initial schema fetch + codegen

**Files:**

- Create (via codegen): `packages/tarkov-types/src/generated/schema.graphql`
- Create (via codegen): `packages/tarkov-types/src/generated/types.ts`

- [ ] **Step 1: Run the refresh codegen to fetch the live schema and generate types**

```bash
pnpm --filter @tarkov/types codegen:refresh
```

Expected: codegen prints status lines, fetches the schema from `api.tarkov.dev/graphql`, writes `src/generated/schema.graphql` and `src/generated/types.ts`, then runs Prettier on them. Exit 0.

If the network is down or the API rejects introspection, the command fails with a clear error. In that case, BLOCK and report — do not invent a schema.

- [ ] **Step 2: Verify the generated files exist and are non-empty**

```bash
ls -la packages/tarkov-types/src/generated/
wc -l packages/tarkov-types/src/generated/types.ts
```

Expected: both files present; `types.ts` has at least 200 lines (the schema is substantial).

- [ ] **Step 3: Verify lint and typecheck pass on generated files**

```bash
pnpm --filter @tarkov/types typecheck
pnpm exec eslint packages/tarkov-types/src/generated --max-warnings 0
```

Expected: both exit 0.

If lint complains about generated code (likely about strict-typed-checked rules), add a `// eslint-disable` block at the top of `src/generated/types.ts` — but ONLY if the linter complains. Most generated `typescript` plugin output is clean.

- [ ] **Step 4: Verify Prettier**

```bash
pnpm exec prettier --check packages/tarkov-types/src/generated
```

Expected: exit 0 (codegen ran prettier in its `afterAllFileWrite` hook).

- [ ] **Step 5: Commit**

```bash
git add packages/tarkov-types/src/generated/
git commit -m "feat(types): generate initial types from api.tarkov.dev schema"
```

---

### Task 6: Public barrel

**Files:**

- Create: `packages/tarkov-types/src/index.ts`

- [ ] **Step 1: Create `packages/tarkov-types/src/index.ts`** with EXACTLY:

```ts
export type * from "./generated/types.js";
```

`export type *` re-exports every type while making it explicit (and tooling-friendly) that nothing runtime crosses the boundary.

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @tarkov/types typecheck
```

Expected: exit 0.

- [ ] **Step 3: Verify build produces `dist/`**

```bash
pnpm --filter @tarkov/types build
ls packages/tarkov-types/dist/
```

Expected: `dist/index.js`, `dist/index.d.ts`, `dist/generated/types.js`, `dist/generated/types.d.ts`. Build exit 0.

- [ ] **Step 4: Verify root gates still pass**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
```

Expected: all exit 0. `pnpm test` should still report only `@tarkov/ballistics` running tests (no tests in `tarkov-types`).

- [ ] **Step 5: Commit**

```bash
git add packages/tarkov-types/src/index.ts
git commit -m "feat(types): add public barrel"
```

---

## Phase 3: Verify + ship

### Task 7: Update root `CLAUDE.md`

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Status callout**

Find the existing line:

```markdown
> **Status:** Foundation + `packages/ballistics` shipped. ...
```

Replace with:

```markdown
> **Status:** Foundation + `packages/ballistics` + `packages/tarkov-types` shipped. Pure-TS math (100% coverage) and generated GraphQL type surface for `api.tarkov.dev` are live. Still pending: `packages/tarkov-data`, `packages/ui`, `apps/data-proxy`, `apps/builds-api`, `apps/web`. See [`docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md`](docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md) for the full design.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note packages/tarkov-types shipped in CLAUDE.md status"
```

---

### Task 8: Final verification

**Files:** none

- [ ] **Step 1: Clean install + all gates**

```bash
rm -rf node_modules packages/*/node_modules packages/*/dist packages/*/.tsbuildinfo
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

Expected: every step exits 0.

- [ ] **Step 2: Confirm package exports actually resolve**

From the worktree root:

```bash
node --input-type=module -e 'import("@tarkov/types").then(m => console.log(Object.keys(m)))'
```

Expected: `[]` (empty array — type-only re-export, no runtime exports). Exit 0.

If this errors, it means `dist/` is malformed; investigate and fix.

- [ ] **Step 3: No commit needed for verification.** If any step fails, fix the offending package and commit as `fix(types): <what>`.

---

### Task 9: Open PR + merge

**Files:** none

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/packages-tarkov-types
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --base main --head feat/packages-tarkov-types --title "feat(types): add @tarkov/types package" --body "Implements the second item on the dependency-tier path (0d.2). Generated TypeScript types from the api.tarkov.dev GraphQL schema, with cached SDL for offline-safe builds and an explicit refresh flow.

Type-only package; Zod runtime schemas live in @tarkov/data (next plan)."
```

Capture the PR number.

- [ ] **Step 3: Wait for CI green explicitly**

```bash
sleep 8
RUN_ID=$(gh run list --repo UnderMyBed/TarkovGunsmith --branch feat/packages-tarkov-types --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch $RUN_ID --repo UnderMyBed/TarkovGunsmith
gh run view $RUN_ID --repo UnderMyBed/TarkovGunsmith --json conclusion --jq '.conclusion'
```

Expected: `success`.

- [ ] **Step 4: Squash-merge**

```bash
gh pr merge <pr-number> --repo UnderMyBed/TarkovGunsmith --squash --delete-branch
```

- [ ] **Step 5: release-please opens v0.3.0 release PR**

After merge, release-please runs and opens `chore(main): release 0.3.0`. Manually trigger CI on its branch:

```bash
sleep 10
gh workflow run ci.yml --repo UnderMyBed/TarkovGunsmith \
  --ref release-please--branches--main--components--tarkov-gunsmith \
  --field ref=release-please--branches--main--components--tarkov-gunsmith
sleep 10
RUN_ID=$(gh run list --repo UnderMyBed/TarkovGunsmith --workflow ci.yml --branch release-please--branches--main--components--tarkov-gunsmith --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch $RUN_ID --repo UnderMyBed/TarkovGunsmith
gh run view $RUN_ID --repo UnderMyBed/TarkovGunsmith --json conclusion --jq '.conclusion'
```

Expected: `success`.

- [ ] **Step 6: Admin-merge the release PR**

The workflow_dispatch CI run doesn't satisfy branch protection's status check requirement (known limitation, documented in `CLAUDE.md`). Use admin merge:

```bash
gh pr merge <release-pr-number> --repo UnderMyBed/TarkovGunsmith --squash --delete-branch --admin
```

Expected: tag `v0.3.0` and GitHub Release created automatically.

- [ ] **Step 7: Cleanup worktree**

```bash
git switch main && git pull --ff-only
git worktree remove ~/.config/superpowers/worktrees/TarkovGunsmith/feat-packages-tarkov-types --force
git branch -D feat/packages-tarkov-types
git remote prune origin
```

---

## Done — what's true after this plan

- `packages/tarkov-types` exists at workspace version `0.0.0` (release-please tracks the repo version, currently `0.2.0` → `0.3.0`).
- Generated TS types committed under `src/generated/`.
- Cached schema at `src/generated/schema.graphql` is the source of truth for codegen; live API is only touched on explicit `codegen:refresh`.
- Repo released as `v0.3.0` via release-please.

## What's NOT true yet (intentionally deferred)

- No Zod runtime schemas (planned for `packages/tarkov-data`, next plan).
- No nightly schema-watcher cron (Tier C upgrade item).
- No tests in this package (typecheck + lint are the contract; consumers exercise the types).
- No client helpers (e.g., a configured `graphql-request` instance) — that lives in `packages/tarkov-data`.
