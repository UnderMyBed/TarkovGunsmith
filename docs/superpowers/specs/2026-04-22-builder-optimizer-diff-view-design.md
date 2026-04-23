# Builder · Optimizer-first Diff View (Field Ledger v2 — Arc 2)

**Status:** design in review (drafted 2026-04-22). Writing-plans is next once user approves.

**Context:** Second of two arcs delivering the Field Ledger v2 direction produced via Claude Design (mockup archived at `docs/design/field-ledger-v2/index.html`, artboard `builder-b · 1440 × 900`, lines 808–1772). Arc 1 (landing refresh, PR #108) shipped 2026-04-22. Arc 2 is the bigger lift — it replaces the modal `OptimizeDialog` with a full-page optimizer experience: solver rail (left) + `CURRENT / ◇ OPTIMIZED / DELTA` stat triptych + per-row accept-selectable mod-changes diff table.

## Goal

Bring the live `/builder` route in line with the `builder-b` mockup. The `◇ OPTIMIZE` action in `BuildHeader` stops opening a dialog and instead navigates the user to `?view=optimize`, a full-page layout that keeps the `CURRENT` build stats visible next to the solver's `OPTIMIZED` proposal, diffs every changed slot, and lets the user accept all / accept selected / discard.

### Success criteria

1. `/builder?view=optimize` and `/builder/$id?view=optimize` render the mockup's three-row layout: app header → `BuildHeader` → solver rail + right column.
2. The right column is a stat triptych (`CURRENT`, `◇ OPTIMIZED`, `DELTA`) above a `MOD CHANGES` diff table.
3. Each changed slot in the diff table has a checkbox; `ACCEPT SELECTED (N)` merges only the checked rows into the current build; `ACCEPT ALL` takes the whole proposal; `DISCARD` exits without merging.
4. `OptimizeDialog` is deleted. One codepath for the optimizer, no modal fallback.
5. Narrow screens (<1024px) reflow: solver rail stacks above the right column; triptych stacks to a single column; diff table gets horizontal scroll.
6. E2E coverage for the flow (enter view → run solver → partial accept → verify merged build).
7. Ships as a single PR on `feat/builder-optimizer-diff-view`. No unrelated changes.

## Framing decisions (locked during brainstorming)

| Decision                          | Choice                                                                                                                                                                                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route model                       | `?view=optimize` search param on `/builder` and `/builder/$id`. No new route files. Validated via TanStack Router `validateSearch`; default `"editor"`.                                                                                                    |
| Selection behavior                | Per-row checkboxes, all checked by default. Footer: `ACCEPT ALL` · `ACCEPT SELECTED (N)` · `DISCARD`. `(N)` updates live.                                                                                                                                  |
| Left-rail PROFILE scope           | Read-only trader-LL grid + timestamp + `RE-IMPORT` button wired to the existing `useTarkovTrackerSync.reSync()` (the hook is lifted out of `ProfileEditor` up to `routes/builder.tsx` and passed to both consumers — see §11) + `EDIT PROFILE ▸` link that clears `?view=optimize` and focuses the `ProfileEditor` in the main builder. No inline edit UI.                  |
| Idle state                        | `CURRENT` card renders live stats. `OPTIMIZED` and `DELTA` render `—` placeholders at 60% opacity. Diff table shows a single `RUN THE SOLVER TO SEE PROPOSED CHANGES` row. No auto-run on land, no sessionStorage cache.                                   |
| Fate of `OptimizeDialog`          | Retired entirely. Narrow screens reflow the full-page view; no modal fallback.                                                                                                                                                                             |
| Component organization            | All new files under existing `apps/web/src/features/builder/optimize/`. Keep `OptimizeConstraintsForm` + reducer + `useOptimizer`; delete `OptimizeDialog` + `OptimizeResultView`; add `optimize-view.tsx`, `optimize-triptych.tsx`, `mod-changes-table.tsx`, `profile-readout.tsx`, `slot-diff.ts`, `build-from-selection.ts`. |
| New `@tarkov/ui` primitives       | None planned. The `bracket` variant on `Card` already exists; the mockup uses a `bracket-olive` variant on the `OPTIMIZED` card — add the olive corner colour as a prop on the existing bracket class rather than as a new primitive.                       |
| Branch + PR scope                 | Single branch (`feat/builder-optimizer-diff-view`), single PR. Spec + plan + implementation commits all land together.                                                                                                                                     |

## Non-goals

- No profile-editing UI inside the optimizer view. `EDIT PROFILE ▸` returns to the main builder where the existing `ProfileEditor` lives.
- No sessionStorage cache of last-run result. Reload = back to idle; solver run is ~50 ms.
- No changes to `@tarkov/optimizer` (solver logic is unchanged).
- No changes to `OptimizeConstraintsForm`'s internals beyond removing its `DialogBody` wrapper from the parent.
- No `@tarkov/ui` primitive extraction. `OptimizeTriptych`, `ModChangesTable`, `ProfileReadout` stay inside `apps/web` — re-extract only if a later arc needs them.
- No solver-budget-time UI (the "2s BUDGET" badge in the mockup footer is a decorative label at this stage, not wired to config).
- No dark/light theme toggle (Field Ledger v2 is dark-only; Arc 3 light theme remains deferred).
- No compare-with-proposed affordance (compare is build-vs-build, separate from optimizer-vs-current).
- No deep-link of the proposal itself (URL carries `?view=optimize` + the saved build id; the proposal is re-computed on click of `RE-RUN OPTIMIZATION`).

## Design

### 1. Route + search-param integration

`apps/web/src/routes/builder.tsx` and `apps/web/src/routes/builder.$id.tsx` both gain:

```ts
import { z } from "zod";

const builderSearchSchema = z.object({
  view: z.enum(["editor", "optimize"]).catch("editor"),
});

export const Route = createFileRoute(...)({
  validateSearch: (s) => builderSearchSchema.parse(s),
  component: BuilderPage,
});
```

In the component, `const { view } = Route.useSearch()` branches the body: `"editor"` renders today's slot-tree experience; `"optimize"` renders `<OptimizeView ...>`.

`BuildHeader`'s existing `onOptimize` callback is re-targeted to `navigate({ to: ".", search: (s) => ({ ...s, view: "optimize" }) })`. The button label becomes `◇ OPTIMIZE` (mono caps, matching the mockup). `BuildHeader` does NOT know about the optimizer view otherwise.

The `OptimizeView` renders a small secondary header inside itself with a `← EDITOR` link that calls `navigate({ to: ".", search: (s) => ({ ...s, view: "editor" }) })`.

Accepting a proposal (either `ACCEPT ALL` or `ACCEPT SELECTED`) merges the build via the same `onAccept(build)` prop `routes/builder.tsx` already passes to `OptimizeDialog`, then clears `?view=optimize` so the user lands back on the editor to see the merged build.

### 2. File layout

```
apps/web/src/features/builder/optimize/
├── optimize-constraints-form.tsx      (unchanged; re-slotted into OptimizeView)
├── optimize-constraints-reducer.ts    (unchanged)
├── useOptimizer.ts                    (unchanged)
├── optimize-dialog.tsx                (DELETED)
├── optimize-result-view.tsx           (DELETED — split into triptych + mod-changes-table)
├── optimize-view.tsx                  (NEW — top-level layout + state owner)
├── optimize-triptych.tsx              (NEW — 3 bracket cards, 2×2 stat grid each)
├── mod-changes-table.tsx              (NEW — diff table + per-row checkboxes + footer actions)
├── profile-readout.tsx                (NEW — read-only LL grid + RE-IMPORT + EDIT PROFILE link)
├── slot-diff.ts                       (NEW — pure helper: currentAttachments + proposedAttachments → ChangedRow[])
├── slot-diff.test.ts                  (NEW)
├── build-from-selection.ts            (NEW — pure helper: merge only selected changed rows)
├── build-from-selection.test.ts       (NEW)
├── optimize-view.test.tsx             (NEW — smoke test of the layout; integration-style)
└── index.ts                           (update exports)
```

`apps/web/src/routes/builder.tsx` (and `builder.$id.tsx`): remove `OptimizeDialog` import + `optimizeOpen` state. Add `validateSearch`. Wire `view` branch. Pass the same inputs to `<OptimizeView>` the dialog used to receive.

`apps/web/src/features/builder/build-header.tsx`: button label `Optimize ⚙` → `◇ OPTIMIZE`. No other behaviour change.

`apps/web/e2e/builder-optimizer.spec.ts`: new file. See §6.

### 3. Component shapes

#### `OptimizeView` (`optimize-view.tsx`)

```ts
interface OptimizeViewProps {
  weapon: BallisticWeapon;
  slotTree: WeaponTree;
  modList: readonly ModListItem[];
  profile: PlayerProfile;
  currentAttachments: Readonly<Record<string, string>>;
  currentStats: WeaponSpec | null;
  onAccept: (build: BuildV4) => void;
  onExit: () => void; // clears ?view=optimize
  onEditProfile: () => void; // clears ?view=optimize AND focuses ProfileEditor
}
```

Owns `state, dispatch` (constraints reducer), `optimizer` (useOptimizer), `selection: Set<string>` of slot IDs selected for accept (defaults to all changed slot IDs when a result arrives).

Layout: `grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 px-8 py-6`.
- Left cell: bracket card containing `SOLVER` title + `BRANCH-AND-BOUND` pill + `OptimizeConstraintsForm` (re-slotted — no `DialogBody` wrapper) + `ProfileReadout` + `RE-RUN OPTIMIZATION` button.
- Right cell: stacks `OptimizeTriptych` + `ModChangesTable` with `gap-5`.

Secondary header at top of the view: `← EDITOR` link, `OPTIMIZER` display-font title, status pill (`IDLE` / `RUNNING…` / `DONE` / `ERROR`).

#### `OptimizeTriptych` (`optimize-triptych.tsx`)

```ts
interface OptimizeTriptychProps {
  current: WeaponSpec | null;
  optimized: WeaponSpec | null; // null = idle placeholder
  priceCurrent: number | null;   // ruble totals for the ₽ stat
  priceOptimized: number | null;
  running?: boolean;             // render Skeleton shimmers over OPTIMIZED + DELTA
}
```

The `DELTA` card derives its own values by diffing `current` vs `optimized` plus `priceOptimized - priceCurrent`. No separate `delta` prop — derivation stays inside the triptych component so both panels are always consistent.

Renders three bracket-cornered cards via the existing `Card variant="bracket"`. Cards:

- `CURRENT BUILD` — default bracket (amber corners).
- `◇ OPTIMIZED` — `bracket-olive` variant (add olive-corner colour via a prop on the existing bracket-css rule; no new primitive).
- `DELTA` — amber bracket, mono-caps title `DELTA`.

Each card contains a 2×2 grid of `StatRow`-style blocks: `RECOIL V`, `ERGO`, `WT kg`, `₽`. Idle state: `—` at `opacity-60`. Running state: each stat is a `<Skeleton>` (reuse M3.5 Arc 2 primitive).

Delta card formats each stat as `±value` + a smaller `±pct%` tag coloured olive (improvement) or destructive (regression). Direction is per-stat (lower-is-better for RECOIL V, WT, ₽; higher-is-better for ERGO).

#### `ModChangesTable` (`mod-changes-table.tsx`)

```ts
interface ModChangesTableProps {
  rows: ChangedRow[];
  selected: ReadonlySet<string>; // slot IDs
  onToggle: (slotId: string) => void;
  onAcceptAll: () => void;
  onAcceptSelected: () => void;
  onDiscard: () => void;
  scoreDelta: number | null;
  running?: boolean;
}
```

Where `ChangedRow`:

```ts
interface ChangedRow {
  slotId: string;
  slotLabel: string;          // "MUZZLE", "HANDGUARD"
  currentName: string | null; // null = slot was empty
  proposedName: string | null; // null = slot becomes empty ("— (removed)")
  ergoDelta: number;
  recoilDelta: number;
  priceDelta: number;
}
```

Layout: bracket card. Header strip shows `MOD CHANGES` display-font title + `N SLOTS CHANGED` accent pill + `M SLOTS UNCHANGED` muted pill + `SCORE Δ · ±X.XX` mono caps right-aligned.

Grid: `grid grid-cols-[32px_128px_1.2fr_1.2fr_56px_56px_80px]` (checkbox | slot | current | suggested | ergo | rcl | ₽). Header row uses mono caps. Body rows use `border-b border-dashed` between rows, `align-items-center`, `py-2.5 px-4`. Current-name cell strike-through at `text-muted-foreground`; suggested cell olive with a leading `→` glyph; removed = `— (removed)` in paper-dim.

Delta cells coloured olive for improvement, destructive for regression, paper-dim for 0.

Footer: `ACCEPT ALL` (primary) · `ACCEPT SELECTED (N)` (secondary, disabled when N=0) · `DISCARD` (ghost) · right-aligned `DFS · LINEAR LOWER-BOUND PRUNE · 2s BUDGET` decorative mono-caps label.

Running state: rows are `<Skeleton>` shimmer placeholders; accept buttons disabled.

Zero-change state: rows area replaced by `NO IMPROVEMENTS FOUND · TRY A DIFFERENT OBJECTIVE` centered; `ACCEPT ALL` + `ACCEPT SELECTED` disabled; `DISCARD` label becomes `BACK TO EDITOR`.

#### `ProfileReadout` (`profile-readout.tsx`)

```ts
interface ProfileReadoutProps {
  profile: PlayerProfile;
  sync: UseTarkovTrackerSyncResult; // lifted from routes/builder.tsx; reused by ProfileEditor too
  onEditProfile: () => void;
}
```

Renders `03 · PROFILE` section-title (reuse `SectionTitle`) + timestamp meta + 9-trader LL grid (reuse existing trader names from `@tarkov/types`, format mirrors mockup's 3×3 grid with amber LLs for ≥3 and foreground for <3) + `RE-IMPORT` secondary button (calls `sync.reSync()` directly) + `EDIT PROFILE ▸` ghost link (calls `onEditProfile`).

Timestamp meta:
- If `sync.syncState.state === "synced"`: `TARKOVTRACKER · Nh AGO` (format with a `formatRelativeTime` helper derived from `sync.syncState.lastSyncedAt`).
- Else (`"disconnected"` / `"syncing"` / `"error"`): meta reads `MANUAL` and `RE-IMPORT` is disabled.
- If `sync.syncState.state === "syncing"`: `RE-IMPORT` renders a small spinner.

### 4. Pure helpers

#### `slotDiff(currentAttachments, proposedAttachments, slotTreeFlat, modList)` → `ChangedRow[]`

Walks the union of slot IDs present in either attachment map.

- If `current === proposed` (string equal) → skipped.
- Else emit a `ChangedRow` with mod names resolved from `modList` (fall back to mod ID), and per-stat deltas computed from the mod's stat contribution (`ergo`, `recoilV`, `price`). Price falls back to 0 when the mod has no flea price in `modList`.
- Sorting: pin order (same order as the slot tree's flat walk), so the table reflects the weapon's slot layout rather than alphabetic.

Unit tests cover: added slot, removed slot, swapped slot, unchanged slot (excluded), multiple changes in pin order, missing-mod-in-modList fallback.

#### `buildFromSelection(currentBuild, proposedBuild, selected)` → `BuildV4`

Returns a new `BuildV4` whose `attachments` is `currentBuild.attachments` overlaid with only the slots in `selected`. Other metadata (weapon ID, profile, version) comes from `currentBuild`.

Unit tests cover: all-selected (equals proposedBuild attachments plus currentBuild metadata), none-selected (equals currentBuild), partial, and proposal-contains-slot-not-in-current (new addition is picked up).

### 5. Styling / tokens

- All colours via existing CSS custom properties (`--color-primary`, `--color-olive`, `--color-destructive`, `--color-paper-dim`, `--color-muted-foreground`, `--color-border`, `--color-background`). No raw hex except inside `packages/ui/src/styles/index.css` where the olive bracket variant is added.
- Bungee display font: triptych titles (`CURRENT BUILD` via mono-caps label + numerics in Azeret Mono), `MOD CHANGES` header, `OPTIMIZER` secondary-header title.
- Chivo body: nothing new — all body copy is mono caps per the Field Ledger aesthetic.
- Azeret Mono: all numerics (stat values, deltas, percentages, price).
- The existing `.bracket` utility in `@tarkov/ui` provides the amber L-corner markers. Add a modifier class (`.bracket-olive`) or accept an `olive` variant prop on `Card` — simplest: extend the existing `Card` component with `variant: "bracket" | "bracket-olive"` and colour the corner pseudo-elements via a CSS custom property that the olive variant overrides.

### 6. Testing

#### Vitest

- `slot-diff.test.ts` — 6 tests (added / removed / swapped / unchanged / pin-order / missing-mod fallback).
- `build-from-selection.test.ts` — 4 tests (all / none / partial / new-slot-in-proposal).
- `optimize-view.test.tsx` — integration smoke:
  - Renders idle state with `CURRENT` filled, `OPTIMIZED` + `DELTA` placeholders, `RUN THE SOLVER` row.
  - Firing `RE-RUN OPTIMIZATION` populates triptych + table (use a stubbed `useOptimizer` that returns a deterministic result).
  - `ACCEPT SELECTED` with 1 row unchecked calls `onAccept` with a build that excludes the unchecked slot.

#### Playwright (new `apps/web/e2e/builder-optimizer.spec.ts`)

Six assertions, single spec file:

1. Navigate to `/builder/$id` with seeded fixture build; click `◇ OPTIMIZE`; assert URL gains `?view=optimize` and the `OPTIMIZER` heading is visible.
2. Assert solver rail + triptych + diff-table + idle placeholders render (text: `RUN THE SOLVER TO SEE PROPOSED CHANGES`).
3. Click `RE-RUN OPTIMIZATION`; assert `OPTIMIZED` card populates (at least one numeric value) and the `MOD CHANGES` table has ≥1 row.
4. Uncheck the first row's checkbox; assert `ACCEPT SELECTED (N-1)` label updates.
5. Click `ACCEPT SELECTED`; assert URL returns to `/builder/$id` (no `view` param) and `BuildHeader`'s ergo/recoil numbers have changed from baseline.
6. Re-enter optimize view, click `← EDITOR`; assert return to editor with no merge (build unchanged).

Update `apps/web/e2e/smoke.spec.ts` — no change to `ROUTES` (the route path is still `/builder/$id`; the view-param state is exercised by the dedicated spec). Landing-page assertion that `TRY OPTIMIZER` links to `/builder` stays as-is; after Arc 2 ships we retarget it to `/builder/<fixture-id>?view=optimize` in a follow-up (see §10).

### 7. Error + edge cases

- **Solver error:** render an inline bracket card where the triptych sits, with the error message + a `BACK TO CONSTRAINTS` ghost button (equivalent to today's `handleAdjust`). Mirrors today's dialog error view.
- **Zero-change proposal:** covered above (§3, `ModChangesTable`).
- **Weapon cleared mid-view:** `routes/builder.tsx` renders `<OptimizeView>` only when `selectedWeapon && slotTree`. If either becomes null while the view is mounted (main builder swapped weapon via keyboard shortcut etc.), the route component renders a redirect-equivalent: clears `?view=optimize` and shows the weapon picker.
- **`optimizer.state === "running"` for >1s:** triptych + table render `<Skeleton>` shimmers. Solver typically finishes in <50ms; the skeleton is a UX safety net for slower hardware.
- **Selection of 0 rows:** `ACCEPT SELECTED (0)` button is disabled.
- **Profile sync timestamp null:** `ProfileReadout` shows `MANUAL` meta and disables `RE-IMPORT`.
- **Arc 1's `TRY OPTIMIZER` button on `/`:** currently links to `/builder`. Retarget to `/builder?view=optimize` as part of this PR (one-line change in `apps/web/src/routes/index.tsx`; the landing e2e assertion gets updated in lockstep).

### 8. Accessibility

- The view's secondary header is an `<h1>OPTIMIZER</h1>` (single h1, since `BuildHeader`'s weapon name is an `<h2>` in the editor view; optimizer view supplants the editor's semantic hierarchy while mounted).
- Each triptych card is a `<section aria-labelledby>` with a hidden-but-present label (`CURRENT BUILD`, `OPTIMIZED BUILD`, `DELTA VS CURRENT`).
- Diff table is a real `<table>` with `<thead>`/`<tbody>`; checkboxes are `<input type="checkbox">` with an `aria-label="Accept <slotLabel> change"`.
- Footer actions: `ACCEPT ALL` and `ACCEPT SELECTED` are `<button>`s; `DISCARD` too. Keyboard focus-ring via the existing `focus-visible:` Tailwind conventions in `@tarkov/ui/button`.
- `← EDITOR` link has `aria-label="Back to builder editor"`.
- Colour is not the only signal: olive/destructive deltas are paired with a `+`/`−` sign prefix; strikethrough names are paired with the `→` arrow glyph on the suggested column.

### 9. Lift `useTarkovTrackerSync` from `ProfileEditor` to `routes/builder.tsx`

Today `profile-editor.tsx` calls `useTarkovTrackerSync({ profile, onChange, tasks })` locally. If `ProfileReadout` also called the hook, the two would own independent sync state (two different `syncState`s, two different tokens-in-memory, two independent `reSync` calls).

Refactor plan:
1. Move the `useTarkovTrackerSync(...)` call from `ProfileEditor` up to `routes/builder.tsx` (next to the existing `profile`/`setProfile` state).
2. `ProfileEditor` gains a `sync: UseTarkovTrackerSyncResult` prop (replacing the internal hook call). Its `TarkovTrackerConnectPopover` + `TarkovTrackerSyncBanner` usage is unchanged — they already take the sync object as a prop today.
3. `OptimizeView` also receives the same `sync` prop and forwards it to `ProfileReadout`.
4. Only one call-site; both consumers share identical sync state.

This is a narrow refactor — one lifted hook call + one new prop on `ProfileEditor` + no behavioral change in the editor. Colocate with Arc 2's implementation rather than a separate PR.

### 10. Rollout sequence (single PR on `feat/builder-optimizer-diff-view`)

1. Write this spec ✓.
2. Write the implementation plan (`docs/plans/2026-04-22-builder-optimizer-diff-view-plan.md`) — next step after spec approval.
3. Execute on the same branch:
   1. Pure helpers first (`slot-diff.ts` + `build-from-selection.ts` + their unit tests).
   2. `OptimizeTriptych` + its stat-delta formatting.
   3. `ModChangesTable` with selection state.
   4. Lift `useTarkovTrackerSync` from `ProfileEditor` up to `routes/builder.tsx`; add `sync` prop on `ProfileEditor` (§9).
   5. `ProfileReadout`.
   6. `OptimizeView` wiring all three, plus `useOptimizer` and constraints reducer.
   6. `@tarkov/ui` bracket-olive variant (tiny CSS tweak + Storybook-equivalent visual check by `pnpm --filter @tarkov/web dev`).
   7. `validateSearch` on `/builder` routes + `BuildHeader` button re-wire.
   8. Delete `optimize-dialog.tsx` + `optimize-result-view.tsx`; update `features/builder/optimize/index.ts` exports.
   9. Unit tests (`optimize-view.test.tsx`) + Playwright spec (`builder-optimizer.spec.ts`).
4. Local gate: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm --filter @tarkov/web test:e2e`.
5. Visual walkthrough in browser (`pnpm --filter @tarkov/web dev`, seed a build with `pnpm seed:build`, open `/builder/<id>`, click `◇ OPTIMIZE`, exercise all three accept paths + the error path by temporarily throwing from `useOptimizer`).
6. Open PR, CI green, squash-merge.

### 11. Follow-up items (explicitly deferred)

- Session-cached last run in `sessionStorage` keyed by build-id so reload preserves a proposal.
- Wire the `2s BUDGET` footer label to an actual solver time budget once `@tarkov/optimizer` exposes one.
- Compare-two-builds integration from inside the optimizer view (opens `/builder/compare/...` with the proposed build as one side).
- Extract `OptimizeTriptych`, `ModChangesTable`, `ProfileReadout` upstream into `@tarkov/ui` if a later feature needs any of them. Inline for now.
- A dedicated `/optimizer` marketing page that `LEARN MORE` on the landing strip points at.
