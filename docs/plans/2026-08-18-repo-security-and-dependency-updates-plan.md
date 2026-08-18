# Repo Security & Dependency Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring TarkovGunsmith from zero security tooling to upguage's four-layer posture — enforced toolchain pin, no workflow injection, a cleared dependency backlog, Dependabot, CodeQL, and a failure watcher that actually reaches a human.

**Architecture:** Five arcs, one PR each, in strict order. Arc T makes the repo runnable and creates `packages/repo-guards`, the home for every static-analysis test the later arcs add. Arc 0 fixes a live expression-injection hole and ships the guard that prevents its return. Arc 1 clears a measured 50-advisory backlog so Dependabot starts from a clean baseline. Arc 2 adds Dependabot, repo settings, and disclosure docs. Arc 3 adds CodeQL and the `workflow_run` watcher together, because a cron workflow without a watcher is red at nobody.

**Tech Stack:** mise (toolchain), pnpm 10 workspaces + Turborepo, TypeScript strict, Vitest, GitHub Actions, CodeQL, Dependabot, `gh` CLI.

**Spec:** [`docs/superpowers/specs/2026-08-18-repo-security-and-dependency-updates-design.md`](../superpowers/specs/2026-08-18-repo-security-and-dependency-updates-design.md)

## Global Constraints

- **Toolchain pins, all three must agree:** `mise.toml` `node = "22"`, `.nvmrc` = `22`, `mise.toml` `pnpm = "10.34.5"`, `package.json` `packageManager` = `pnpm@10.34.5`.
- **PATH:** every `pnpm` / `node` command below assumes mise shims are on `PATH` (Task 1, Step 5). If a command reports `pnpm: not found`, prefix it with `mise exec --`.
- **Never** place a `${{ }}` expression inside a workflow `run:` block. Route it through `env:` and reference it as a quoted shell variable. This is the bug Arc 0 fixes and Guard 3 enforces.
- **Every new package** needs its own `tsconfig.json` extending `tsconfig.base.json`, or `eslint --fix` fails with "was not found by the project service". Test files additionally need a glob in `eslint.config.js` under `parserOptions.projectService.allowDefaultProject`.
- **TypeScript:** `strict` + `noUncheckedIndexedAccess` — indexed access yields `T | undefined`, so regex capture groups need `!` or an explicit guard.
- **Imports:** relative imports carry a `.js` extension (`import { x } from "./y.js"`), matching every existing package.
- **Prettier:** `printWidth: 100`, `semi: true`, double quotes, `trailingComma: "all"`. Run `pnpm format` before committing if unsure.
- **Commits:** Conventional Commits, enforced by commitlint's `commit-msg` hook. Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `build`, `perf`, `style`, `revert`.
- **One arc, one branch, one PR.** Branch names are given per arc. Do not mix arcs.

---

## Arc T — Toolchain pin

**Branch:** `build/mise-toolchain-pin`

### Task 1: Pin the toolchain with mise

**Files:**

- Create: `mise.toml`
- Modify: `package.json` (`packageManager` field)

**Interfaces:**

- Consumes: nothing.
- Produces: a working `pnpm` on `PATH` at 10.34.5 and `node` at 22.x. Every later task depends on this.

- [x] **Step 1: Create `mise.toml`**

```toml
# Toolchain pin for this repo. mise reads this on `cd` into the directory.
#
# All three of these values are held together by tests in packages/repo-guards:
#   node  MUST equal .nvmrc                     (CI reads .nvmrc via actions/setup-node)
#   pnpm  MUST equal package.json packageManager
#
# CI deliberately still uses .nvmrc rather than jdx/mise-action — see the spec's
# "CI is deliberately left alone" note. If CI ever moves to mise, .nvmrc retires
# and Guard 1 goes with it.
[tools]
node = "22"
pnpm = "10.34.5"
```

- [x] **Step 2: Install the toolchain**

Run: `mise install`
Expected: mise downloads node 22.x and pnpm 10.34.5. Re-running prints "already installed".

- [x] **Step 3: Verify the pins resolve**

Run: `mise exec -- node -v && mise exec -- pnpm -v`
Expected: `v22.` prefix on the first line, `10.34.5` on the second.

- [x] **Step 4: Bump `packageManager` to match**

In `package.json`, change:

```json
  "packageManager": "pnpm@10.0.0",
```

to:

```json
  "packageManager": "pnpm@10.34.5",
```

- [x] **Step 5: Put mise shims on PATH so git hooks can find pnpm**

This is a machine change, not a repo change. Husky's `pre-commit` hook runs `pnpm` and inherits
`PATH` from whatever shell invoked `git commit`.

```bash
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc
echo 'export PATH="$HOME/.local/share/mise/shims:$PATH"' >> ~/.zprofile
```

Open a new shell, then run: `pnpm -v`
Expected: `10.34.5`, with no `mise exec` prefix needed.

- [x] **Step 6: Reinstall dependencies under the pinned pnpm**

Run: `pnpm install`
Expected: completes without an `ERR_PNPM_BAD_PM_VERSION` error. `pnpm-lock.yaml` should be
unchanged — if it is not, stop and inspect the diff before continuing.

- [x] **Step 7: Commit**

```bash
git add mise.toml package.json
git commit -m "build(toolchain): pin node + pnpm via mise

pnpm was not installed at all, corepack is gone (Node 26 dropped it),
and the global mise pin was missing. mise.toml makes the toolchain
explicit and reproducible; packageManager is bumped from 10.0.0 to
match it.

CI keeps reading .nvmrc this pass; mise-action parity is deferred."
```

### Task 2: Scaffold `packages/repo-guards` with the node-pin guard

**Files:**

- Create: `packages/repo-guards/package.json`
- Create: `packages/repo-guards/tsconfig.json`
- Create: `packages/repo-guards/vitest.config.ts`
- Create: `packages/repo-guards/src/repo.ts`
- Create: `packages/repo-guards/src/toolchain.test.ts`
- Modify: `eslint.config.js` (add the test glob)

**Interfaces:**

- Consumes: Task 1's `mise.toml`.
- Produces: `REPO_ROOT: string`, `readMiseTools(): Record<string, string>`, `readRepoFile(relPath: string): string` — all exported from `packages/repo-guards/src/repo.ts` and used by every later guard.

- [x] **Step 1: Create the package manifest**

`packages/repo-guards/package.json`:

```json
{
  "name": "@tarkov/repo-guards",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Static-analysis guards over repo configuration: toolchain pins, workflow safety, Dependabot coverage, and alert wiring. Tests only — nothing here ships.",
  "license": "MIT",
  "scripts": {
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint . --max-warnings 0",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "yaml": "^2.8.1"
  }
}
```

- [x] **Step 2: Create `packages/repo-guards/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

Note: unlike the other packages this one has no `outDir` and sets `noEmit` — nothing here is
built or imported by another package.

- [x] **Step 3: Create `packages/repo-guards/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

No coverage thresholds: this package is assertions about repo files, not shipped logic.

- [x] **Step 4: Create the shared helper `packages/repo-guards/src/repo.ts`**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Absolute path to the repository root, resolved from this file's location. */
export const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");

/** Read a repo-relative file as UTF-8 text. */
export function readRepoFile(relPath: string): string {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

/**
 * Parse the `[tools]` table out of mise.toml.
 *
 * A hand-rolled reader rather than a TOML dependency: mise.toml in this repo is a
 * single table of `key = "value"` lines, and the guard's whole job is to fail loudly
 * if that shape changes.
 */
export function readMiseTools(): Record<string, string> {
  const tools: Record<string, string> = {};
  let inTools = false;

  for (const line of readRepoFile("mise.toml").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed === "") continue;
    if (trimmed.startsWith("[")) {
      inTools = trimmed === "[tools]";
      continue;
    }
    if (!inTools) continue;
    const match = /^([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"/.exec(trimmed);
    if (match) tools[match[1]!] = match[2]!;
  }

  return tools;
}
```

- [x] **Step 5: Write the failing test `packages/repo-guards/src/toolchain.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { readMiseTools, readRepoFile } from "./repo.js";

describe("toolchain pins agree", () => {
  it("mise.toml node matches .nvmrc", () => {
    const nvmrc = readRepoFile(".nvmrc").trim();
    expect(readMiseTools().node).toBe(nvmrc);
  });
});
```

- [x] **Step 6: Register the test glob with ESLint**

In `eslint.config.js`, inside `parserOptions.projectService.allowDefaultProject`, add these two
entries next to the other `packages/*` entries:

```js
            "packages/repo-guards/src/*.test.ts",
```

Without this, `eslint --fix` in the pre-commit hook fails with "was not found by the project
service" — see CLAUDE.md's "Gotcha: per-package `tsconfig.json` is required".

- [x] **Step 7: Install the new dependency**

Run: `pnpm install`
Expected: `yaml` is added under `packages/repo-guards`; `pnpm-lock.yaml` changes.

- [x] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter @tarkov/repo-guards test`
Expected: PASS — `mise.toml` says `22` and `.nvmrc` says `22`.

- [x] **Step 9: Prove the guard actually guards**

Temporarily change `mise.toml` to `node = "24"`, re-run `pnpm --filter @tarkov/repo-guards test`.
Expected: FAIL with `expected '24' to be '22'`. Revert to `22` and confirm it passes again.

A guard you have never seen fail is a guard you have not tested.

- [x] **Step 10: Commit**

```bash
git add packages/repo-guards eslint.config.js pnpm-lock.yaml
git commit -m "build(guards): scaffold repo-guards with the node-pin guard

Static-analysis guards over repo configuration live here. First guard
holds mise.toml's node pin to .nvmrc, which CI reads."
```

### Task 3: Guard the pnpm pin against `packageManager`

**Files:**

- Modify: `packages/repo-guards/src/toolchain.test.ts`

**Interfaces:**

- Consumes: `readMiseTools`, `readRepoFile` from Task 2.
- Produces: nothing new.

- [x] **Step 1: Add the failing test**

Append inside the existing `describe` block in `packages/repo-guards/src/toolchain.test.ts`:

```ts
it("mise.toml pnpm matches package.json packageManager", () => {
  const pkg = JSON.parse(readRepoFile("package.json")) as { packageManager?: string };
  expect(pkg.packageManager).toBe(`pnpm@${readMiseTools().pnpm}`);
});
```

- [x] **Step 2: Run the test**

Run: `pnpm --filter @tarkov/repo-guards test`
Expected: PASS — Task 1 Step 4 already bumped `packageManager` to `pnpm@10.34.5`.

If it FAILS, Task 1 Step 4 was skipped. Fix `package.json`, do not weaken the test.

- [x] **Step 3: Prove the guard guards**

Temporarily set `packageManager` to `pnpm@10.0.0`, re-run the test.
Expected: FAIL with `expected 'pnpm@10.0.0' to be 'pnpm@10.34.5'`. Revert.

- [x] **Step 4: Commit**

```bash
git add packages/repo-guards/src/toolchain.test.ts
git commit -m "build(guards): hold packageManager to the mise pnpm pin"
```

### Task 4: Align `@types/node` with the pinned runtime

**Files:**

- Modify: `package.json` (`devDependencies.@types/node`)

**Interfaces:**

- Consumes: Task 1's node pin.
- Produces: nothing.

**Why this task exists:** the repo pins node `22` but depends on `@types/node@^25.6.0`. Typing a
runtime you do not run is how code typechecks and then fails on an API the pinned runtime lacks.
Arc 2 adds a Dependabot `ignore` so this cannot silently drift forward again.

- [x] **Step 1: Pin `@types/node` to the 22 line**

In root `package.json`, change:

```json
    "@types/node": "^25.6.0",
```

to:

```json
    "@types/node": "^22.19.1",
```

- [x] **Step 2: Install**

Run: `pnpm install`

- [x] **Step 3: Typecheck the whole repo**

Run: `pnpm typecheck`
Expected: PASS.

If it fails, the failure is real information: something in the repo uses a node API newer than 22.
Record the file and symbol in the PR body, then either raise the node pin in `mise.toml` **and**
`.nvmrc` in the same commit (Guard 1 enforces they move together), or rewrite the call. Do not
revert `@types/node` to paper over it.

- [x] **Step 4: Run the full gate**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build(deps): align @types/node with the pinned node 22 runtime

@types/node was ^25.6.0 against a node 22 pin. Typing a runtime you do
not run produces code that typechecks and then fails at runtime."
```

- [x] **Step 6: Open the Arc T PR**

```bash
git push -u origin build/mise-toolchain-pin
gh pr create --title "build(toolchain): pin node + pnpm via mise" --body "$(cat <<'BODY'
First of five arcs from the repo-security spec.

- `mise.toml` pins node 22 + pnpm 10.34.5
- `packageManager` bumped from 10.0.0 to match
- `@types/node` realigned from ^25 to ^22 — it was typing a runtime we do not run
- New `packages/repo-guards` holds two guards that fail if the pins drift apart

CI still reads `.nvmrc`; `jdx/mise-action` parity is deferred.

Spec: `docs/superpowers/specs/2026-08-18-repo-security-and-dependency-updates-design.md`
BODY
)"
```

---

## Arc 0 — Release-please expression injection

**Branch:** `fix/release-please-expression-injection`

### Task 5: Fix the injection and ship the guard that prevents its return

**Files:**

- Create: `packages/repo-guards/src/workflows.ts`
- Create: `packages/repo-guards/src/workflow-injection.test.ts`
- Modify: `.github/workflows/release-please.yml:27-37`

**Interfaces:**

- Consumes: `REPO_ROOT`, `readRepoFile` from Task 2.
- Produces: `WORKFLOW_DIR: string`, `workflowFiles(): string[]`, `parseWorkflow(file: string): unknown`, `collectRunBlocks(node: unknown, path?: string[]): RunBlock[]` where `RunBlock = { path: string; script: string }` — Arc 3 reuses all four.

- [x] **Step 1: Create the workflow helper `packages/repo-guards/src/workflows.ts`**

```ts
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { REPO_ROOT, readRepoFile } from "./repo.js";

export const WORKFLOW_DIR = ".github/workflows";

export interface RunBlock {
  /** Dotted path to the `run:` key, e.g. "jobs.release-please.steps.1.run". */
  path: string;
  /** The shell script text. */
  script: string;
}

/** Every workflow filename in .github/workflows, sorted for stable test output. */
export function workflowFiles(): string[] {
  return readdirSync(join(REPO_ROOT, WORKFLOW_DIR))
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort();
}

/** Parse one workflow into a plain JS object. */
export function parseWorkflow(file: string): unknown {
  return parse(readRepoFile(`${WORKFLOW_DIR}/${file}`));
}

/** Walk a parsed workflow and collect every `run:` scalar with its path. */
export function collectRunBlocks(node: unknown, path: string[] = []): RunBlock[] {
  const found: RunBlock[] = [];

  if (Array.isArray(node)) {
    node.forEach((item, index) => {
      found.push(...collectRunBlocks(item, [...path, String(index)]));
    });
    return found;
  }

  if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "run" && typeof value === "string") {
        found.push({ path: [...path, key].join("."), script: value });
      } else {
        found.push(...collectRunBlocks(value, [...path, key]));
      }
    }
  }

  return found;
}
```

- [x] **Step 2: Write the failing test `packages/repo-guards/src/workflow-injection.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { collectRunBlocks, parseWorkflow, workflowFiles } from "./workflows.js";

const EXPRESSION = /\$\{\{/;

/**
 * GitHub Actions substitutes ${{ }} into a `run:` scalar BEFORE bash parses it, so a
 * spliced value is source code, not data. Any expression a run block needs must arrive
 * through `env:` and be referenced as a quoted shell variable.
 */
describe("no ${{ }} expressions inside run: blocks", () => {
  for (const file of workflowFiles()) {
    it(`${file} routes every expression through env:`, () => {
      const offenders = collectRunBlocks(parseWorkflow(file))
        .filter((block) => EXPRESSION.test(block.script))
        .map((block) => {
          const line = block.script.split("\n").find((l) => EXPRESSION.test(l));
          return `${block.path} -> ${line?.trim() ?? ""}`;
        });

      expect(offenders).toEqual([]);
    });
  }
});
```

- [x] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @tarkov/repo-guards test`
Expected: FAIL on `release-please.yml`, listing two offenders — the `steps.release.outputs.pr`
splice and the `github.repository` splice, both inside the same `run:` block.

If any other workflow also fails, fix it the same way in this task rather than deferring it.

- [x] **Step 4: Fix `.github/workflows/release-please.yml`**

Replace the `Trigger CI on release PR` step (lines 27-37) entirely with:

```yaml
# Every expression reaches this script through `env:`, never spliced into the `run:`
# scalar. Actions substitutes ${{ }} before bash parses it, so a spliced value is
# source code — and this job holds contents/pull-requests/actions write plus GH_TOKEN.
- name: Trigger CI on release PR
  if: steps.release.outputs.pr
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    RELEASE_PR: ${{ steps.release.outputs.pr }}
    REPO: ${{ github.repository }}
  run: |
    set -euo pipefail
    PR_BRANCH=$(printf '%s' "$RELEASE_PR" | jq -r '.headBranchName')
    # Without this guard a failed jq yields an empty ref and `gh workflow run --ref ""`
    # fires against an unintended target. There was no `set -e` here before either.
    [ -n "$PR_BRANCH" ] && [ "$PR_BRANCH" != "null" ] || {
      echo "::error::could not read headBranchName from the release-please output"
      exit 1
    }
    echo "Triggering CI workflow on $PR_BRANCH"
    gh workflow run ci.yml --repo "$REPO" --ref "$PR_BRANCH" --field ref="$PR_BRANCH"
```

- [x] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @tarkov/repo-guards test`
Expected: PASS for every workflow file.

- [x] **Step 6: Lint the workflow YAML**

Run: `mise exec -- actionlint .github/workflows/release-please.yml`
Expected: no output (actionlint is silent on success).

If `actionlint` is not installed, run `mise use -g actionlint@latest` first.

- [x] **Step 7: Run the full gate**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add .github/workflows/release-please.yml packages/repo-guards/src
git commit -m "fix(ci): route release-please output through env instead of splicing it

steps.release.outputs.pr was interpolated directly into a run: scalar.
Actions substitutes \${{ }} before bash parses it, so that JSON — whose
title and body derive from commit messages — was source code in a job
holding contents/pull-requests/actions write and a GH_TOKEN.

Also adds set -euo pipefail and a guard on an empty branch name, both
absent before, and a repo-guards test that fails on the pattern anywhere
in .github/workflows."
```

- [x] **Step 9: Open the Arc 0 PR**

```bash
git push -u origin fix/release-please-expression-injection
gh pr create --title "fix(ci): route release-please output through env instead of splicing it" --body "$(cat <<'BODY'
Second of five arcs from the repo-security spec.

`release-please.yml` spliced `${{ steps.release.outputs.pr }}` straight into a `run:` block.
Actions substitutes expressions into the script text before bash parses it, and that JSON's
`title`/`body` derive from Conventional Commit messages — so a `'` in a commit message closes
the quote and the rest executes, in a job holding `contents: write`, `pull-requests: write`,
`actions: write` and a `GH_TOKEN`.

Fix routes it through `env:`, adds the missing `set -euo pipefail`, and guards an empty branch.
A new repo-guards test fails on the pattern anywhere under `.github/workflows/`.

Spec: `docs/superpowers/specs/2026-08-18-repo-security-and-dependency-updates-design.md`
BODY
)"
```

---

## Arc 1 — Dependency catch-up

**Branch:** `fix/dependency-catch-up`

### Task 6: Refresh the lockfile and clear the transitive backlog

**Files:**

- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: Arc T's toolchain.
- Produces: a lockfile with a recorded advisory delta, consumed by Task 7's decisions.

- [x] **Step 1: Record the baseline**

```bash
pnpm audit --json > /tmp/audit-before.json || true
pnpm audit || true
```

`pnpm audit` exits non-zero when advisories exist, hence the `|| true`.

Expected at time of writing: `50 vulnerabilities found. Severity: 5 low | 15 moderate | 28 high | 2 critical`.
Record the actual numbers you see — they will have moved.

- [x] **Step 2: Update within existing semver ranges**

Run: `pnpm update -r`
Expected: many packages updated. This respects the ranges in each `package.json`, so it lifts
transitives (`undici`, `brace-expansion`, `fast-uri`, `nanoid`, `postcss`, `seroval`) without
touching any manifest.

- [x] **Step 3: Deduplicate**

Run: `pnpm dedupe`

- [x] **Step 4: Re-audit and capture the delta**

```bash
pnpm audit --json > /tmp/audit-after.json || true
pnpm audit || true
```

Write down the new counts. You will paste the before/after into the PR body.

- [x] **Step 5: Confirm the SPA-bundled critical is gone**

Run: `pnpm why seroval`
Expected: every resolved copy is `>= 1.5.3`.

`seroval` is the one critical that ships to browsers — it reaches the bundle via
`@tanstack/react-router` → `@tanstack/router-core`, and the advisory is a `fromJSON()` type
confusion that invokes attacker-controlled methods during deserialization.

If it is still `1.5.2`, `@tanstack/react-router`'s own range is pinning it. In that case: raise
`@tanstack/react-router` in `apps/web/package.json` to a version whose `router-core` depends on
`seroval >= 1.5.3`, as its own commit within this PR. Do not leave it unresolved.

- [x] **Step 6: Run the full gate**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
Expected: PASS.

- [x] **Step 7: Run the e2e suite**

Run: `pnpm --filter @tarkov/web test:e2e`
Expected: PASS, all routes, no console errors.

This is the step that catches a bad transitive bump. Do not skip it. If Playwright browsers are
missing, run `pnpm --filter @tarkov/web test:e2e:install` first.

- [x] **Step 8: Commit**

```bash
git add pnpm-lock.yaml
git commit -m "fix(deps): refresh lockfile to clear the transitive advisory backlog

pnpm update -r + dedupe within existing semver ranges. Full gate and
e2e green. Before/after advisory counts in the PR body."
```

If Step 5 required a manifest change, commit that separately first with its own message
explaining which advisory forced it.

### Task 7: Resolve every remaining advisory explicitly

**Files:**

- Modify: `apps/*/package.json` and/or `packages/*/package.json` (only where a range must move)
- Create: `docs/operations/dependency-residue.md`

**Interfaces:**

- Consumes: Task 6's `/tmp/audit-after.json`.
- Produces: the documented residue list that Arc 2 Task 9 turns into `dependabot.yml` `ignore` entries.

- [x] **Step 1: List what survived**

```bash
pnpm audit --json 2>/dev/null | node -e '
let raw = ""; process.stdin.on("data", (d) => (raw += d)); process.stdin.on("end", () => {
  const advisories = Object.values(JSON.parse(raw).advisories ?? {});
  const rank = { critical: 0, high: 1, moderate: 2, low: 3 };
  advisories.sort((a, b) => rank[a.severity] - rank[b.severity]);
  for (const a of advisories) {
    console.log([a.severity.toUpperCase().padEnd(8), a.module_name.padEnd(24), (a.patched_versions ?? "").padEnd(16), a.title].join(" | "));
  }
  console.log("TOTAL:", advisories.length);
});'
```

- [x] **Step 2: Classify each survivor**

For every advisory still listed, decide exactly one of:

1. **Range bump** — the fix exists but a manifest range blocks it. Raise the range in the owning
   `package.json`, re-run the Task 6 gate, and record it.
2. **Blocked upstream** — no released version fixes it, or the fixed version breaks a peer.
   Record the blocker and the literal command that proves it unblocked, e.g.
   `pnpm view vite peerDependencies` or `pnpm view <pkg> versions`.
3. **Not reachable** — build-time only, never bundled or deployed. Record the dependency path
   from `pnpm why <pkg>` that proves it.

Known case at time of writing: the two `vite` advisories want `>= 6.4.3` and `>= 8.0.16`, which
spans a major. If the major is required, land it as its own commit in this PR so the e2e result is
bisectable against it.

- [x] **Step 3: Write `docs/operations/dependency-residue.md`**

```markdown
# Dependency advisory residue

Every `pnpm audit` advisory that survives the catch-up, with the reason it survives and the
command that proves it resolvable. Reviewed whenever Dependabot's weekly PR lands.

**Last reviewed:** 2026-08-18 — <N> advisories outstanding (from a 50-advisory baseline).

| Package  | Severity | Why it survives        | Unblock test        |
| -------- | -------- | ---------------------- | ------------------- |
| `<name>` | `<sev>`  | `<reason from Step 2>` | `<literal command>` |
```

Fill one row per survivor. An empty table is a valid and excellent outcome — say so explicitly
rather than deleting the file.

- [x] **Step 4: Re-run the full gate**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build && pnpm --filter @tarkov/web test:e2e`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add docs/operations/dependency-residue.md
git add -u
git commit -m "docs(ops): record the dependency advisory residue

Every advisory surviving the catch-up, with why it survives and the
command that proves it resolvable. Arc 2 turns the blocked-upstream
rows into dependabot ignore entries."
```

- [x] **Step 6: Open the Arc 1 PR**

```bash
git push -u origin fix/dependency-catch-up
gh pr create --title "fix(deps): clear the dependency advisory backlog" --body "$(cat <<'BODY'
Third of five arcs from the repo-security spec.

Baseline: **50 advisories** (2 critical, 28 high, 15 moderate, 5 low).
After `pnpm update -r` + `pnpm dedupe`: **<N> advisories**.

The one critical that ships to browsers — `seroval`, via
`@tanstack/react-router` → `router-core` — is resolved to >= 1.5.3.

Every survivor is documented in `docs/operations/dependency-residue.md` with the reason and
the command that proves it resolvable. Full gate + e2e green.

Spec: `docs/superpowers/specs/2026-08-18-repo-security-and-dependency-updates-design.md`
BODY
)"
```

---

## Arc 2 — Dependabot, repo settings, disclosure

**Branch:** `ci/dependabot-and-repo-security`

### Task 8: Add `dependabot.yml` and the composite-action coverage guard

**Files:**

- Create: `.github/dependabot.yml`
- Create: `packages/repo-guards/src/dependabot.ts`
- Create: `packages/repo-guards/src/dependabot.test.ts`

**Interfaces:**

- Consumes: `REPO_ROOT`, `readRepoFile` from Task 2; the residue table from Task 7.
- Produces: `readDependabotUpdates(): DependabotUpdate[]`, `compositeActionDirs(): string[]`.

- [ ] **Step 1: Create `.github/dependabot.yml`**

```yaml
version: 2
updates:
  # `directories` (plural) supports globbing; `directory` (singular) does not. The workspace
  # root is NOT assumed to cover its members — GitHub's docs never promise that, and the
  # composite-action entry below exists because implicit coverage failed once already.
  - package-ecosystem: npm
    directories:
      - "/"
      - "/apps/*"
      - "/packages/*"
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    # Deploys fire ONLY on release-please PR merges, and release-please hides `chore` and
    # bumps nothing for it. A production-dependency security patch committed as chore(deps)
    # would land on main and never reach Cloudflare. `fix` opens the release PR; merging it
    # is still a human decision, so the promotion gate is preserved — it can just SEE the fix.
    commit-message:
      prefix: "fix(deps)"
      prefix-development: "chore(deps-dev)"
    groups:
      minor-and-patch:
        update-types: [minor, patch]
      # Security updates are UNGROUPED by default — one PR per advisory. Against the backlog
      # this repo carried in 2026-08 that would have been roughly twenty PRs in a morning.
      security:
        applies-to: security-updates
        patterns: ["*"]
    ignore:
      # @types/node MUST track mise.toml's node pin rather than float ahead of it. Dependabot
      # cannot see mise.toml. Typing a runtime you do not run is how code typechecks and then
      # fails on an API the pinned runtime lacks — this repo shipped ^25 against a node 22 pin.
      # Unblock: raise `node` in mise.toml AND .nvmrc first, then raise this range in the SAME
      # commit. The next major after the blocked one still arrives, which is the re-evaluation
      # point.
      - dependency-name: "@types/node"
        versions: [">=23.0.0"]

  # `directory: /` scans .github/workflows/ and NOTHING ELSE. Composite actions under
  # .github/actions/*/action.yml need their own entry, one per directory. None exist today;
  # packages/repo-guards fails the build if one appears without an entry here.
  - package-ecosystem: github-actions
    directory: "/"
    schedule:
      interval: weekly
    commit-message:
      prefix: "ci(deps)"
    groups:
      actions:
        update-types: [minor, patch]
```

Add one `ignore` entry per **blocked-upstream** row from `docs/operations/dependency-residue.md`,
each carrying the same three things: the reason, a bounded range, and the literal unblock command.

- [ ] **Step 2: Create `packages/repo-guards/src/dependabot.ts`**

```ts
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { REPO_ROOT, readRepoFile } from "./repo.js";

export interface DependabotUpdate {
  "package-ecosystem": string;
  directory?: string;
  directories?: string[];
}

export function readDependabotUpdates(): DependabotUpdate[] {
  const config = parse(readRepoFile(".github/dependabot.yml")) as {
    updates?: DependabotUpdate[];
  };
  return config.updates ?? [];
}

/**
 * Every directory holding a composite action, formatted the way a dependabot
 * `directory:` value would be written (leading slash, repo-relative).
 */
export function compositeActionDirs(): string[] {
  const base = join(REPO_ROOT, ".github", "actions");
  if (!existsSync(base)) return [];

  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(base, entry.name, "action.yml")))
    .map((entry) => `/.github/actions/${entry.name}`)
    .sort();
}
```

- [ ] **Step 3: Write the test `packages/repo-guards/src/dependabot.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { compositeActionDirs, readDependabotUpdates } from "./dependabot.js";

describe("dependabot coverage", () => {
  it("watches every composite action directory", () => {
    const watched = new Set(
      readDependabotUpdates()
        .filter((update) => update["package-ecosystem"] === "github-actions")
        .flatMap((update) => update.directories ?? (update.directory ? [update.directory] : [])),
    );

    // `directory: /` covers .github/workflows only. Each composite action needs its own entry.
    const unwatched = compositeActionDirs().filter((dir) => !watched.has(dir));
    expect(unwatched).toEqual([]);
  });

  it("covers the workspace roots for npm", () => {
    const npm = readDependabotUpdates().filter((u) => u["package-ecosystem"] === "npm");
    const directories = npm.flatMap((u) => u.directories ?? []);
    expect(directories).toEqual(expect.arrayContaining(["/", "/apps/*", "/packages/*"]));
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @tarkov/repo-guards test`
Expected: PASS.

- [ ] **Step 5: Prove the composite-action guard actually guards**

```bash
mkdir -p .github/actions/scratch
printf 'name: scratch\nruns:\n  using: composite\n  steps: []\n' > .github/actions/scratch/action.yml
pnpm --filter @tarkov/repo-guards test
```

Expected: FAIL with `expected [ '/.github/actions/scratch' ] to deeply equal []`.

Then clean up: `rm -rf .github/actions/scratch` and confirm the test passes again.

- [ ] **Step 6: Commit**

```bash
git add .github/dependabot.yml packages/repo-guards/src
git commit -m "ci(deps): add dependabot with grouped updates and coverage guards

One grouped minor+patch PR per week across all ten workspace packages;
majors and security updates grouped per their own rules. fix(deps) on
production deps so a security patch can reach the release-gated deploy.

A repo-guards test fails if a composite action ever appears without its
own dependabot entry — directory: / scans workflows and nothing else."
```

### Task 9: Add `SECURITY.md`

**Files:**

- Create: `SECURITY.md`

**Interfaces:** none.

- [ ] **Step 1: Create `SECURITY.md`**

```markdown
# Security Policy

## Reporting a vulnerability

Please report security issues through
[GitHub private vulnerability reporting](https://github.com/UnderMyBed/TarkovGunsmith/security/advisories/new).
That keeps the report private until a fix ships. Please do not open a public issue for a
security problem.

This is a hobby project with no bounty programme. Reports are handled on a best-effort basis —
expect an acknowledgement within about a week.

## Scope

**In scope**

- This repository's code.
- The `data-proxy` and `builds-api` Cloudflare Workers.
- The deployed site.

**Out of scope**

- [`api.tarkov.dev`](https://api.tarkov.dev) — an upstream community API. Report issues to
  [the-hideout](https://github.com/the-hideout).
- Cloudflare's own infrastructure. Report to Cloudflare.
- Game-data accuracy. That is a data bug, not a security issue — open a normal issue.

## What this application handles

Calibration for anyone assessing impact: there are no user accounts, no authentication, and no
personal data. The KV-backed build store holds anonymous weapon-build JSON submitted by
visitors, keyed by a generated id. There is nothing to escalate to and no session to steal.

The realistic risk surface is supply-chain (a compromised dependency reaching the browser
bundle or a Worker), the share-URL deserialization path, and the GitHub Actions workflows.
```

- [ ] **Step 2: Format and commit**

```bash
pnpm format
git add SECURITY.md
git commit -m "docs(security): add SECURITY.md with disclosure channel and scope"
```

### Task 10: Enable the repo settings and write the runbook

**Files:**

- Create: `docs/operations/repo-security.md`

**Interfaces:** none.

- [ ] **Step 1: Create `docs/operations/repo-security.md`**

````markdown
# Repository security settings runbook

These are GitHub _settings_, not files. Nothing in this repository enforces them and nothing
notices if they are switched off — so this runbook is the record, and re-running the verify
block below is how you check.

Automated drift detection is deliberately not implemented: reading `security_and_analysis`
needs repo-admin scope, which `GITHUB_TOKEN` cannot grant. It needs a fine-grained PAT and is
tracked as follow-up work.

## Enable (one-time)

```bash
REPO=UnderMyBed/TarkovGunsmith

gh api -X PUT "repos/$REPO/vulnerability-alerts"                # -> 204 No Content
gh api -X PUT "repos/$REPO/automated-security-fixes"            # -> 204 No Content
gh api -X PUT "repos/$REPO/private-vulnerability-reporting"     # -> 204 No Content

gh api -X PATCH "repos/$REPO" \
  -f 'security_and_analysis[secret_scanning][status]=enabled' \
  -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled'
```

Enabling secret scanning triggers a **full history scan**. This repository was private until
PR #105, so the first scan is also the answer to "did anything leak before we went public".
Check the results at `https://github.com/$REPO/security/secret-scanning`.

## Verify

```bash
gh api "repos/UnderMyBed/TarkovGunsmith" \
  --jq '.security_and_analysis | {secret_scanning, secret_scanning_push_protection, dependabot_security_updates}'
```

Expected:

```json
{
  "secret_scanning": { "status": "enabled" },
  "secret_scanning_push_protection": { "status": "enabled" },
  "dependabot_security_updates": { "status": "enabled" }
}
```

And:

```bash
gh api "repos/UnderMyBed/TarkovGunsmith/vulnerability-alerts" -i | head -1
```

Expected: `HTTP/2.0 204`. A `404` means Dependabot alerts are **disabled**.

## Notification check (no API equivalent)

An alert that reaches nobody is not an alert. Confirm, in the GitHub UI:

- You are **watching** this repository (Watch → All Activity, or at minimum Custom → Issues).
- Security alert emails are enabled under your account notification settings.

This matters because the failure watcher in `.github/workflows/scheduled-failure.yml` files
issues authored by `github-actions[bot]`. It `@`-mentions and assigns you precisely because a
bot-authored issue in an unwatched repository notifies no one.
````

- [ ] **Step 2: Run the enable block**

Run the commands from the runbook's "Enable" section.
Expected: three `204`s and a JSON body from the PATCH.

- [ ] **Step 3: Run the verify block**

Run the commands from the runbook's "Verify" section.
Expected: exactly the output shown. If anything differs, fix it before continuing.

- [ ] **Step 4: Check the secret-scanning results**

Visit `https://github.com/UnderMyBed/TarkovGunsmith/security/secret-scanning`.
Record the finding count in the PR body. Any finding is follow-up work, not a blocker for
this PR — but it must be written down, not noticed and forgotten.

- [ ] **Step 5: Commit and open the Arc 2 PR**

```bash
pnpm format
git add docs/operations/repo-security.md
git commit -m "docs(ops): runbook for repository security settings"
git push -u origin ci/dependabot-and-repo-security
gh pr create --title "ci(deps): dependabot, repo security settings, and SECURITY.md" --body "$(cat <<'BODY'
Fourth of five arcs from the repo-security spec.

- `.github/dependabot.yml` — one grouped minor+patch PR/week across all ten workspace
  packages, majors alone, security updates grouped, `fix(deps)` prefix so a production
  security patch can reach the release-gated deploy
- Dependabot alerts, security updates, secret scanning, push protection, and private
  vulnerability reporting all enabled (runbook: `docs/operations/repo-security.md`)
- `SECURITY.md` with a private disclosure channel and honest scope
- A repo-guards test that fails if a composite action appears without a dependabot entry

Secret-scanning history scan results: <count> findings.

Spec: `docs/superpowers/specs/2026-08-18-repo-security-and-dependency-updates-design.md`
BODY
)"
```

---

## Arc 3 — CodeQL and the failure watcher

**Branch:** `ci/codeql-and-failure-alerting`

### Task 11: Write the alert decision script and its unit tests

**Files:**

- Create: `.github/scripts/scheduled-failure.mjs`
- Create: `packages/repo-guards/src/scheduled-failure.test.ts`
- Modify: `packages/repo-guards/tsconfig.json` (allow the `.mjs` import)
- Modify: `eslint.config.js` (ignore `.github/scripts/**`)

**Interfaces:**

- Consumes: nothing.
- Produces: `ALERTING_CONCLUSIONS: string[]`, `ALERT_LABELS: string[]`, `alertTitle(workflowName: string): string`, and `assess(input): { fileIssue: boolean; reason?: string; title?: string; body?: string }` where `input = { workflowName, conclusion, runEvent, runUrl, openIssues: { title: string }[] }`. Task 12's workflow and guards consume all four.

- [ ] **Step 1: Create `.github/scripts/scheduled-failure.mjs`**

```js
#!/usr/bin/env node
/**
 * Decides whether a completed workflow_run warrants filing an alert issue.
 *
 * Lives outside the workflow YAML so the decision is unit-testable — the dedupe is a
 * read-then-write and the conclusion filter is easy to widen by accident. Stdlib only,
 * no build step, so the workflow needs nothing but a node runtime.
 */
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * An ALLOW-LIST. Never widen this to `!= "success"`: the two forms differ on a CANCELLED
 * run, which is usually a human deliberately superseding one — and an alert that pages on
 * deliberate cancellation is an alert that gets muted.
 */
export const ALERTING_CONCLUSIONS = ["failure", "timed_out"];

/**
 * Labels the alert is filed with. `gh issue create` FAILS OUTRIGHT on an unknown label,
 * which would turn this alert into a failed run whose only symptom is a red tick nobody
 * watches — so the workflow creates them before filing, and a guard holds them to
 * .github/labels.yml.
 */
export const ALERT_LABELS = ["critical", "scheduled-red"];

/** Stable dedupe key. One open alert per workflow, not one per failed run. */
export function alertTitle(workflowName) {
  return `${workflowName} is failing`;
}

export function assess({ workflowName, conclusion, runEvent, runUrl, openIssues }) {
  if (!ALERTING_CONCLUSIONS.includes(conclusion)) {
    return { fileIssue: false, reason: `conclusion "${conclusion}" is not an alerting conclusion` };
  }

  const title = alertTitle(workflowName);

  // Staleness is a CONDITION, not an event: it stays true until someone fixes it. Without
  // this, a three-month stall files ninety issues, and an alert that buries its own repeat
  // is an alert that gets muted.
  if (openIssues.some((issue) => issue.title === title)) {
    return { fileIssue: false, reason: `an alert titled "${title}" is already open` };
  }

  const body = [
    `**${workflowName}** finished with conclusion \`${conclusion}\`.`,
    "",
    `- Triggering event: \`${runEvent}\``,
    `- Failed run: ${runUrl}`,
    "",
    "Filed automatically: a failing workflow nobody is watching is indistinguishable from one",
    "that never ran. Close this once the workflow is green again — it will not be re-filed",
    "while it stays open.",
  ].join("\n");

  return { fileIssue: true, title, body };
}

const BODY_DELIMITER = "SCHEDULED_FAILURE_BODY";

function writeOutput(result) {
  const lines = [`file_issue=${result.fileIssue ? "1" : "0"}`];

  if (result.fileIssue) {
    if (result.body.includes(BODY_DELIMITER)) {
      throw new Error("issue body contains the heredoc delimiter; refusing to emit output");
    }
    lines.push(`issue_title=${result.title}`);
    lines.push(`issue_body<<${BODY_DELIMITER}`, result.body, BODY_DELIMITER);
  } else {
    console.log(`::notice::not filing an alert — ${result.reason}`);
  }

  const text = `${lines.join("\n")}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, text);
  else process.stdout.write(text);
}

function main(argv) {
  const [workflowName, conclusion, runEvent, runUrl, openIssuesJson] = argv;

  // A failed `gh` listing must NEVER arrive here as an empty string — `[]` is a legitimate
  // answer (no alert open) but an outage is not, and passing one on defeats the dedupe.
  // The workflow refuses to call this script on an empty listing; this is the second line.
  if (!openIssuesJson) throw new Error("missing open-issues JSON argument");

  writeOutput(
    assess({
      workflowName,
      conclusion,
      runEvent,
      runUrl,
      openIssues: JSON.parse(openIssuesJson),
    }),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
```

- [ ] **Step 2: Let the TypeScript project see the `.mjs` file**

In `packages/repo-guards/tsconfig.json`, replace the whole file with:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "allowJs": true,
    "checkJs": false
  },
  "include": ["src/**/*", "../../.github/scripts/**/*.mjs"],
  "exclude": ["node_modules"]
}
```

`rootDir` is dropped because nothing is emitted, and `allowJs` lets the test import the script
without a declaration file.

- [ ] **Step 3: Exclude `.github/scripts` from ESLint**

In `eslint.config.js`, in the top-level `ignores` array, add below the existing `"scripts/**"`
entry:

```js
      // Workflow helper scripts — plain .mjs with no tsconfig project entry, same reasoning
      // as scripts/** above. Correctness is covered by unit tests in packages/repo-guards.
      ".github/scripts/**",
```

- [ ] **Step 4: Write the tests `packages/repo-guards/src/scheduled-failure.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  ALERTING_CONCLUSIONS,
  alertTitle,
  assess,
} from "../../../.github/scripts/scheduled-failure.mjs";

const base = {
  workflowName: "CodeQL",
  conclusion: "failure",
  runEvent: "schedule",
  runUrl: "https://github.com/UnderMyBed/TarkovGunsmith/actions/runs/1",
  openIssues: [] as { title: string }[],
};

describe("assess", () => {
  it("files an alert for a failing run with nothing open", () => {
    const result = assess(base);
    expect(result.fileIssue).toBe(true);
    expect(result.title).toBe("CodeQL is failing");
    expect(result.body).toContain(base.runUrl);
  });

  it("files an alert for a timed-out run", () => {
    expect(assess({ ...base, conclusion: "timed_out" }).fileIssue).toBe(true);
  });

  it("stays silent on success", () => {
    expect(assess({ ...base, conclusion: "success" }).fileIssue).toBe(false);
  });

  it("stays silent on cancellation, which is usually deliberate", () => {
    expect(assess({ ...base, conclusion: "cancelled" }).fileIssue).toBe(false);
  });

  it("does not file a second alert while one is already open", () => {
    const result = assess({ ...base, openIssues: [{ title: alertTitle("CodeQL") }] });
    expect(result.fileIssue).toBe(false);
    expect(result.reason).toContain("already open");
  });

  it("dedupes per workflow, not globally", () => {
    const result = assess({ ...base, openIssues: [{ title: alertTitle("Deploy") }] });
    expect(result.fileIssue).toBe(true);
  });

  it("exposes exactly the two alerting conclusions", () => {
    expect(ALERTING_CONCLUSIONS).toEqual(["failure", "timed_out"]);
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @tarkov/repo-guards test`
Expected: PASS, 7 new tests.

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. If ESLint reports `.github/scripts/scheduled-failure.mjs` "was not found by the
project service", Step 3 was not applied correctly.

- [ ] **Step 7: Commit**

```bash
git add .github/scripts packages/repo-guards eslint.config.js
git commit -m "ci(alerting): add the failure-alert decision script

Kept out of the workflow YAML so the dedupe and the conclusion filter
are unit-testable. Allow-list of failure/timed_out, never != success —
cancellation is usually deliberate and paging on it gets the alert muted."
```

### Task 12: Add the watcher workflow, its labels, and the wiring guards

**Files:**

- Create: `.github/workflows/scheduled-failure.yml`
- Create: `packages/repo-guards/src/alerting.test.ts`
- Modify: `.github/labels.yml`

**Interfaces:**

- Consumes: `ALERTING_CONCLUSIONS`, `ALERT_LABELS` from Task 11; `parseWorkflow`, `workflowFiles` from Task 5.
- Produces: a workflow named `Scheduled failure alert`.

- [ ] **Step 1: Add the two labels to `.github/labels.yml`**

Append:

```yaml
- name: critical
  description: Requires immediate attention.
  color: "d93f0b"
- name: scheduled-red
  description: An automated workflow failed and filed this alert.
  color: "a02c2c"
```

- [ ] **Step 2: Create `.github/workflows/scheduled-failure.yml`**

```yaml
name: Scheduled failure alert

# SEPARATE FROM THE WORKFLOWS IT WATCHES, deliberately. A notify step inside Deploy cannot
# report Deploy being disabled for repository inactivity, being deleted, or failing before the
# step is reached. An alert that shares a fate with the thing it watches is not an alert. It
# also keeps `issues: write` off every workflow that holds deploy credentials.
#
# `workflow_run` ALWAYS runs the copy on the default branch, whatever branch the watched run
# used — which is why the end-to-end demonstration can only happen after this merges.
on:
  workflow_run:
    # Every workflow whose failure would otherwise reach nobody. CI is deliberately absent:
    # its failures are already visible in the PR that caused them, and watching it would file
    # an issue for every ordinary red PR.
    #
    # Enforced as a RULE, not a snapshot — packages/repo-guards fails if a scheduled workflow
    # is added and not listed here.
    workflows: ["Deploy", "Release Please"]
    types: [completed]
  workflow_dispatch:
    inputs:
      simulate:
        description: >-
          Workflow name to simulate a failure for, so the delivery path can be proven without
          waiting for a real failure. Files a real issue.
        required: false
        default: "Scheduled failure alert"

permissions:
  contents: read # checkout
  issues: write # file the alert, and create its labels

# Serialised per watched workflow, never cancelled: two runs completing close together would
# otherwise both read "no open alert" and both file one. The dedupe is a read-then-write.
concurrency:
  group: scheduled-failure-${{ github.event.workflow_run.name || inputs.simulate }}
  cancel-in-progress: false

jobs:
  alert:
    # A cost control, NOT the decision — scheduled-failure.mjs is the decision, and
    # packages/repo-guards fails if this list and ALERTING_CONCLUSIONS drift apart.
    if: >-
      github.event_name == 'workflow_dispatch' ||
      github.event.workflow_run.conclusion == 'failure' ||
      github.event.workflow_run.conclusion == 'timed_out'
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc

      # Every workflow_run field reaches the script as a quoted variable expansion through
      # `env:`, never spliced through ${{ }} into the run: scalar. Actions substitutes into a
      # run: scalar BEFORE bash parses it, so a spliced value is source code — in a job holding
      # issues: write. See the release-please fix in this same milestone.
      - id: assess
        env:
          GH_TOKEN: ${{ github.token }}
          WORKFLOW_NAME: ${{ github.event_name == 'workflow_dispatch' && inputs.simulate || github.event.workflow_run.name }}
          CONCLUSION: ${{ github.event_name == 'workflow_dispatch' && 'failure' || github.event.workflow_run.conclusion }}
          RUN_EVENT: ${{ github.event_name == 'workflow_dispatch' && 'workflow_dispatch' || github.event.workflow_run.event }}
          RUN_URL: ${{ github.event_name == 'workflow_dispatch' && github.server_url || github.event.workflow_run.html_url }}
        run: |
          set -euo pipefail
          # RETRIED, because the watcher must not go quiet on someone else's outage. An
          # unretried failure here is this alert failing in exactly the way it exists to
          # detect: a red run reaching nobody.
          open=""
          for attempt in 1 2 3 4 5; do
            if open=$(gh issue list --repo "$GITHUB_REPOSITORY" --state open \
                        --label scheduled-red --limit 100 --json title); then
              break
            fi
            echo "::warning::gh issue list failed (attempt $attempt of 5); retrying"
            open=""
            sleep $((attempt * 5))
          done
          # NEVER let a failed listing through as empty. `[]` is a legitimate answer and must
          # still reach the script; an empty STRING is an outage, and passing it on would
          # defeat the dedupe and file a duplicate on every run of a stall.
          [ -n "$open" ] || {
            echo "::error::could not list open alerts after 5 attempts — refusing to dedupe against no data"
            exit 1
          }
          node .github/scripts/scheduled-failure.mjs \
            "$WORKFLOW_NAME" "$CONCLUSION" "$RUN_EVENT" "$RUN_URL" "$open"

      # FILING AN ISSUE IS NOT ALERTING A HUMAN. A bot-authored issue, in a repository the
      # owner is not watching, with no assignee and no @ anywhere in its body, notifies NOBODY.
      # The mention and the assignment both notify regardless of watch state, and both live
      # HERE rather than in account settings, which are silently revocable and invisible to
      # every gate in this repo.
      - name: File the alert
        if: steps.assess.outputs.file_issue == '1'
        env:
          GH_TOKEN: ${{ github.token }}
          ISSUE_TITLE: ${{ steps.assess.outputs.issue_title }}
          ISSUE_BODY: ${{ steps.assess.outputs.issue_body }}
          OWNER: ${{ github.repository_owner }}
        run: |
          set -euo pipefail
          # `gh issue create` fails outright on an unknown label, and this repo's labels.yml
          # has no automated sync — it is applied by hand. An alarm that depends on someone
          # having run a manual command is an alarm with a manual single point of failure.
          gh label create scheduled-red --color a02c2c --force \
            --description "An automated workflow failed and filed this alert." || true
          gh label create critical --color d93f0b --force \
            --description "Requires immediate attention." || true

          body=$(printf '%s\n\n%s' "@$OWNER" "$ISSUE_BODY")
          url=$(gh issue create --repo "$GITHUB_REPOSITORY" \
            --title "$ISSUE_TITLE" \
            --label critical --label scheduled-red \
            --body "$body")
          echo "::notice::filed $url"

          # Assignment is delivery polish ON TOP of an issue that already exists and already
          # mentions the owner, so it is deliberately not --assignee on the create above: a
          # permissions hiccup there would fail the CREATE and lose the alert entirely.
          gh issue edit "$url" --add-assignee "$OWNER" \
            || echo "::warning::could not assign $OWNER — the @mention in the body is the fallback"
```

- [ ] **Step 3: Write the wiring guards `packages/repo-guards/src/alerting.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { ALERTING_CONCLUSIONS, ALERT_LABELS } from "../../../.github/scripts/scheduled-failure.mjs";
import { readRepoFile } from "./repo.js";
import { parseWorkflow, workflowFiles } from "./workflows.js";

const WATCHER_FILE = "scheduled-failure.yml";

/**
 * YAML 1.1 treats a bare `on` key as the boolean true. The `yaml` package defaults to 1.2,
 * where it stays the string "on" — read both so a parser-default change cannot silently
 * disable these guards by making every lookup undefined.
 */
function triggersOf(parsed: unknown): Record<string, unknown> {
  const doc = (parsed ?? {}) as Record<string, unknown>;
  return (doc["on"] ?? doc["true"] ?? {}) as Record<string, unknown>;
}

function watchedWorkflows(): string[] {
  const workflowRun = triggersOf(parseWorkflow(WATCHER_FILE))["workflow_run"] as
    { workflows?: string[] } | undefined;
  return workflowRun?.workflows ?? [];
}

describe("failure alerting is wired to everything that can fail silently", () => {
  it("watches every workflow that runs on a schedule", () => {
    const scheduled = workflowFiles()
      .filter((file) => file !== WATCHER_FILE)
      .map((file) => parseWorkflow(file))
      .filter((parsed) => "schedule" in triggersOf(parsed))
      .map((parsed) => (parsed as { name?: string }).name ?? "");

    const unwatched = scheduled.filter((name) => !watchedWorkflows().includes(name));
    expect(unwatched).toEqual([]);
  });

  it("the YAML prefilter and the script agree on which conclusions alert", () => {
    const raw = readRepoFile(`.github/workflows/${WATCHER_FILE}`);
    const fromYaml = [...raw.matchAll(/conclusion\s*==\s*'([^']+)'/g)].map((m) => m[1]!);
    expect(fromYaml.sort()).toEqual([...ALERTING_CONCLUSIONS].sort());
  });

  it("every label the alert uses is declared in labels.yml", () => {
    const declared = (parse(readRepoFile(".github/labels.yml")) as { name: string }[]).map(
      (label) => label.name,
    );
    const undeclared = ALERT_LABELS.filter((label) => !declared.includes(label));
    expect(undeclared).toEqual([]);
  });

  it("every label the alert uses appears in the watcher workflow", () => {
    const raw = readRepoFile(`.github/workflows/${WATCHER_FILE}`);
    const missing = ALERT_LABELS.filter((label) => !raw.includes(label));
    expect(missing).toEqual([]);
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @tarkov/repo-guards test`
Expected: PASS. No workflow has a `schedule:` trigger yet, so the first test passes vacuously —
Task 13 is what makes it bite.

- [ ] **Step 5: Verify the injection guard still passes on the new workflow**

Run: `pnpm --filter @tarkov/repo-guards test`
The `no ${{ }} expressions inside run: blocks` suite now covers `scheduled-failure.yml`.
Expected: PASS — every expression in that file is in `env:`, `if:`, or `concurrency:`.

- [ ] **Step 6: Lint the workflow**

Run: `mise exec -- actionlint .github/workflows/scheduled-failure.yml`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/scheduled-failure.yml .github/labels.yml packages/repo-guards/src
git commit -m "ci(alerting): watch Deploy and Release Please for silent failure

A failed deploy after a release merge means the site did not ship, and
nothing said so. A failed release-please means releases silently stop.
Both are dark guards, so both are watched — CI is not, since its
failures are already visible in the PR that caused them.

The alert self-heals its labels: gh issue create fails outright on an
unknown label, and labels.yml has no automated sync."
```

### Task 13: Add CodeQL and prove the watch-list guard bites

**Files:**

- Create: `.github/workflows/codeql.yml`
- Modify: `.github/workflows/scheduled-failure.yml` (watch list)

**Interfaces:**

- Consumes: the guards from Task 12.
- Produces: a workflow named `CodeQL`.

- [ ] **Step 1: Create `.github/workflows/codeql.yml`**

```yaml
name: CodeQL

# No `push: main`, deliberately. Branch protection already requires PRs to be up-to-date and
# green, so a push-to-main run duplicates the check that just passed — the same budget
# reasoning CLAUDE.md gives for ci.yml.
#
# NOT a required status check: paths-ignore means it is skipped on docs-only PRs, and a
# required check that never reports would block them permanently.
on:
  pull_request:
    paths-ignore: ["docs/**", "**.md", "LICENSE", ".gitignore"]
  schedule:
    - cron: "23 5 * * 1"
  workflow_dispatch:

permissions:
  contents: read
  security-events: write

concurrency:
  group: codeql-${{ github.ref }}
  cancel-in-progress: true

jobs:
  analyze:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    strategy:
      fail-fast: false
      matrix:
        # `actions` finds workflow expression injection — the exact bug fixed in this
        # milestone's Arc 0. It is the regression net; the repo-guards grep test is the
        # cheap fast-fail underneath it.
        language: [javascript-typescript, actions]
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v4
        with:
          languages: ${{ matrix.language }}
      - uses: github/codeql-action/analyze@v4
        with:
          category: /language:${{ matrix.language }}
```

- [ ] **Step 2: Run the tests to verify the watch-list guard now fails**

Run: `pnpm --filter @tarkov/repo-guards test`
Expected: FAIL with `expected [ 'CodeQL' ] to deeply equal []` — `codeql.yml` has a `schedule:`
trigger and is not in the watcher's list.

This is the guard doing its job. Do not weaken it.

- [ ] **Step 3: Add CodeQL to the watch list**

In `.github/workflows/scheduled-failure.yml`, change:

```yaml
workflows: ["Deploy", "Release Please"]
```

to:

```yaml
workflows: ["CodeQL", "Deploy", "Release Please"]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @tarkov/repo-guards test`
Expected: PASS.

- [ ] **Step 5: Lint and run the full gate**

Run: `mise exec -- actionlint .github/workflows/codeql.yml && pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/codeql.yml .github/workflows/scheduled-failure.yml
git commit -m "ci(security): add CodeQL over javascript-typescript and actions

PR + weekly cron, no push:main — branch protection already gates PRs,
so a push run duplicates the check that just passed.

The actions language finds workflow expression injection, the class of
bug fixed in this milestone. Adding the cron made the watch-list guard
fail until CodeQL was added to the watcher, which is the guard working."
```

### Task 14: Verify the alert reaches a human, then open the PR

**Files:** none.

- [ ] **Step 1: Confirm the `actions` CodeQL language is available**

Push the branch and open the PR:

```bash
git push -u origin ci/codeql-and-failure-alerting
gh pr create --title "ci(security): CodeQL and failure alerting" --body "$(cat <<'BODY'
Last of five arcs from the repo-security spec.

- CodeQL over `javascript-typescript` and `actions` — PR + weekly cron, no `push: main`
- `scheduled-failure.yml` watches CodeQL, Deploy, and Release Please via `workflow_run`,
  filing one deduped, labelled, `@`-mentioned, assigned issue per failing workflow
- The decision logic is a unit-tested `.mjs` script, not shell buried in YAML
- Labels self-heal, because `gh issue create` fails outright on an unknown label and
  `labels.yml` has no automated sync

Guards added: scheduled workflows must be watched, the YAML prefilter must agree with the
script, and every alert label must be declared in `labels.yml`.

Spec: `docs/superpowers/specs/2026-08-18-repo-security-and-dependency-updates-design.md`
BODY
)"
```

Watch the PR's CodeQL run. Expected: both matrix legs succeed.

If the `actions` leg errors with an unsupported-language message, remove `actions` from the
matrix, commit that with a message recording the error verbatim, and add a follow-up row to the
spec's §9. The `javascript-typescript` leg and the repo-guards grep test still stand.

- [ ] **Step 2: Merge, then prove the alert path end to end**

`workflow_run` always executes the **default-branch** copy of a workflow, so this cannot be
tested before merge.

After merging:

```bash
gh workflow run scheduled-failure.yml -f simulate="Smoke test of the alert path"
```

- [ ] **Step 3: Confirm the issue was filed correctly**

```bash
gh issue list --label scheduled-red --state open --json number,title,assignees,labels
```

Expected: one issue titled `Smoke test of the alert path is failing`, labelled `critical` and
`scheduled-red`, assigned to `UnderMyBed`.

- [ ] **Step 4: Confirm it actually notified you**

Check your GitHub notifications and email. If neither arrived, the alert is working and reaching
nobody — which is the failure this whole arc exists to prevent. Fix it via the notification
check in `docs/operations/repo-security.md` before closing this out.

- [ ] **Step 5: Confirm the dedupe holds**

Run the same dispatch again:

```bash
gh workflow run scheduled-failure.yml -f simulate="Smoke test of the alert path"
```

Expected: the run succeeds and logs `::notice::not filing an alert — an alert titled "..." is
already open`. No second issue appears.

- [ ] **Step 6: Clean up**

```bash
gh issue close <number> --comment "Alert path verified end to end."
```

---

## Post-merge checklist

- [ ] Dependabot's first run opened **one** grouped PR, not ten. Check
      `https://github.com/UnderMyBed/TarkovGunsmith/network/updates` for the job logs.
- [ ] Those logs show `apps/*` and `packages/*` were scanned, not just the root.
- [ ] Secret-scanning history results reviewed and any findings recorded as follow-up issues.
- [ ] `docs/operations/dependency-residue.md` reflects the post-merge advisory state.
- [ ] `CLAUDE.md`'s roadmap block updated — it still claims "4 of 5 M3 differentiators
      remaining" when all five shipped. Tracked in the spec's §9.
