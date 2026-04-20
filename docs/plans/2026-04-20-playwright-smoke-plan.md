# Playwright Smoke Tests + CI Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Add Playwright smoke tests for every route, plus console-error and font-load assertions. Wire into CI as part of the existing `Typecheck • Lint • Format • Test` job. Update docs so "feature PR = e2e coverage required" is a hard rule.

**Architecture:** Single `apps/web/e2e/smoke.spec.ts` drives Chromium via Playwright's `preview`-backed `webServer`. Per-route load test + `document.fonts.check("1em Bungee")` + console-error listener.

---

## Reference

- **Spec:** `docs/superpowers/specs/2026-04-20-playwright-smoke-design.md`.
- **CI workflow:** `.github/workflows/ci.yml` — a single `ci` job with steps; we append e2e steps there.
- **Why this PR now:** A latent font-loading bug shipped through all 5 M3 PRs because "visual walkthrough deferred" was always checked off without actually walking. This PR closes that loophole.

## Scope decisions

1. **Single spec file (`smoke.spec.ts`)** — easiest to maintain, all routes in one loop.
2. **Chromium only** for v1. No Firefox / WebKit / mobile.
3. **`preview`-backed, not `dev`-backed.** CI runs `pnpm build` then serves `dist/` via `vite preview` on port 4173. Deterministic, close to production.
4. **Console errors fail the test**, no allowlist in v1. If real false positives appear, add a named allowlist with a comment explaining each entry.
5. **No screenshot diffs.** Smoke level only.
6. **CI uses `--with-deps chromium` install.** Accept the ~60s cost; optimize if it becomes painful.
7. **Tests live at `apps/web/e2e/`**, scoped by a dedicated `tsconfig.json` so ESLint's `projectService` sees them.

## File map

```
apps/web/
├── playwright.config.ts           NEW
├── e2e/
│   ├── smoke.spec.ts              NEW
│   └── tsconfig.json              NEW
├── package.json                   MODIFIED — dep + script
└── CLAUDE.md                      MODIFIED — note Playwright conventions

.github/workflows/ci.yml           MODIFIED — install Chromium + run e2e
CLAUDE.md (root)                   MODIFIED — "every feature PR requires e2e coverage" rule
```

Nothing outside these files.

---

## Task 0: Worktree + baseline

```bash
cd ~/TarkovGunsmith
git fetch origin
git worktree add .worktrees/playwright-smoke -b feat/playwright-smoke origin/main
cd .worktrees/playwright-smoke
pnpm install --frozen-lockfile
pnpm --filter "./packages/*" build
pnpm --filter @tarkov/web typecheck && pnpm --filter @tarkov/web lint && pnpm --filter @tarkov/web test
```

Expected: all green.

---

## Task 1: Add Playwright dependency + scripts

**Files:**

- Modify: `apps/web/package.json`

- [ ] **Step 1: Add the dep.**

```bash
pnpm --filter @tarkov/web add -D @playwright/test
```

- [ ] **Step 2: Add scripts to `apps/web/package.json`.** Find the `"scripts"` block and add two entries (adjacent to existing `test` / `preview`):

```json
"test:e2e": "playwright test",
"test:e2e:install": "playwright install --with-deps chromium"
```

- [ ] **Step 3: Verify.**

```bash
pnpm --filter @tarkov/web exec playwright --version
```

- [ ] **Step 4: Commit.**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "build(web): add @playwright/test + test:e2e scripts"
```

---

## Task 2: Playwright config + e2e tsconfig

**Files:**

- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/tsconfig.json`

- [ ] **Step 1: Write `apps/web/playwright.config.ts`.**

```ts
import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
```

- [ ] **Step 2: Write `apps/web/e2e/tsconfig.json`.**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"],
    "lib": ["ES2022", "DOM"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "noEmit": true
  },
  "include": ["**/*.ts"]
}
```

- [ ] **Step 3: Typecheck sanity.**

```bash
pnpm --filter @tarkov/web typecheck
```

- [ ] **Step 4: Commit.**

```bash
git add apps/web/playwright.config.ts apps/web/e2e/tsconfig.json
git commit -m "build(web): Playwright config (preview-backed, Chromium-only)"
```

---

## Task 3: Smoke test suite

**Files:**

- Create: `apps/web/e2e/smoke.spec.ts`

- [ ] **Step 1: Write the suite.**

```ts
import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";

/** Every route we ship today. Keep in sync with __root.tsx nav. */
const ROUTES: ReadonlyArray<{
  path: string;
  /** Text we expect on the loaded page. */ contains: string;
}> = [
  { path: "/", contains: "BUILD THE" },
  { path: "/builder", contains: "NO WEAPON SELECTED" },
  { path: "/calc", contains: "Ballistic" },
  { path: "/matrix", contains: "AmmoVsArmor" },
  { path: "/sim", contains: "Ballistics" },
  { path: "/adc", contains: "Armor Damage" },
  { path: "/aec", contains: "Armor Effectiveness" },
  { path: "/data", contains: "Data" },
  { path: "/charts", contains: "Effectiveness" },
];

/**
 * Attach a console-error listener that fails the test on any `error`-level
 * message during the page's lifetime. Record every error so the failure
 * message is helpful.
 */
function captureConsoleErrors(page: Page): { errors: string[] } {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    errors.push(`pageerror: ${err.message}`);
  });
  return { errors };
}

test.describe("smoke — per-route load", () => {
  for (const route of ROUTES) {
    test(`${route.path} loads without console errors`, async ({ page }) => {
      const { errors } = captureConsoleErrors(page);
      await page.goto(route.path, { waitUntil: "networkidle" });
      await expect(page.getByText(route.contains, { exact: false }).first()).toBeVisible({
        timeout: 10_000,
      });
      expect(errors, `Console errors on ${route.path}:\n${errors.join("\n")}`).toEqual([]);
    });
  }
});

test.describe("smoke — design system", () => {
  test("Bungee display font actually loads (regression guard for the M3 Fonts bug)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const bungeeLoaded = await page.evaluate(() => document.fonts.check("1em Bungee"));
    expect(
      bungeeLoaded,
      "Bungee didn't load. If this fires, the Google Fonts <link> in apps/web/index.html is probably wrong or blocked. M3 regressed on this exact bug — don't let it happen again.",
    ).toBe(true);
  });

  test("Chivo body font actually loads", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const loaded = await page.evaluate(() => document.fonts.check("1em Chivo"));
    expect(loaded).toBe(true);
  });

  test("Azeret Mono numeric font actually loads", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const loaded = await page.evaluate(() => document.fonts.check('1em "Azeret Mono"'));
    expect(loaded).toBe(true);
  });
});
```

- [ ] **Step 2: Install Chromium locally (first time).**

```bash
pnpm --filter @tarkov/web test:e2e:install
```

- [ ] **Step 3: Build the SPA.**

```bash
pnpm --filter @tarkov/web build
```

- [ ] **Step 4: Run the suite.**

```bash
pnpm --filter @tarkov/web test:e2e
```

Expected: 12 tests pass (9 routes + 3 fonts).

If any fail — STOP. Either the expected text on a route is wrong (update `ROUTES`) or we've found a real bug (e.g. the Builder crash the user reported — in which case, note the error text verbatim and report it instead of trying to hide it).

- [ ] **Step 5: Commit.**

```bash
git add apps/web/e2e/smoke.spec.ts
git commit -m "test(web): Playwright smoke suite — per-route + font-load guards"
```

---

## Task 4: Wire Playwright into CI

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Append e2e steps to the existing `ci` job.** After the `Build` step, add:

```yaml
- name: Install Playwright browsers
  run: pnpm --filter @tarkov/web test:e2e:install

- name: E2E smoke tests
  run: pnpm --filter @tarkov/web test:e2e

- name: Upload Playwright trace on failure
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: playwright-trace
    path: apps/web/test-results/
    retention-days: 7
```

The existing required status check `Typecheck • Lint • Format • Test` keeps its name — we don't need to update branch protection because we're appending to the same job.

- [ ] **Step 2: Add gitignore for Playwright outputs.** Check `.gitignore`:

```bash
grep -n "test-results\|playwright-report" .gitignore
```

If not present, append:

```
# Playwright
apps/web/test-results/
apps/web/playwright-report/
```

- [ ] **Step 3: Commit.**

```bash
git add .github/workflows/ci.yml .gitignore
git commit -m "ci: run Playwright smokes on every PR"
```

---

## Task 5: Documentation updates

**Files:**

- Modify: `CLAUDE.md` (root)
- Modify: `apps/web/CLAUDE.md`

- [ ] **Step 1: Add a testing-discipline line to root `CLAUDE.md`.** Find the "How we work here (Tier B)" section and append:

```
### Testing discipline (hard rule)

- **Every feature PR includes e2e coverage.** If the PR adds a new route, `apps/web/e2e/smoke.spec.ts` gets a new entry in the `ROUTES` array. If it adds a user-facing interaction flow worth protecting, a new test file.
- **"Visual walkthrough deferred" is no longer acceptable.** If you can't verify a change works in a browser, you can't ship it. Playwright is the verification mechanism; run it locally with `pnpm --filter @tarkov/web test:e2e` before pushing.
- **Console errors fail the build.** If a real false positive appears, allowlist it in `smoke.spec.ts` with a comment explaining why.
- **Fonts are load-checked.** The Bungee / Chivo / Azeret Mono fonts are part of the contract — changing them means updating the font-load test.
```

- [ ] **Step 2: Add a Playwright section to `apps/web/CLAUDE.md`.** Append:

```
## E2E tests (Playwright)

Smoke-level Chromium tests live at `apps/web/e2e/`. Run:

- `pnpm --filter @tarkov/web test:e2e:install` — first-time browser install.
- `pnpm --filter @tarkov/web test:e2e` — run the suite (builds first? no — build separately or use `pnpm --filter @tarkov/web build` beforehand).

Tests use a `preview`-backed webServer on port 4173. CI runs them as part of the `Typecheck • Lint • Format • Test` job after build. Every route must be represented in `ROUTES` inside `smoke.spec.ts`. Any new route added to `__root.tsx` nav must also be added there.

Fonts are guarded by a separate test using `document.fonts.check("1em <Family>")`. If you change the font stack, update that test.
```

- [ ] **Step 3: Commit.**

```bash
git add CLAUDE.md apps/web/CLAUDE.md
git commit -m "docs: Playwright conventions + feature-PR e2e rule"
```

---

## Task 6: Full verification + push + PR

- [ ] **Step 1: Rebuild from clean.**

```bash
pnpm install --frozen-lockfile
pnpm --filter "./packages/*" build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm --filter @tarkov/web build
pnpm --filter @tarkov/web test:e2e:install
pnpm --filter @tarkov/web test:e2e
```

All exit 0.

If the e2e step reveals real bugs (very plausible — the user reported a Builder error we haven't diagnosed), do NOT hide them. Report the failing test + captured console error verbatim in the PR body as "known failures to fix next." Do not disable failing tests.

- [ ] **Step 2: Push + PR.**

```bash
git push -u origin feat/playwright-smoke
gh pr create --title "test(web): Playwright smoke suite + CI gate + feature-PR rule" --body "$(cat <<'EOF'
## Summary

**Process fix.** M3's font bug shipped because "visual walkthrough" was deferred on every PR body and never executed. This PR closes that loophole.

- Playwright Chromium smoke suite at \`apps/web/e2e/smoke.spec.ts\`.
- Covers every route today (\`/\`, \`/builder\`, \`/calc\`, \`/matrix\`, \`/sim\`, \`/adc\`, \`/aec\`, \`/data\`, \`/charts\`): each one must load, render a known element, and produce zero console errors.
- Three font-load tests (Bungee, Chivo, Azeret Mono) — regression guards for the M3 Fonts bug, with a failure message that names it.
- Wired into the existing \`Typecheck • Lint • Format • Test\` CI job so the required status check now includes e2e. No branch-protection config change needed.
- Root \`CLAUDE.md\` gains a "Testing discipline (hard rule)" section: feature PRs require e2e coverage, console errors fail the build, fonts are load-checked.
- \`apps/web/CLAUDE.md\` documents local + CI usage.
- Spec: \`docs/superpowers/specs/2026-04-20-playwright-smoke-design.md\`.
- Plan: \`docs/plans/2026-04-20-playwright-smoke-plan.md\`.

## Test plan

- [x] \`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm -r build\` — all exit 0.
- [x] \`pnpm --filter @tarkov/web test:e2e\` — all pass locally.
- [ ] CI green on this PR.

## Known failures surfaced by this PR

If Playwright exposes the Builder runtime error the user reported, the relevant test will fail and the error text will appear in the CI logs. Rather than disable the failing test, we'll fix the underlying bug in a follow-up PR immediately after this lands. That's the point — this PR is the diagnostic infrastructure.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Watch CI.**

```bash
gh pr checks --watch
```

If CI fails on a real bug, capture the error from the run logs and open a follow-up PR to fix — don't retry.

- [ ] **Step 4: Merge + cleanup.**

```bash
gh pr merge --squash --auto
cd ~/TarkovGunsmith
git worktree remove .worktrees/playwright-smoke
git branch -D feat/playwright-smoke
git fetch origin --prune
```
