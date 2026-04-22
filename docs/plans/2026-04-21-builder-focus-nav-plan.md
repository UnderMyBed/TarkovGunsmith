# Builder-focus nav + WIP banners — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-04-21-builder-focus-nav-design.md`](../superpowers/specs/2026-04-21-builder-focus-nav-design.md)

**Goal:** Shrink the top nav to `Builder` + `Calc ▾` + `Data ▾` (two dropdowns), add a persistent WIP banner to the seven non-Builder routes, and strip the tool-card grids off the landing page.

**Architecture:** Two new primitives in `apps/web/src/features/nav/` — a click-open popover (`NavDropdown`) and a presentational status banner (`WipBanner`). No new deps, no route moves, no schema changes. One Playwright smoke covers both primitives.

**Tech Stack:** React 19, TanStack Router (existing), Tailwind v4 (existing), `@tarkov/ui` primitives (existing).

**Rollout:** ONE PR — `feat/m3-builder-focus-nav` off `origin/main`. Four commits corresponding to Phase B/C/D/E below.

---

## File map

**New files (2):**

| Path                                         | Purpose                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| `apps/web/src/features/nav/nav-dropdown.tsx` | Click-open dropdown trigger + panel. Generic over a passed `items` array. |
| `apps/web/src/features/nav/wip-banner.tsx`   | Persistent "▲ WIP — subject to change…" banner. Presentational, no props. |

**Modified files (9):**

| Path                             | What changes                                                                                                                                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/routes/__root.tsx` | Replace the flat `NAV_ITEMS` array + flat `<nav>` mapping with Builder link + two `<NavDropdown>`s.                                                                                                   |
| `apps/web/src/routes/index.tsx`  | Delete `BALLISTICS_CARDS`, `DATA_CARDS`, `ToolCard` interface, `ToolCardView` component, the two `<SectionTitle>` headers, and the two `<section className="grid ...">` blocks. Clean unused imports. |
| `apps/web/src/routes/calc.tsx`   | Add `<WipBanner />` as first child of the page root.                                                                                                                                                  |
| `apps/web/src/routes/matrix.tsx` | Same.                                                                                                                                                                                                 |
| `apps/web/src/routes/sim.tsx`    | Same.                                                                                                                                                                                                 |
| `apps/web/src/routes/adc.tsx`    | Same.                                                                                                                                                                                                 |
| `apps/web/src/routes/aec.tsx`    | Same.                                                                                                                                                                                                 |
| `apps/web/src/routes/data.tsx`   | Same.                                                                                                                                                                                                 |
| `apps/web/src/routes/charts.tsx` | Same.                                                                                                                                                                                                 |
| `apps/web/e2e/smoke.spec.ts`     | Append 2 new assertions at the bottom: dropdown open-and-navigate, WIP banner visible on `/calc`.                                                                                                     |

---

## Phase A — Setup

### Task 1: Worktree

- [ ] **Step 1: Create worktree off origin/main**

```bash
cd ~/TarkovGunsmith
git fetch origin main
git worktree add .worktrees/builder-focus -b feat/m3-builder-focus-nav origin/main
cd .worktrees/builder-focus
pnpm install --frozen-lockfile
pnpm --filter "./packages/*" build
```

- [ ] **Step 2: Baseline green**

```bash
pnpm typecheck
pnpm test
```

Expected: all existing tests pass. Note the counts for later comparison.

---

## Phase B — NavDropdown + top nav rewrite

Commit 1: `feat(web): NavDropdown primitive + Calc/Data dropdowns in top nav`.

### Task 2: NavDropdown primitive

**Files:**

- Create: `apps/web/src/features/nav/nav-dropdown.tsx`

No unit tests — per spec §2 non-goal. Playwright covers the click-open-navigate flow.

- [ ] **Step 1: Write the primitive**

```tsx
// apps/web/src/features/nav/nav-dropdown.tsx
import { useEffect, useRef, useState, type ReactElement } from "react";
import { Link } from "@tanstack/react-router";

export interface NavDropdownItem {
  readonly to: string;
  readonly label: string;
}

export interface NavDropdownProps {
  readonly label: string;
  readonly items: readonly NavDropdownItem[];
}

/**
 * Click-open dropdown trigger with a menu panel below it. Closes on Escape,
 * click outside the trigger+menu, click on a link (navigation dismisses),
 * or click on the trigger itself while open.
 *
 * Matches the flat-nav link styling (Azeret Mono 11px, 0.18em tracking,
 * uppercase, amber on hover). The menu panel uses the Field Ledger
 * amber-top-border + warm-black card pattern.
 */
export function NavDropdown({ label, items }: NavDropdownProps): ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent): void => {
      const root = rootRef.current;
      if (root === null) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      setOpen(false);
    };
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] border-b-[1.5px] border-transparent pb-[2px] transition-colors inline-flex items-center gap-1.5"
      >
        <span>{label}</span>
        <span
          aria-hidden
          className={`text-[8px] leading-none transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-2 min-w-[220px] border border-[var(--color-border)] border-t-[3px] border-t-[var(--color-primary)] bg-[var(--color-card)] py-2 shadow-lg"
        >
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              role="menuitem"
              onClick={() => setOpen(false)}
              activeProps={{
                className:
                  "block px-4 py-1.5 font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-primary)] hover:bg-[var(--color-muted)]",
              }}
              className="block px-4 py-1.5 font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
pnpm --filter @tarkov/web typecheck
pnpm --filter @tarkov/web exec eslint src/features/nav/nav-dropdown.tsx
```

Expected: both clean.

### Task 3: Integrate dropdowns into `__root.tsx`

**Files:**

- Modify: `apps/web/src/routes/__root.tsx`

Current file has a flat `NAV_ITEMS` array and a simple `.map()` in the `<nav>`. Replace both.

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `apps/web/src/routes/__root.tsx` with:

```tsx
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { NavDropdown, type NavDropdownItem } from "../features/nav/nav-dropdown.js";

export const Route = createRootRoute({
  component: RootLayout,
});

const CALC_ITEMS: readonly NavDropdownItem[] = [
  { to: "/calc", label: "Calc" },
  { to: "/sim", label: "Simulator" },
  { to: "/adc", label: "Armor Damage" },
  { to: "/aec", label: "Armor Effectiveness" },
];

const DATA_ITEMS: readonly NavDropdownItem[] = [
  { to: "/matrix", label: "Ammo × Armor Matrix" },
  { to: "/data", label: "Datasheets" },
  { to: "/charts", label: "Charts" },
];

function RootLayout() {
  return (
    <div className="min-h-full bg-[var(--color-background)] text-[var(--color-foreground)]">
      <div className="h-[2px] bg-[var(--color-foreground)]" aria-hidden />
      <header className="border-b border-[var(--color-border)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link to="/" className="flex items-center gap-3">
            <span aria-hidden className="text-[var(--color-primary)] text-lg leading-none">
              ▲
            </span>
            <span className="font-display text-lg leading-none tracking-wide">TARKOVGUNSMITH</span>
            <span className="hidden sm:inline font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-paper-dim)]">
              · FIELD LEDGER / v2
            </span>
          </Link>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link
              to="/builder"
              activeProps={{
                className:
                  "text-[var(--color-primary)] border-b-[1.5px] border-[var(--color-primary)]",
              }}
              className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] border-b-[1.5px] border-transparent pb-[2px] transition-colors"
            >
              Builder
            </Link>
            <NavDropdown label="Calc" items={CALC_ITEMS} />
            <NavDropdown label="Data" items={DATA_ITEMS} />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Outlet />
      </main>
      <footer className="mt-24 border-t border-[var(--color-border)]">
        <div className="mx-auto max-w-6xl px-6 py-6 flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-paper-dim)]">
          <span>TARKOVGUNSMITH · REBUILD OF XERXES-17&rsquo;S ORIGINAL</span>
          <span>
            EDITION 2026 ·{" "}
            <a
              href="https://github.com/UnderMyBed/TarkovGunsmith"
              target="_blank"
              rel="noreferrer"
              className="text-[var(--color-primary)] hover:underline"
            >
              GitHub ↗
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
pnpm --filter @tarkov/web typecheck
pnpm --filter @tarkov/web exec eslint src/routes/__root.tsx
```

Expected: both clean.

- [ ] **Step 3: Existing Playwright smoke still passes**

```bash
pnpm --filter @tarkov/web build
pnpm --filter @tarkov/web test:e2e -- --grep "smoke — per-route load"
```

Per-route smoke uses `page.goto(...)` directly (not nav clicks), so nothing should break.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/nav/nav-dropdown.tsx apps/web/src/routes/__root.tsx
git commit -m "feat(web): NavDropdown primitive + Calc/Data dropdowns in top nav"
```

---

## Phase C — WipBanner + apply to 7 routes

Commit 2: `feat(web): WipBanner primitive + add to 7 WIP routes`.

### Task 4: WipBanner primitive

**Files:**

- Create: `apps/web/src/features/nav/wip-banner.tsx`

- [ ] **Step 1: Write the primitive**

```tsx
// apps/web/src/features/nav/wip-banner.tsx
import type { ReactElement } from "react";
import { Link } from "@tanstack/react-router";

/**
 * Persistent status banner shown at the top of every non-Builder route.
 * Not dismissible — it's a status marker, not a prompt. Design parity with
 * the TarkovTracker sync banner (amber 3px left border, warm-black card).
 */
export function WipBanner(): ReactElement {
  return (
    <div className="mb-6 flex items-baseline gap-3 border border-[var(--color-border)] border-l-[3px] border-l-[var(--color-primary)] bg-[var(--color-card)] px-4 py-2.5">
      <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--color-primary)]">
        ▲ WIP
      </span>
      <span className="text-sm text-[var(--color-muted-foreground)]">
        Subject to change or removal. Focus is on the{" "}
        <Link
          to="/builder"
          className="text-[var(--color-foreground)] underline decoration-[var(--color-primary)] underline-offset-2"
        >
          Builder
        </Link>
        .
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
pnpm --filter @tarkov/web typecheck
pnpm --filter @tarkov/web exec eslint src/features/nav/wip-banner.tsx
```

Expected: clean.

### Task 5: Add `<WipBanner />` to 7 routes

**Files to modify (identical pattern, one import + one JSX element each):**

- `apps/web/src/routes/calc.tsx`
- `apps/web/src/routes/matrix.tsx`
- `apps/web/src/routes/sim.tsx`
- `apps/web/src/routes/adc.tsx`
- `apps/web/src/routes/aec.tsx`
- `apps/web/src/routes/data.tsx`
- `apps/web/src/routes/charts.tsx`

Every target route exports a `*Page` component that returns a root JSX element. Add the banner as the first child of that root.

- [ ] **Step 1: For each of the 7 files — add the import**

Append to the existing import block (after the existing `@tarkov/ui` or feature imports, alphabetical doesn't matter; match the file's existing convention):

```tsx
import { WipBanner } from "../features/nav/wip-banner.js";
```

- [ ] **Step 2: For each of the 7 files — insert `<WipBanner />` as the first child of the page's returned root element**

Example — if the file currently ends with:

```tsx
function CalcPage() {
  // ...
  return (
    <div className="flex flex-col gap-6">
      <Card>...</Card>
      ...
    </div>
  );
}
```

Change to:

```tsx
function CalcPage() {
  // ...
  return (
    <div className="flex flex-col gap-6">
      <WipBanner />
      <Card>...</Card>
      ...
    </div>
  );
}
```

If the root is a fragment (`<>...</>`) or a `<section>`, the same rule applies — `<WipBanner />` is the first child.

- [ ] **Step 3: Typecheck + lint**

```bash
pnpm --filter @tarkov/web typecheck
pnpm --filter @tarkov/web exec eslint src/features/nav/wip-banner.tsx src/routes/calc.tsx src/routes/matrix.tsx src/routes/sim.tsx src/routes/adc.tsx src/routes/aec.tsx src/routes/data.tsx src/routes/charts.tsx
```

Expected: all clean.

- [ ] **Step 4: Existing tests still pass**

```bash
pnpm --filter @tarkov/web test
```

Expected: same pre-change test count (no regressions).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/nav/wip-banner.tsx apps/web/src/routes/calc.tsx apps/web/src/routes/matrix.tsx apps/web/src/routes/sim.tsx apps/web/src/routes/adc.tsx apps/web/src/routes/aec.tsx apps/web/src/routes/data.tsx apps/web/src/routes/charts.tsx
git commit -m "feat(web): WipBanner primitive + add to 7 WIP routes"
```

---

## Phase D — Landing cleanup

Commit 3: `feat(web): remove tool-card grids from landing — Builder focus`.

### Task 6: Strip tool-card grids from `apps/web/src/routes/index.tsx`

**Files:**

- Modify: `apps/web/src/routes/index.tsx`

Delete — per spec §6:

1. `interface ToolCard` (lines ~17-22 in current file).
2. `const BALLISTICS_CARDS: readonly ToolCard[] = [...]` array and its 4 entries.
3. `const DATA_CARDS: readonly ToolCard[] = [...]` array and its 3 entries.
4. `function ToolCardView(...) { ... }` — verify it's only used by the two grids below. If so, delete it.
5. The two `<SectionTitle index={...} title="BALLISTICS TOOLS"... />` / `title="REFERENCE + DATA"...` elements.
6. The two `<section className="grid...">` blocks that render `BALLISTICS_CARDS.map(...)` and `DATA_CARDS.map(...)`.

Keep — the hero `<section>` and everything inside it (`HeroStat`, `<Link to="/builder">` CTA, the sample build readout with `Pill` / `Stamp`).

- [ ] **Step 1: Open the file and identify blocks to remove**

```bash
grep -n "BALLISTICS_CARDS\|DATA_CARDS\|ToolCard\|SectionTitle\|ToolCardView" apps/web/src/routes/index.tsx
```

This lists every line that touches the to-be-removed constructs. Review in the editor.

- [ ] **Step 2: Remove the blocks**

Delete:

- The `interface ToolCard { ... }` block.
- The `const BALLISTICS_CARDS: readonly ToolCard[] = [ ... ];` declaration with all 4 entries.
- The `const DATA_CARDS: readonly ToolCard[] = [ ... ];` declaration with all 3 entries.
- Inside `HomePage`'s return, the two comment-delimited sections:
  - `{/* ─── ballistics tools ─── */} <SectionTitle .../> <section ...>...</section>`
  - `{/* ─── data + charts ─── */} <SectionTitle .../> <section ...>...</section>`
- The `function ToolCardView({ card }: ...) { ... }` declaration further down the file.

- [ ] **Step 3: Clean unused imports**

After removal, run:

```bash
pnpm --filter @tarkov/web typecheck
```

Read the output for "declared but never used" or "unused import" errors. Remove `SectionTitle` from the `@tarkov/ui` import if it's no longer referenced. Remove `Card`, `CardContent`, `CardDescription`, `CardHeader`, `CardTitle` individually if any of them are no longer used by the hero. `Pill` and `Stamp` are used by the hero — keep those.

- [ ] **Step 4: Verify the hero still renders**

```bash
pnpm --filter @tarkov/web build
pnpm --filter @tarkov/web test -- index
```

Expected: build succeeds, no test regressions. If `index` has no matching test file, the test suite just reports "no tests matched" — that's fine.

- [ ] **Step 5: Lint the changed file**

```bash
pnpm --filter @tarkov/web exec eslint src/routes/index.tsx
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/index.tsx
git commit -m "feat(web): remove tool-card grids from landing — Builder focus"
```

---

## Phase E — Playwright smoke

Commit 4: `test(web): Playwright smoke — dropdown open + WIP banner visible`.

### Task 7: Extend `smoke.spec.ts`

**Files:**

- Modify: `apps/web/e2e/smoke.spec.ts`

Read the existing file first to understand the `captureConsoleErrors` helper and the `test.describe(...)` convention. Append two new assertions — one new `test.describe` block at the bottom.

- [ ] **Step 1: Write the new tests**

Append to the bottom of `apps/web/e2e/smoke.spec.ts`:

```ts
test.describe("smoke — Builder-focus nav + WIP banners", () => {
  test("Calc dropdown opens and navigates to /sim", async ({ page }) => {
    const { errors } = captureConsoleErrors(page);
    await page.goto("/", { waitUntil: "networkidle" });

    // Open the Calc dropdown.
    await page.getByRole("button", { name: "Calc", exact: true }).click();

    // Menu should appear with a Simulator link.
    const simLink = page.getByRole("menuitem", { name: "Simulator" });
    await expect(simLink).toBeVisible({ timeout: 5_000 });

    // Clicking the link navigates.
    await simLink.click();
    await expect(page).toHaveURL(/\/sim$/);

    expect(errors, `Console errors on dropdown navigation:\n${errors.join("\n")}`).toEqual([]);
  });

  test("/calc shows the WIP banner", async ({ page }) => {
    const { errors } = captureConsoleErrors(page);
    await page.goto("/calc", { waitUntil: "networkidle" });
    await expect(page.getByText(/Subject to change or removal/)).toBeVisible();
    expect(errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Build + run the full e2e suite**

```bash
pnpm --filter @tarkov/web build
pnpm --filter @tarkov/web test:e2e
```

Expected: full suite green + 2 new tests pass.

Possible failure modes and fixes:

- **Dropdown button not found by name.** If Playwright can't find `getByRole("button", { name: "Calc", exact: true })`, inspect the button accessible name — maybe the caret text (`▾`) is bleeding in because it's not aria-hidden. The primitive in Task 2 sets `aria-hidden` on the caret span; if the test still fails, explicitly use `page.locator('button[aria-haspopup="menu"]:has-text("Calc")')`.
- **Menuitem not found.** The primitive uses `role="menuitem"` on each `<Link>`. Confirm TanStack Router's `<Link>` passes through the `role` prop. If not, switch the assertion to `page.getByRole("menu").getByText("Simulator")`.
- **Console error about "role=menuitem" needing a parent role=menu** — benign a11y advisory from some browsers. Allowlist it if needed; the parent DOES have `role="menu"`, so the error is a false positive and you should investigate rather than silence.

STOP and report BLOCKED if failures persist beyond the above patches.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/smoke.spec.ts
git commit -m "test(web): Playwright smoke — dropdown open + WIP banner visible"
```

---

## Phase F — Wrap

### Task 8: Full verification + PR

- [ ] **Step 1: Full repo verification**

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm --filter @tarkov/web build
pnpm --filter @tarkov/web test:e2e
```

All green.

- [ ] **Step 2: Push + open PR**

```bash
git push -u origin feat/m3-builder-focus-nav
gh pr create --title "feat(web): Builder-focus nav — dropdowns + WIP banners + landing cleanup" --body "$(cat <<'EOF'
## Summary

Post-M3 polish — emphasize the Builder on the top nav, mark the other seven routes as WIP, and strip the now-redundant tool-card grids from the landing.

- **New `NavDropdown` primitive** — click-open popover with Escape / outside-click / link-click dismissal, ARIA attributes, and Field Ledger styling.
- **Top nav** shrinks from 8 flat items to `Builder` + `Calc ▾` + `Data ▾`. Calc: Calc, Simulator, Armor Damage, Armor Effectiveness. Data: Ammo × Armor Matrix, Datasheets, Charts.
- **New `WipBanner` primitive** — persistent `▲ WIP — subject to change or removal` status banner with an amber left border. Not dismissible.
- **Banner applied** to `/calc`, `/matrix`, `/sim`, `/adc`, `/aec`, `/data`, `/charts`.
- **Landing** loses the two tool-card grids (`BALLISTICS_CARDS` + `DATA_CARDS`) plus their `SectionTitle` headers. The space below the hero is deliberately empty — reserved for future replacement.
- **Playwright smoke** — dropdown open + navigate, WIP banner visible.

No schema changes. No route moves. URLs preserved.

Spec: \`docs/superpowers/specs/2026-04-21-builder-focus-nav-design.md\`.
Plan: \`docs/plans/2026-04-21-builder-focus-nav-plan.md\`.

## Test plan

- [x] \`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test\` green
- [x] 2 new Playwright assertions green (dropdown navigate, WIP banner visible)
- [x] Full e2e suite green (no regressions on existing 22 tests)
- [ ] After release: visit prod and confirm landing looks clean + dropdowns work + WIP banners render on the 7 routes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for CI green, merge**

```bash
gh pr checks --watch
gh pr merge --squash
```

- [ ] **Step 4: Cleanup**

```bash
cd ~/TarkovGunsmith
git worktree remove .worktrees/builder-focus --force
```

---

## Self-review notes

- **Spec §2 scope** — every scoped item has a task:
  - NavDropdown primitive → Task 2.
  - Top nav rewrite → Task 3.
  - WipBanner primitive → Task 4.
  - Apply to 7 routes → Task 5.
  - Landing grid deletion → Task 6.
  - Playwright (2 assertions) → Task 7.
- **Spec §3 dropdown UX** — Task 2's code implements every bullet: click-to-open, Escape/outside-click/link-click close, `aria-expanded`, `aria-haspopup`, `role="menu"`, `role="menuitem"`.
- **Spec §4 nav content** — Task 3 uses the exact groupings and long labels specified.
- **Spec §5 WIP banner** — Task 4's JSX matches the spec's code block verbatim (including the `<Link to="/builder">`).
- **Spec §6 landing cleanup** — Task 6 lists each of the 6 removal items from the spec.
- **Spec §7 testing** — Task 7 adds the 2 named assertions; no unit tests (matches non-goal).
- **Spec §8 rollout** — 4 commits, one per phase B/C/D/E. Commit messages match the spec.

**No placeholders.** Every code block shows real code, every command is executable. Type names are consistent across tasks (`NavDropdownItem`, `NavDropdownProps`, `WipBanner`).

**One minor deviation from spec §2's "apply `<WipBanner />` to 7 routes" phrasing:** Phase C bundles the primitive creation (Task 4) with the 7-route application (Task 5) into a single commit, matching spec §8's commit groupings. Neither commit can ship without the other — they're semantically one change.
