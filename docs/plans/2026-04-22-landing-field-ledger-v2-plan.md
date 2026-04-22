# Landing · Field Ledger v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the live `/` route in line with the approved Field Ledger v2 mockup — fix the sample-build numbers, tighten the hero copy, add an optimizer promo strip and a four-card "WHAT IT DOES" feature grid.

**Architecture:** Single-route refresh on `apps/web/src/routes/index.tsx`. Two new `<section>` elements appended to the existing `<HomePage>`. Two small reusable utility classes (`.tick-rule`, `.bracket`) added to `apps/web/src/styles.css` so they're available for future routes without becoming part of the `@tarkov/ui` public API prematurely. One new Playwright assertion for the promo strip.

**Tech Stack:** React + TanStack Router + Tailwind v4 (arbitrary-value tokens against the `@tarkov/ui` CSS custom properties) + Playwright. Existing `@tarkov/ui` primitives: `Pill`, `Stamp`.

**Spec reference:** `docs/superpowers/specs/2026-04-22-landing-field-ledger-v2-design.md`

**Branch:** `feat/landing-field-ledger-v2` (already created; spec committed as `d5f9a7b`).

---

## File structure

**New files:** none.

**Modified files:**

| Path                            | Change                                                                                                                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/styles.css`       | Add `.tick-rule` and `.bracket` utility classes under the existing "App-specific overrides + utilities" banner. Scoped to the web app; not promoted to `@tarkov/ui` this arc. |
| `apps/web/src/routes/index.tsx` | Meta-row addition (+ `/ QUEST-GATED`), hero copy rewrite, sample-build number corrections, new promo strip `<section>`, new feature-grid `<section>`.                         |
| `apps/web/e2e/smoke.spec.ts`    | One additional `test(...)` in the existing `smoke — per-route load` / `smoke — design system` file that asserts `TRY OPTIMIZER` is visible on `/`.                            |

---

## Task 1: Add `.tick-rule` and `.bracket` utility classes

**Files:**

- Modify: `apps/web/src/styles.css`

**Purpose:** Set up two tiny reusable CSS utilities the new sections need. `.tick-rule` is a repeating-gradient divider (design system idiom); `.bracket` puts amber corner-L marks on a card via `::before` and `::after`. Both mirror what the archived mockup (`docs/design/field-ledger-v2/index.html`) uses.

- [ ] **Step 1: Open `apps/web/src/styles.css` and append the utilities**

The current contents of the file are exactly:

```css
@import "@tarkov/ui/styles.css";

/* App-specific overrides + utilities go below this line. */
html,
body,
#root {
  height: 100%;
  margin: 0;
  padding: 0;
}
```

Append the following block _after_ the `html, body, #root` rule, so the whole file ends with:

```css
@import "@tarkov/ui/styles.css";

/* App-specific overrides + utilities go below this line. */
html,
body,
#root {
  height: 100%;
  margin: 0;
  padding: 0;
}

/* ────────────────────────────────────────────────────────────
   Field Ledger v2 — route-local utilities
   (Lifted from the design canvas. Promote to @tarkov/ui when a
   second route needs either one.)
   ──────────────────────────────────────────────────────────── */

.tick-rule {
  height: 12px;
  background-image: linear-gradient(to right, var(--color-border) 1px, transparent 1px);
  background-size: 12px 12px;
  background-repeat: repeat-x;
  background-position: bottom;
}

.bracket {
  position: relative;
  border: 1px solid var(--color-border);
  background: var(--color-card, var(--color-background));
}
.bracket::before,
.bracket::after {
  content: "";
  position: absolute;
  width: 14px;
  height: 14px;
  border: 2px solid var(--color-primary);
  pointer-events: none;
}
.bracket::before {
  top: -1px;
  left: -1px;
  border-right: 0;
  border-bottom: 0;
}
.bracket::after {
  bottom: -1px;
  right: -1px;
  border-left: 0;
  border-top: 0;
}
```

- [ ] **Step 2: Run format + lint to confirm no regressions**

```bash
pnpm --filter @tarkov/web exec prettier --check src/styles.css
pnpm lint
```

Expected: both clean. (Lint doesn't touch CSS directly, but this confirms nothing else broke.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/styles.css
git commit -m "feat(web): tick-rule + bracket utility classes for Field Ledger v2"
```

---

## Task 2: Update hero — meta row, copy, sample-build numbers

**Files:**

- Modify: `apps/web/src/routes/index.tsx`

**Purpose:** The three non-structural delta items from the spec — update the meta row (fourth chip), rewrite the hero paragraph, fix the sample-build fixture numbers.

- [ ] **Step 1: Update the meta row**

Find this block (currently around line 14–18 of `apps/web/src/routes/index.tsx`):

```tsx
<div className="flex gap-4 font-mono text-[11px] tracking-[0.22em] uppercase text-[var(--color-paper-dim)] mb-6 flex-wrap">
  <span>WEAPON · MODS · PROFILE</span>
  <span>/ LIVE RECOMPUTE</span>
  <span>/ SHARE URL</span>
</div>
```

Replace with:

```tsx
<div className="flex gap-4 font-mono text-[11px] tracking-[0.22em] uppercase text-[var(--color-paper-dim)] mb-6 flex-wrap">
  <span>WEAPON · MODS · PROFILE</span>
  <span>/ LIVE RECOMPUTE</span>
  <span>/ SHAREABLE URL</span>
  <span>/ QUEST-GATED</span>
</div>
```

(Two changes: `SHARE URL` → `SHAREABLE URL` to match the mockup, and a new fourth `<span>` for `QUEST-GATED`.)

- [ ] **Step 2: Replace the hero body paragraph**

Find this block (currently around line 26–32):

```tsx
<p className="mt-6 max-w-[560px] text-lg text-[var(--color-muted-foreground)]">
  TarkovGunsmith rebuilds the defunct community tool for Escape from Tarkov ballistics. The{" "}
  <strong className="text-[var(--color-foreground)]">Weapon Builder</strong> is the core: pick a
  weapon, walk the slot tree, attach mods, watch ergo / recoil / accuracy / weight recompute live —
  gated by your trader LLs and quest progress, and shareable by URL.
</p>
```

Replace with:

```tsx
<p className="mt-6 max-w-[560px] text-lg text-[var(--color-muted-foreground)]">
  Pick a weapon, walk the slot tree, attach mods — ergo, recoil, accuracy and weight recompute live,
  gated by your trader levels and quest progress.{" "}
  <strong className="text-[var(--color-foreground)]">Share any build by URL.</strong>
</p>
```

(Note the `{" "}` between the period and `<strong>` — keeps the visible space that JSX would otherwise collapse.)

- [ ] **Step 3: Fix the sample-build `HeroStat` values**

Find this block (currently around line 73–78):

```tsx
<dl className="grid grid-cols-2 gap-4">
  <HeroStat label="ERGONOMICS" value="72" delta="+18" deltaTone="up" />
  <HeroStat label="RECOIL V" value="151" delta="−34%" deltaTone="up" />
  <HeroStat label="WEIGHT" value="3.24" suffix="kg" delta="+0.80" deltaTone="down" />
  <HeroStat label="ACCURACY" value="2.1" suffix="MoA" />
</dl>
```

Replace with:

```tsx
<dl className="grid grid-cols-2 gap-4">
  <HeroStat label="ERGONOMICS" value="72" delta="+25" deltaTone="up" />
  <HeroStat label="RECOIL V" value="37" delta="−34%" deltaTone="up" />
  <HeroStat label="WEIGHT" value="3.90" suffix="kg" delta="+0.80" deltaTone="down" />
  <HeroStat label="ACCURACY" value="2.1" suffix="MoA" />
</dl>
```

(Three value swaps: ergo delta `+18` → `+25`, recoil-v value `151` → `37`, weight value `3.24` → `3.90`. Accuracy row unchanged.)

- [ ] **Step 4: Run typecheck + format**

```bash
pnpm --filter @tarkov/web exec prettier --write src/routes/index.tsx
pnpm --filter @tarkov/web typecheck
```

Expected: prettier reports one file changed (or unchanged if already clean), typecheck passes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/index.tsx
git commit -m "feat(web): landing hero copy + sample-build fixture alignment"
```

---

## Task 3: Add the optimizer promo strip

**Files:**

- Modify: `apps/web/src/routes/index.tsx`

**Purpose:** New `<section>` below the hero announcing the optimizer as a near-ship differentiator. Amber-bordered, tinted background, three-column grid (eyebrow · pitch · CTAs).

- [ ] **Step 1: Insert the promo strip after the hero section**

Find the closing `</section>` of the hero (currently around line 85, right after the `</div>` that closes `border-l border-[var(--color-border)] pl-8 flex flex-col gap-5`). Insert the new section _between_ that closing `</section>` and the `</div>` that closes the top-level `<div className="flex flex-col gap-8">`.

The new section:

```tsx
{
  /* ─── optimizer promo strip ─── */
}
<section
  aria-label="Optimizer — new feature"
  className="border border-[var(--color-primary)] bg-[rgba(245,158,11,0.06)] grid gap-6 px-6 py-5 items-center sm:grid-cols-[auto_1fr_auto]"
>
  <div className="flex flex-col gap-1">
    <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-primary)]">
      ◇ NEW · OPTIMIZER
    </span>
    <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-muted-foreground)]">
      BRANCH-AND-BOUND · EXACT
    </span>
  </div>
  <div>
    <div className="font-display text-[20px] leading-tight text-[var(--color-foreground)]">
      Set a budget. Pick an objective. The solver picks the mods.
    </div>
    <div className="mt-1 font-mono text-[12px] leading-[1.5] text-[var(--color-muted-foreground)]">
      Pin any slot to keep fixed. Respects your trader LLs and flea status. Pure-TS, runs
      client-side.
    </div>
  </div>
  <div className="flex gap-2">
    <Link
      to="/builder"
      className="inline-flex items-center gap-2 border border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-mono text-[11px] font-semibold tracking-[0.14em] uppercase h-8 px-3 hover:bg-[var(--color-amber-deep)] hover:border-[var(--color-amber-deep)] hover:text-[var(--color-foreground)] transition-colors"
    >
      Try Optimizer
    </Link>
    <Link
      to="/builder"
      className="inline-flex items-center gap-2 border border-transparent text-[var(--color-muted-foreground)] font-mono text-[11px] tracking-[0.14em] uppercase h-8 px-3 hover:text-[var(--color-primary)] transition-colors"
    >
      Learn More
    </Link>
  </div>
</section>;
```

(The `sm:grid-cols-[auto_1fr_auto]` prefix keeps the promo strip stacked on small screens and only becomes three columns at `sm` breakpoint and up. This matches the existing file's responsive instincts.)

- [ ] **Step 2: Format, typecheck**

```bash
pnpm --filter @tarkov/web exec prettier --write src/routes/index.tsx
pnpm --filter @tarkov/web typecheck
```

Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/index.tsx
git commit -m "feat(web): landing optimizer promo strip"
```

---

## Task 4: Add "WHAT IT DOES" feature grid

**Files:**

- Modify: `apps/web/src/routes/index.tsx`

**Purpose:** Four bracket-cornered cards below the promo strip, preceded by a tick-rule divider with a `WHAT IT DOES` label cutting through it.

- [ ] **Step 1: Insert the feature grid after the promo strip**

Insert immediately after the `</section>` that closes the promo strip (from Task 3), still inside the outer `<div className="flex flex-col gap-8">`:

```tsx
{
  /* ─── what it does ─── */
}
<section aria-label="What TarkovGunsmith does">
  <div className="relative mb-5">
    <div className="tick-rule" />
    <span className="absolute -top-1.5 left-3 bg-[var(--color-background)] px-2 font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-muted-foreground)]">
      WHAT IT DOES
    </span>
  </div>
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {[
      {
        n: "01",
        title: "BUILDER",
        body: "Slot tree editor with availability gating and live recompute.",
      },
      {
        n: "02",
        title: "OPTIMIZER",
        body: "Solve for min-recoil, max-ergo, min-weight or max-accuracy.",
      },
      {
        n: "03",
        title: "COMPARE",
        body: "Diff two builds, stat-by-stat, mod-by-mod.",
      },
      {
        n: "04",
        title: "SHARE",
        body: "Every build lives at a URL. Import on any device.",
      },
    ].map((f) => (
      <div key={f.n} className="bracket p-5">
        <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-primary)]">
          {f.n}
        </div>
        <div className="font-display text-[20px] mt-2">{f.title}</div>
        <div className="mt-3 font-mono text-[12px] leading-[1.5] text-[var(--color-muted-foreground)]">
          {f.body}
        </div>
      </div>
    ))}
  </div>
</section>;
```

(The `bracket` class is the one added to `apps/web/src/styles.css` in Task 1. `p-5` is Tailwind for 20px padding, matching the design mockup.)

- [ ] **Step 2: Format + typecheck + unit tests**

```bash
pnpm --filter @tarkov/web exec prettier --write src/routes/index.tsx
pnpm --filter @tarkov/web typecheck
pnpm --filter @tarkov/web test
```

Expected: all clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/index.tsx
git commit -m "feat(web): landing WHAT IT DOES feature grid"
```

---

## Task 5: Playwright smoke assertion for the new promo strip

**Files:**

- Modify: `apps/web/e2e/smoke.spec.ts`

**Purpose:** Lock in that the optimizer promo strip is present on `/`. The existing per-route loop already asserts `"BUILD THE"` is visible — this adds a second, more specific assertion so a regression on the new sections fails loudly.

- [ ] **Step 1: Add a new test inside `smoke — design system`**

Find this block in `apps/web/e2e/smoke.spec.ts` (currently around line 60–70):

```ts
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
```

Immediately after the existing Bungee-loads test (preserve that test's closing `});`), append a new test as a sibling:

```ts
test("landing shows the optimizer promo strip + feature grid", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByText("Try Optimizer", { exact: false })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("WHAT IT DOES", { exact: false })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("BUILDER", { exact: true }).first()).toBeVisible({
    timeout: 10_000,
  });
});
```

(The third assertion uses `exact: true` and `.first()` because `BUILDER` also appears in the nav — we just need at least one match.)

- [ ] **Step 2: Run the e2e suite locally**

```bash
pnpm --filter @tarkov/web build
pnpm --filter @tarkov/web test:e2e
```

Expected: all tests green, including the new `landing shows the optimizer promo strip + feature grid` test.

(If `test:e2e:install` has never been run on this machine, run `pnpm --filter @tarkov/web test:e2e:install` once first. Per `apps/web/CLAUDE.md`.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/smoke.spec.ts
git commit -m "test(web): smoke assertion for landing optimizer promo + feature grid"
```

---

## Task 6: Full local gate, visual walkthrough, PR

**Files:**

- None (gate + push + PR).

- [ ] **Step 1: Run the full local gate**

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

All four must pass. Fix and re-commit on the same branch if anything fails — CI runs the same gate on push.

- [ ] **Step 2: Visual walkthrough**

```bash
pnpm --filter @tarkov/web dev
# Open http://localhost:5173/
```

Confirm in the browser:

- Meta row shows four chips ending with `/ QUEST-GATED`.
- Hero paragraph no longer mentions "rebuild of the defunct TarkovGunsmith"; ends with bolded `Share any build by URL.`
- Sample build shows `72 +25 / 37 −34% / 3.90 +0.80 kg / 2.1 MoA`.
- Below the hero: amber-bordered promo strip with `◇ NEW · OPTIMIZER`, the pitch line, and `Try Optimizer` + `Learn More` buttons. Both buttons navigate to `/builder` when clicked.
- Below the promo strip: a tick-rule divider with `WHAT IT DOES` cutting through it.
- Four bracket-cornered cards: BUILDER / OPTIMIZER / COMPARE / SHARE, each with `01`/`02`/`03`/`04` amber eyebrow + Bungee title + mono description.
- Nothing else on the landing changed (nav, hero left/right columns, existing buttons).

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin feat/landing-field-ledger-v2
```

Then:

```bash
gh pr create --title "feat(web): landing Field Ledger v2 — promo strip + feature grid" --body "$(cat <<'EOF'
## Summary

Arc 1 of the Field Ledger v2 rollout. Refreshes the `/` route to match the approved design (`docs/design/field-ledger-v2/index.html`):

- Meta row: adds `/ QUEST-GATED`, renames `SHARE URL` → `SHAREABLE URL`.
- Hero copy: drops the "rebuild of the defunct" framing; reads as pure action now.
- Sample-build card: fixes the fixture numbers (ergo `+18` → `+25`, recoil-v `151` → `37`, weight `3.24` → `3.90`).
- New: amber-bordered optimizer promo strip (`◇ NEW · OPTIMIZER`) with `Try Optimizer` + `Learn More` CTAs pointing at `/builder`.
- New: `WHAT IT DOES` tick-rule + four bracket-cornered cards (BUILDER / OPTIMIZER / COMPARE / SHARE).
- Adds two tiny route-local utilities (`.tick-rule`, `.bracket`) to `apps/web/src/styles.css`.
- Playwright smoke assertion for the new promo strip + feature grid.

Spec: [`docs/superpowers/specs/2026-04-22-landing-field-ledger-v2-design.md`](docs/superpowers/specs/2026-04-22-landing-field-ledger-v2-design.md).
Plan: [`docs/plans/2026-04-22-landing-field-ledger-v2-plan.md`](docs/plans/2026-04-22-landing-field-ledger-v2-plan.md).

## Change type

- [x] New feature (`feat:`)

## Test plan

- [x] `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` green locally.
- [x] `pnpm --filter @tarkov/web test:e2e` green locally; new `landing shows the optimizer promo strip + feature grid` assertion passes.
- [x] Visual walkthrough — all six checklist items from the plan's Task 6 Step 2 confirmed in a browser.

## Deliberately NOT in this PR

- No `@tarkov/ui` primitives extracted yet — `.tick-rule` / `.bracket` stay app-local until Arc 2 needs them elsewhere.
- No builder / optimizer / nav changes; those land in Arc 2 (full-page diff view).
- `Try Optimizer` and `Learn More` both link to `/builder`. Dedicated optimizer destination follows in Arc 2.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Watch CI and merge**

```bash
gh pr checks --watch
# When green:
gh pr merge --squash --delete-branch
```

Per branch protection, CI must pass before merge. Per user preference, autonomous merge is approved for arcs with approved spec + plan.

---

## Rollback notes

If something on the live site looks off after merge and the next release-please PR ships the change, revert is just `git revert <squash-sha>` and a fresh release PR. Every change in this PR is in `apps/web/src/routes/index.tsx` + `apps/web/src/styles.css` + `apps/web/e2e/smoke.spec.ts` — no migration, no data, no runtime state.

## Follow-up items (tracked outside this plan, per spec)

- Arc 2 — full-page optimizer diff view.
- Retarget `Try Optimizer` / `Learn More` links once Arc 2 ships.
- Extract `.tick-rule` and `.bracket` into `@tarkov/ui` if a second route reuses either.
- Write a short optimizer docs / explainer page and point `Learn More` there.
