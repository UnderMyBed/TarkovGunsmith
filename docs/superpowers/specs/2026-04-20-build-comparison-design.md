# Build Comparison — Design Spec

**Date:** 2026-04-20
**Status:** Approved (brainstorming → implementation planning)
**Milestone:** M3 Differentiators — sub-project 2 of 4 (Build comparison)
**Owner:** UnderMyBed (mattshipman85@gmail.com)
**Supersedes:** `docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md` §13 bullet on Build comparison

## 1. Purpose

Let players load two weapon builds into a single workspace, edit both sides freely, and see the differences — stats, mods, price, progression reachability — update live as they tinker. This is the first M3 differentiator feature: moving from "evaluate one build" (M1 Builder) to "reason about tradeoffs across builds."

The feature is a **live side-by-side workspace**, not a read-only diff. Both sides are fully editable using the existing Builder primitives, with a diff layer overlaid on top. Comparisons are first-class shareable objects in `builds-api`, saved as `pair:$id` entities that embed both build snapshots.

## 2. Locked decisions (from brainstorming)

| #   | Decision          | Choice                                                                                                                             |
| --- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Core experience   | **Live side-by-side workspace** (both sides editable, deltas live) — not a read-only diff                                          |
| 2   | Storage model     | **First-class pair entity** in `builds-api` (`pair:$id` → embedded `BuildV4` snapshots)                                            |
| 3   | Diff depth        | **Stats + slot-tree + price + progression** — the full-treatment diff, not stats-only                                              |
| 4   | Profile scoping   | **Per-side, optionally snapshotted** — enables "my LL2 build vs. my LL4 aspiration" comparisons                                    |
| 5   | Cardinality       | **2-way only** (data model leaves room to extend; UI is strictly paired)                                                           |
| 6   | Mixed weapons     | **Allowed** — can compare M4A1 vs. AKS-74U; weapon-unique stats show "—" in the delta column                                       |
| 7   | Editing semantics | **Local draft on load; Save produces a new `pairId`** — mirrors single-build pattern, no silent mutation of underlying pair record |
| 8   | Narrow viewports  | **Stacked** (<1024px) with sticky stat-delta strip; side-by-side at ≥1024px                                                        |
| 9   | Empty sides       | **Allowed** — renders placeholder column; diff region shows "add a second build" affordance                                        |

## 3. Non-goals

Explicit scope cuts for this PR:

- **3+ way comparison** — 2-way only. Not even leaving a "Compare with a third" affordance.
- **Auto-optimize button** ("make B recoil-minimal") — that's the next M3 sub-project (Build optimization). Build comparison can link to it as a future feature; no implementation.
- **Diff history / versioning** — no "show me what changed since yesterday."
- **Social features** — no comments, reactions, ownership model.
- **Public gallery of saved pairs** — share URLs only, no index/listing.
- **Mobile-optimized layout** — stacked is the mobile story; no bespoke mobile UX beyond that.
- **Cross-pair linking** — no "this pair references that other pair."

## 4. System architecture

### 4.1 Routes

- `/builder/compare` — blank pair workspace. Two empty weapon pickers. No loader.
- `/builder/compare/$pairId` — loader route. Fetches pair from `builds-api`, hydrates `useCompareDraft`, renders the workspace. Follows the `/builder/$id` pattern.

### 4.2 Entry points

1. **Direct URL** — `/builder/compare` or a shared `/builder/compare/$pairId` link.
2. **Compare-with-current flow** — new "Compare ↔" button in `BuildHeader` on `/builder/$id` opens `CompareFromBuildDialog`, offering:
   - (a) Clone current build into both sides
   - (b) Paste another share URL/ID for the right side (left = current)
   - (c) Start right side empty (left = current)
     Selection navigates to `/builder/compare` with left prefilled in-memory.
3. **Landing page** — existing "Builder" hero card on `/` gains a secondary CTA: "or compare two builds →" linking to `/builder/compare`.
4. **Nav** — no top-nav change. Compare is accessed through the Builder, not listed as a peer route.

### 4.3 Storage: `builds-api` Worker additions

New KV key-space: `pair:$id`. 8-character IDs, same scheme as `build:$id`. TTL policy matches existing single-build records (to be verified during implementation; whatever `build:$id` uses, `pair:$id` uses).

Three new endpoints, symmetric with single-build routes:

- `POST /api/pair` — body is `BuildPair`, returns `{ id }`.
- `GET /api/pair/:id` — returns the `BuildPair` JSON or 404.
- `POST /api/pair/:id/fork` — server-side copy-on-write helper. Returns a new `id` with a copy of the stored pair. Used by "Save as new" from an already-loaded pair to keep the client-side trip short.

All three routes reuse existing validation middleware + CORS + rate-limit patterns from single-build routes. No new infra, no new env vars, no new secrets.

Pair records embed full `BuildV4` snapshots, not references. This means:

- Deleting the original single builds the pair was forked from does not corrupt the pair.
- Modifying the original single builds does not retroactively change the pair.
- A pair record is larger than two single-build records (expected ~4–10 kB each; negligible at free-tier KV scale).

### 4.4 Schema (new, versioned from v1)

Lives in `packages/tarkov-types/src/builds.ts` next to `BuildV4`:

```ts
interface BuildPair {
  v: 1;
  createdAt: string; // ISO-8601 UTC
  left: BuildV4 | null; // nullable: unfilled side allowed
  right: BuildV4 | null;
  leftProfile?: PlayerProfile; // optional snapshot (opt-in, same pattern as single builds)
  rightProfile?: PlayerProfile;
  name?: string; // optional user label, e.g. "early-wipe vs. endgame M4"
  description?: string; // optional free text
}
```

Companion Zod schema `BuildPairSchema` exported from the same module. Versioning uses the same `v:` discriminated-union pattern as `BuildV1..V4` so future migrations follow the established chain.

### 4.5 Data layer (`packages/tarkov-data` + `apps/web`)

New hooks mirroring existing single-build hooks:

- `usePair(id)` — TanStack Query fetch; returns `BuildPair | LoadPairError`.
- `useSavePair()` — mutation; POST `/api/pair`; returns `{ id }`.
- `useForkPair(id)` — mutation; POST `/api/pair/:id/fork`; returns `{ id }`.

`LoadPairError` taxonomy (4 codes, mirrors `LoadBuildError`):

- `NotFound` — 404 from Worker.
- `Unauthorized` — reserved for future auth; not raised in v1.
- `MalformedPair` — Zod parse failure on retrieved payload.
- `UpstreamDrift` — at least one embedded `BuildV4` references items no longer present in tarkov-dev data.

## 5. Component architecture

### 5.1 New route file

`apps/web/src/routes/builder/compare.tsx` — wraps both `/builder/compare` (blank) and `/builder/compare/$pairId` (loader) in a single `CompareRoute`. Existing `/builder/$id` loader-route is the reference pattern.

### 5.2 New components (under `apps/web/src/features/builder/compare/`)

- **`CompareWorkspace`** — top-level layout orchestrator. Owns the pair-draft reducer, manages save state, wires the toolbar, renders stat-delta strip + two `CompareSide`s + progression row.
- **`CompareSide`** — one editable column. Thin wrapper around existing builder primitives (`BuildHeader` + `PresetPicker` + `SlotTree` + price/availability summary), parameterized by `side: 'left' | 'right'`. Receives diff flags from `CompareSlotDiff` and renders accordingly.
- **`CompareStatDelta`** — the stat-delta strip. Sticky at top on wide viewports, sticky between columns when stacked. Renders the same 8 headline stats `BuildHeader` already shows: vertical recoil, horizontal recoil, ergonomics, accuracy (MOA), muzzle velocity, effective distance, single-shot damage + pen, and price. Each rendered as a `StatRow` pair (A → B with signed/colored delta). All numerics in Azeret Mono. Reuses the stat-source selection already exported by the single-build header so the two surfaces never drift.
- **`CompareSlotDiff`** — pure walker that computes a `SlotDiffMap` by walking both trees in parallel. For each slot path, emits one of `{ equal, differs, left-only, right-only }`. Feeds styling flags into each `SlotTree` render.
- **`CompareProgressionRow`** — under the stat strip. Single summary line per side: "B costs +₽34k and needs LL3 Skier — you have LL2 Skier." Uses existing `itemAvailability` helper.
- **`ProfileSnapshotToggle`** — per-side control, mirrors the single-build opt-in profile snapshot UX from v1.4.0.
- **`CompareToolbar`** — action bar above the workspace. Actions: "Save comparison," "Save as new," "Open left in Builder," "Open right in Builder," "Swap L↔R," "Clone L→R." Mirrors `BuildHeader` visual treatment.
- **`CompareFromBuildDialog`** — the picker modal opened from `/builder/$id`'s new "Compare ↔" button. See 4.2 entry flow.

### 5.3 Reused components (no changes)

`BuildHeader`, `PresetPicker`, `OrphanedBanner`, `StatRow`, `Pill`, `Stamp`, `SectionTitle`, `Card variant="bracket"`, `computeBuildStats` (extracted to pure if not already).

### 5.4 Modified components

- **`SlotTree`** — gains an optional prop `diff?: SlotDiffMap`. When present, per-slot rendering picks up diff styling (amber left-border for "other side has something here," dashed amber border for "both have different items"). Backward-compatible; prop is optional and defaults to no-diff rendering.
- **`useWeaponTree`** — no changes. The hook already closes over a single build; we instantiate it twice (one per side) in `CompareWorkspace`.

### 5.5 State model

`useCompareDraft` — new reducer hook in `apps/web/src/features/builder/compare/useCompareDraft.ts`.

State:

```ts
interface CompareDraft {
  left: BuildV4 | null;
  right: BuildV4 | null;
  leftProfile?: PlayerProfile;
  rightProfile?: PlayerProfile;
  name?: string;
  description?: string;
  dirty: boolean;
}
```

Actions:

- `SET_SIDE(side, build)` — replace one side wholesale (used by weapon picker, paste-URL loader).
- `APPLY_MOD(side, path, item)` — delegate to existing build-mutation helper.
- `REMOVE_MOD(side, path)` — same.
- `SET_PROFILE(side, profile | undefined)` — toggle per-side profile snapshot.
- `SWAP()` — exchange left and right in place.
- `CLONE_LEFT_TO_RIGHT()` / `CLONE_RIGHT_TO_LEFT()` — fork one side into the other.
- `LOAD_FROM_PAIR(pair)` — hydrate from a fetched `BuildPair`, resets `dirty`.
- `SET_NAME(name)` / `SET_DESCRIPTION(desc)`.
- `RESET()` — back to blank both sides.

Every mutating action sets `dirty: true`. `LOAD_FROM_PAIR` and `RESET` clear it. Save flow clears `dirty` on success.

### 5.6 Unsaved-edits guard

- `beforeunload` event listener attached while `dirty === true`.
- TanStack Router `onLeave` (or the loader-route equivalent) confirmation dialog.
- Applies to all navigations except the save-then-redirect flow (which clears `dirty` first).

## 6. Visual treatment

The Field Ledger aesthetic from v1.5.0 stays load-bearing. Specifically:

- **Delta colors:** amber `#F2A63B` ("better" direction — per-stat aware; recoil lower is better, ergo/accuracy/velocity higher is better), `var(--blood)` for worse, no color for neutral/equal/unavailable.
- **Slot-diff badges:** amber left-border on slots where the other side has something this side doesn't; dashed amber border on slots where both have different items; no styling on identical slots.
- **Collapsed-identical toggle:** default on — identical slots collapse to a single `"—"` tick row so the diff reads cleanly. User can click "Expand all" in `CompareToolbar` to see the full tree on both sides.
- **Identical-builds state:** if computed stats are bit-identical between sides (Zod deep-equal on the mod trees), render a full-width `Stamp variant="info"` above the stat strip: "BUILDS ARE IDENTICAL." Prevents the "I can't see any diff" confusion state.
- **Sticky stat-delta strip:** position sticky with `top: var(--header-height)` on wide layouts; sticky between columns on stacked layouts (implementation detail — may need a small scroll-spy to switch).
- **Per-side drift:** `OrphanedBanner` renders over the affected column only, not globally. A comparison with a 40%-broken left side should still be usable for the right side.

No new design tokens. No new fonts. No changes to `packages/ui` primitives — everything reuses `Pill`, `Stamp`, `SectionTitle`, `StatRow`, `Card variant="bracket"` as shipped in v1.5.0.

## 7. Testing strategy

### 7.1 `@tarkov/builds-api` Worker tests (`@cloudflare/vitest-pool-workers`)

- `POST /api/pair` round-trips a full `BuildPair` through KV, returns 8-char ID.
- `GET /api/pair/:id` returns 404 for unknown, 200 + body for stored.
- Schema validation rejects malformed bodies (missing `v`, wrong types, out-of-range values).
- `POST /api/pair/:id/fork` produces a new ID, preserves content byte-for-byte except `createdAt`.
- CORS / rate-limit / validation middleware applies identically to existing single-build routes.

### 7.2 `packages/tarkov-types` / Zod

- `BuildPairSchema` parse tests: valid v1 roundtrip, nullable sides, optional profiles, optional name/description, unknown-field rejection.

### 7.3 `apps/web` unit tests (Vitest + RTL)

- `useCompareDraft` reducer: every action produces expected state, dirty flag transitions correctly across all mutations, `LOAD_FROM_PAIR` and `RESET` clear dirty.
- `CompareSlotDiff` pure walker: identical trees → all `equal`; left-only / right-only / differs cases; deep recursion through slot children; handles null sides gracefully.
- `computeBuildStats` delta math: equal builds → all zeros; known M4A1 vs. AKS-74U delta matches fixture values.
- `CompareStatDelta` rendering: positive/negative/zero deltas render with correct color + direction-aware "better/worse" semantics (recoil lower-is-better, ergo higher-is-better); missing-on-one-side renders "—".
- Identical-builds state renders the `BUILDS ARE IDENTICAL` stamp iff deep-equal.
- Drift handling: one side drifted renders `OrphanedBanner` on that side only; other side remains functional.

### 7.4 Playwright (`apps/web/e2e/smoke.spec.ts`) — hard rule

- `/builder/compare` route smoke (blank state loads, both pickers render, no console errors).
- `/builder/compare/$pairId` route smoke — seed a pair via `POST /api/pair` in a fixture, load via deep link, assert both `SlotTree`s render.
- Interaction test: pick two different weapons, assert stat delta strip shows non-zero values.
- "Save comparison" round-trip: fill both sides, save, follow redirect, assert loaded state matches the saved input.
- Font-load guards (Bungee / Chivo / Azeret Mono) via `document.fonts.check` on the compare route.

New `ROUTES` entries: `/builder/compare`, `/builder/compare/$pairId` (with fixture ID).

## 8. Error handling

- `LoadPairError` typed taxonomy (4 codes from 4.5). Loader route renders appropriate error UI per code:
  - `NotFound` → 404 page with "Start a new comparison" CTA to `/builder/compare`.
  - `MalformedPair` → error shell with raw error code + "Start a new comparison" CTA.
  - `UpstreamDrift` → workspace loads; `OrphanedBanner` renders over affected side(s).
  - `Unauthorized` → reserved; no v1 surface.
- Save failures → toast notification; draft stays in memory; `dirty` remains true. No data loss on transient Worker errors.
- Invalid `pairId` in URL → 404 route, not silent empty workspace.
- Network errors on `usePair` → TanStack Query retry policy matches `useBuild`.

## 9. Migrations & backward compatibility

- `BuildPair.v = 1` from day 1. No migrations yet.
- Pair embeds `BuildV4` by value. When `BuildV5` lands, the pair migration strategy is: bump `BuildPair` to `v: 2` and migrate embedded builds lazily on load, matching the existing `BuildV1..V4` migration chain.
- Existing single-build URLs and data unchanged.
- No impact on `/builder/$id` behavior except the added "Compare ↔" button in `BuildHeader`.

## 10. Open questions / deferred

- **Pair KV TTL** — verify the `build:$id` policy before implementation; apply the same to `pair:$id`. If single builds have no TTL today, neither does pair.
- **Fork endpoint vs. client-side re-POST** — fork endpoint included for symmetry and smaller client payload. Can drop during implementation if it adds friction; "Save as new" can be a regular `POST /api/pair` with the current draft. Decision deferred to the plan.
- **Diff grouping in the mod-delta view** — are grouped mod changes (e.g., "3 rail accessories differ") worth computing or does the slot-tree overlay carry the weight? Check during design review on the plan.
- **Keyboard shortcuts** — `Cmd+Shift+S` for swap, `Cmd+Enter` for save? Not a blocker; punt to follow-up.

## 11. Dependencies on other M3 sub-projects

- **Build optimization (next sub-project)** — when it ships, the compare workspace should gain an "Optimize this side" button. Not implemented here; a UX affordance stub is fine but no functional integration.
- **OG share cards (later)** — shared pair URLs become prime OG-card targets. The pair entity's existing `name` / `description` fields are designed to feed into OG rendering when that ships. No changes this PR.
- **tarkov.dev profile import (last)** — per-side `ProfileSnapshotToggle` inherits whatever profile source the single-build builder uses. When tarkov.dev import lands, both flows pick it up automatically.

## 12. Acknowledgements

- v1.5.0 foundation — the `BuildV4` schema, `builds-api` single-build routes, `OrphanedBanner` drift model, and Field Ledger primitives all make this feature a composition exercise rather than ground-up work.
- Original TarkovGunsmith had no comparison feature — this is genuinely new ground for the project.
