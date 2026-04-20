# Frontend Pass PR 5 — Data + Charts + Matrix Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Final PR of the M3 Frontend Design Pass. Applies the Field Ledger aesthetic to `/data`, `/charts`, `/matrix`. Closes the arc.

**Architecture:** Same Field Ledger header pattern on all three routes; ledger-style tables on `/data` with tick dividers + mono caps headers; aligns chart / matrix palette to the Field Ledger tokens (no more oklch green / yellow / orange — use olive / amber / rust / destructive).

---

## Reference

- **Umbrella spec:** `docs/superpowers/specs/2026-04-20-frontend-design-pass-design.md`.
- **Mood board:** `docs/design/mood-board.html` §05 (Ledger / Data).
- **PR 1–4 shipped:** tokens, landing, builder, ballistics routes.

## Scope decisions

1. **Matrix bucket colors → Field Ledger palette.** `features/matrix/colors.ts` rewritten: great=olive, good=amber, fair=amber-deep, poor=destructive, none=muted. Drop all `oklch()` literals.
2. **Recharts Bar fills come from CSS vars on `<Cell>`** — already done in PR 5 of M2 for `/charts`; verify and tighten. X/Y axes use `var(--color-muted-foreground)` ticks; grid uses `var(--color-border)`.
3. **`/data` tables get the ledger treatment:** `<thead>` bottom border is solid paper (`border-b-2 border-[var(--color-foreground)]`), `<tbody>` rows use `border-b border-dashed`, sort indicators in amber.
4. **No new primitives.** Everything uses what's shipped.

## File map

```
apps/web/src/routes/
├── data.tsx                        MODIFIED — header + table styling
├── charts.tsx                      MODIFIED — header + axes/grid palette tighten
└── matrix.tsx                      MODIFIED — header + palette via updated colors.ts

apps/web/src/features/matrix/
└── colors.ts                       MODIFIED — Field Ledger palette for buckets
```

No other files.

---

## Task 0: Worktree + baseline

```bash
cd ~/TarkovGunsmith
git fetch origin
git worktree add .worktrees/data-charts-sweep -b feat/data-charts-matrix-sweep origin/main
cd .worktrees/data-charts-sweep
pnpm install --frozen-lockfile
pnpm --filter "./packages/*" build
pnpm --filter @tarkov/web typecheck && pnpm --filter @tarkov/web lint && pnpm --filter @tarkov/web test
```

---

## Task 1: Rewrite `features/matrix/colors.ts` bucket palette

**File:** `apps/web/src/features/matrix/colors.ts`

- [ ] **Step 1: Read the current file** to preserve the `EffectivenessBucket` type + `shotsToBreakBucket` function intact.

```bash
cat apps/web/src/features/matrix/colors.ts
```

- [ ] **Step 2: Replace the `BUCKET_CLASSES` constant** with Field Ledger tokens. Keep everything else untouched. Target values:

```ts
export const BUCKET_CLASSES: Record<EffectivenessBucket, string> = {
  great: "bg-[color:rgba(122,139,63,0.85)] text-[var(--color-primary-foreground)]",
  good: "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]",
  fair: "bg-[var(--color-amber-deep)] text-[var(--color-foreground)]",
  poor: "bg-[var(--color-rust)] text-[var(--color-foreground)]",
  none: "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
};
```

- [ ] **Step 3: Verify tests don't pin specific class strings.**

```bash
grep -n "BUCKET_CLASSES\|oklch" apps/web/src/features/matrix/colors.test.ts
```

If the test checks for specific class strings, update it to the new values. If it only checks "returns a non-empty string for each bucket", no change needed.

- [ ] **Step 4: Typecheck + test.**

```bash
pnpm --filter @tarkov/web typecheck && pnpm --filter @tarkov/web test colors
```

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/features/matrix/colors.ts apps/web/src/features/matrix/colors.test.ts
git commit -m "feat(matrix): Field Ledger bucket palette (olive/amber/rust/destructive)"
```

(If `colors.test.ts` wasn't changed, the `git add` for it will silently no-op — fine.)

---

## Task 2: `/matrix`

**File:** `apps/web/src/routes/matrix.tsx`

- [ ] **Step 1: Replace the page `<section>` header** with the Field Ledger pattern. Meta: `"DATA · MATRIX"` / `"AMMO × ARMOR"` / `"SHOTS TO BREAK"`. Title: `AmmoVsArmor <span>Matrix</span>`.

- [ ] **Step 2: Bucket `<td>` cells** already consume `BUCKET_CLASSES` via Task 1 — no change needed here.

- [ ] **Step 3: Legend / controls** — if there's a visible legend showing bucket colors, make sure the swatches pick up the new palette. If those are also class-driven via `BUCKET_CLASSES`, no change needed.

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/routes/matrix.tsx
git commit -m "feat(ui): /matrix — Field Ledger header"
```

---

## Task 3: `/data`

**File:** `apps/web/src/routes/data.tsx`

- [ ] **Step 1: Page header** — Field Ledger pattern. Meta: `"DATA · TABLES"` / `"AMMO · ARMOR · WEAPONS · MODULES"` / `"SORT + FILTER"`. Title: `Data<span>Sheets</span>`.

- [ ] **Step 2: Tab bar restyle.** The existing tab buttons use primary color for active. Tighten: active tab gets `border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]` + mono-caps spacing (`tracking-[0.18em]`). Inactive tabs use `text-[var(--color-muted-foreground)]` + mono-caps. Underline hover state.

- [ ] **Step 3: Table header rule.** The `<thead><tr>` existing className `border-b text-[var(--color-muted-foreground)]` becomes `border-b-2 border-[var(--color-foreground)] text-[var(--color-muted-foreground)]`.

- [ ] **Step 4: Table body rows** — change `<tbody><tr class="border-b">` to `<tbody><tr class="border-b border-dashed border-[var(--color-border)]">`.

- [ ] **Step 5: Sort-caret arrow** currently `▲` / `▼` in the `Header` helper. Verify the active color is amber (`text-[var(--color-primary)]`) via the existing `active` branch.

- [ ] **Step 6: Commit.**

```bash
git add apps/web/src/routes/data.tsx
git commit -m "feat(ui): /data — Field Ledger header + ledger-style tables"
```

---

## Task 4: `/charts`

**File:** `apps/web/src/routes/charts.tsx`

- [ ] **Step 1: Page header** — Field Ledger. Meta: `"DATA · CHARTS"` / `"SHOTS-TO-BREAK VISUALISED"` / `"RELIABLE · MARGINAL · INEFFECTIVE"`. Title: `Effectiveness <span>Charts</span>`.

- [ ] **Step 2: Chart Card** gets `variant="bracket"`.

- [ ] **Step 3: Recharts palette alignment.** Confirm:
  - `<CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />` — already present, keep.
  - `<XAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} />` — update font to include `fontFamily: "var(--font-mono)"`.
  - `<YAxis tick={{ fill: "var(--color-muted-foreground)", fontFamily: "var(--font-mono)" }} />`.
  - `fillForClassification` helper already uses CSS vars — no change.

- [ ] **Step 4: Legend pills below the chart** — already present. Update the three `<Legend />` lines to use the shared `Pill` primitive style (or just sync their colors to match the Recharts Cells). Easier path: keep as-is if already correct.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/routes/charts.tsx
git commit -m "feat(ui): /charts — Field Ledger header + bracket card + mono axes"
```

---

## Task 5: Full verification + push + PR

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm -r build
git push -u origin feat/data-charts-matrix-sweep
gh pr create --title "feat(ui): /data /charts /matrix sweep — closes M3 Field Ledger pass (M3 PR 5)" --body "$(cat <<'EOF'
## Summary

Final PR of the M3 Frontend Design Pass. Applies the Field Ledger aesthetic to the data routes and closes the arc.

- **`/matrix` bucket palette**: `BUCKET_CLASSES` rewritten — olive (great) / amber (good) / amber-deep (fair) / rust (poor) / muted (none). Drops all `oklch()` literals.
- **`/matrix` header**: Field Ledger Bungee + mono-meta pattern.
- **`/data`**: Field Ledger header; tab bar tightened with mono-caps + amber active underline; tables use solid-paper `<thead>` rule + dashed `<tbody>` rows.
- **`/charts`**: Field Ledger header; chart Card gets `variant="bracket"`; Recharts axes use mono font via `fontFamily: "var(--font-mono)"`.
- Plan: `docs/plans/2026-04-20-data-charts-matrix-sweep-plan.md`.

## Test plan

- [x] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm -r build` — all exit 0.
- [x] Test count unchanged (or colors test updated if it pinned strings).
- [ ] Visual walkthrough deferred to post-merge.
- [ ] CI green.

## M3 arc wrap-up

This PR closes the 5-PR M3 Frontend Design Pass:
- PR 1 (#63) — Design tokens + `@tarkov/ui` primitives
- PR 2 (#64) — Builder-forward landing + nav
- PR 3 (#65) — `/builder` redesign (flagship)
- PR 4 (#66) — Ballistics routes sweep (`/calc`, `/sim`, `/adc`, `/aec`)
- **PR 5 (this) — Data + charts + matrix sweep**

M3 Differentiators starts here.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr checks --watch
gh pr merge --squash --auto
cd ~/TarkovGunsmith
git worktree remove .worktrees/data-charts-sweep
git branch -D feat/data-charts-matrix-sweep
git fetch origin --prune
```
