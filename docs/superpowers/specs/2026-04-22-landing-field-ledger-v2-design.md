# Landing · Field Ledger v2 — Design Refresh

**Status:** design approved 2026-04-22. Writing-plans is next.

**Context:** First of two arcs delivering the Field Ledger v2 design direction produced via Claude Design (mockup archived at `docs/design/field-ledger-v2/index.html`). This arc lands the landing-page refresh — low risk, ships fast, gets the new look in front of public visitors now that the repo is public. Arc 2 (separate spec) is the bigger lift: replace the modal `OptimizeDialog` with a full-page Current / Optimized / Delta diff builder.

## Goal

Bring the live `/` route in line with the approved Field Ledger v2 mockup: fix the sample-build numbers so they match the M4A1 fixture, tighten the hero copy, and add the two new sections the design calls for (optimizer promo strip + four-card feature grid below the hero).

### Success criteria

1. `/` visually matches `docs/design/field-ledger-v2/index.html` — same copy, same numbers, same section order.
2. Sample-build readout uses the fixture-correct M4A1 numbers (ergo 72 / +25, recoil-v 37 / −34%, weight 3.90 / +0.80, accuracy 2.1 MoA).
3. The "Try Optimizer" button lands users on `/builder`, where the existing `OptimizeDialog` is reachable from `BuildHeader`. No dead links.
4. Smoke e2e still passes with the new content, and one new assertion verifies the optimizer promo strip is present.
5. Ships as a single PR on `feat/landing-field-ledger-v2`. No unrelated changes.

## Framing decisions (locked during brainstorming)

| Decision                       | Choice                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Arc scoping                    | Arc 1 = landing only. Arc 2 = builder-optimizer diff view (separate spec + PR).                                                             |
| Hero copy framing              | Drop the "modern, AI-first rebuild of the defunct TarkovGunsmith" framing. Keep only the action-oriented sentence about what the tool does. |
| `TRY OPTIMIZER` / `LEARN MORE` | Both link to `/builder`. Dedicated optimizer destination follows in Arc 2.                                                                  |
| New `@tarkov/ui` primitives    | None. Use existing `Pill`, `Stamp`, and inline Tailwind for the promo strip and feature cards.                                              |
| Route-tree changes             | None. Same `/` route, single file edit.                                                                                                     |

## Non-goals

- No changes to the optimizer dialog, builder, header, nav, or any other route.
- No new `@tarkov/ui` primitives (`PromoStrip`, `FeatureCard`, etc.) — inline for this arc; extract upstream only if Arc 2 needs them.
- No refactor of the existing `HeroStat` helper in `apps/web/src/routes/index.tsx`.
- No dark/light theme toggle, no OG card changes, no favicon changes.
- No i18n, no analytics events, no feature flags.
- No docs updates beyond this spec + the plan it produces.

## Design

### 1. Copy + number corrections

**Meta row** (top-of-page, above the hero H1) — append a fourth item so the row reads:

```
WEAPON · MODS · PROFILE    / LIVE RECOMPUTE    / SHAREABLE URL    / QUEST-GATED
```

(Note: existing file uses `SHARE URL` — design mockup uses `SHAREABLE URL`. Match the mockup.)

**Hero body paragraph** — replace the current prose with:

> Pick a weapon, walk the slot tree, attach mods — ergo, recoil, accuracy and weight recompute live, gated by your trader levels and quest progress. **Share any build by URL.**

(Final four words wrapped in `<strong>` per the existing file's styling convention.)

**Sample-build `HeroStat` values** — update to match the M4A1 fixture numbers the design mockup uses:

| Stat       | Current file             | New value                |
| ---------- | ------------------------ | ------------------------ |
| ERGONOMICS | `72`, `+18`, up          | `72`, `+25`, up          |
| RECOIL V   | `151`, `−34%`, up        | `37`, `−34%`, up         |
| WEIGHT     | `3.24` kg, `+0.80`, down | `3.90` kg, `+0.80`, down |
| ACCURACY   | `2.1` MoA, no delta      | unchanged                |

### 2. Optimizer promo strip (new)

Added between the existing hero `<section>` and the bottom of the `<HomePage>` component.

**Structure** — a full-width `<section>` with `border`, `border-[var(--color-primary)]`, and a tinted amber background (`bg-[rgba(245,158,11,0.06)]` or the existing `--color-primary` with `bg-opacity-[0.06]` utility if Tailwind v4 syntax differs). Inner grid: three columns `auto 1fr auto`, `gap-6`, `items-center`, `px-6 py-5`.

**Left column** — two-line eyebrow:

- `◇ NEW · OPTIMIZER` in mono caps, amber (`text-[var(--color-primary)]`), letter-spacing `0.2em`.
- `BRANCH-AND-BOUND · EXACT` in mono caps, paper-dim (`text-[var(--color-muted-foreground)]`), same letter-spacing.

**Middle column** — two lines:

- Bungee display at ~20px: "Set a budget. Pick an objective. The solver picks the mods."
- Mono sub-line at 12px in muted foreground: "Pin any slot to keep fixed. Respects your trader LLs and flea status. Pure-TS, runs client-side."

**Right column** — two buttons side by side:

- `TRY OPTIMIZER` — existing `Link to="/builder"` styled as a small primary button matching the `Open the Builder ▸` button already in the file (same classes, just `h-8` instead of `h-10`).
- `LEARN MORE` — secondary/ghost-style `Link to="/builder"` with border-transparent, text muted; hover → amber text.

### 3. "WHAT IT DOES" feature grid (new)

Added below the promo strip.

**Tick-rule header** — a 12px-tall horizontal `.tick-rule` (the existing utility class) with the label `WHAT IT DOES` absolutely positioned over it, 12px from the left, with a `bg-[var(--color-background)]` strip of `px-2` so the label visually cuts through the tick-rule.

**Card grid** — `grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4`. Four bracket-cornered cards (`.bracket` utility class from `@tarkov/ui` styles, already in scope). Each card is `p-5`, with:

- `<div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-primary)]">NN</div>` — the 01/02/03/04 eyebrow.
- `<div className="font-display text-[20px] mt-2">TITLE</div>` — Bungee, uppercase.
- `<div className="font-mono text-[12px] mt-3 text-[var(--color-muted-foreground)] leading-[1.5]">DESCRIPTION</div>` — mono, 12px, 1.5 line-height.

Card content (from the design):

| #   | Title     | Description                                                   |
| --- | --------- | ------------------------------------------------------------- |
| 01  | BUILDER   | Slot tree editor with availability gating and live recompute. |
| 02  | OPTIMIZER | Solve for min-recoil, max-ergo, min-weight or max-accuracy.   |
| 03  | COMPARE   | Diff two builds, stat-by-stat, mod-by-mod.                    |
| 04  | SHARE     | Every build lives at a URL. Import on any device.             |

### 4. File layout

Only one production file changes:

- **`apps/web/src/routes/index.tsx`** — modified. Current ~128 lines → ~240 lines after changes. `HeroPage` component grows one promo `<section>` and one feature-grid `<section>`; `HeroStat` and other local helpers unchanged.

One test file changes:

- **`apps/web/e2e/smoke.spec.ts`** — add one assertion in the `/` block for the text `TRY OPTIMIZER`. Landing remains in `ROUTES`.

No new files. No new `@tarkov/ui` primitives.

### 5. Tailwind / color token notes

The existing file uses `bg-[var(--color-primary)]`, `text-[var(--color-foreground)]`, `border-[var(--color-border)]`, etc. — the Tailwind v4 arbitrary-value pattern against the `@tarkov/ui` CSS custom properties. The new sections must use the same pattern, not raw hex. Relevant tokens: `--color-primary` (amber), `--color-muted-foreground`, `--color-paper-dim`, `--color-foreground`, `--color-border`, `--color-background`.

### 6. Accessibility

- Promo strip `<section>` gets an `aria-label="Optimizer — new feature"` so screen readers announce it distinctly from the hero.
- Feature grid — no heading is added for the tick-rule label (it's decorative typography, not a semantic heading). If a contributor wants to promote it later they can wrap it in an `<h2>`.
- All links remain keyboard-reachable and have `focus-visible:` Tailwind styles from the shared button class composition already in the file.

## Rollout sequence (single PR on `feat/landing-field-ledger-v2`)

1. Write this spec. ✓
2. Write the implementation plan (`docs/plans/2026-04-22-landing-field-ledger-v2-plan.md`) — next step after spec approval.
3. Execute:
   1. Edit `apps/web/src/routes/index.tsx` — meta row, hero copy, sample-build numbers.
   2. Add promo strip.
   3. Add feature grid.
   4. Update e2e smoke test.
4. Local gate: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm --filter @tarkov/web test:e2e`.
5. Visual walkthrough in the browser (`pnpm --filter @tarkov/web dev`, open `/`).
6. Open PR, CI green, squash-merge.

## Follow-up items (explicitly deferred)

- Arc 2 — full-page optimizer diff view (separate spec).
- Retarget `TRY OPTIMIZER` / `LEARN MORE` to an optimizer-specific destination once Arc 2 ships (e.g. `/builder/:id?view=optimize` or a dedicated route).
- Extract `FeatureCard` and `PromoStrip` into `@tarkov/ui` if Arc 2 or a later route needs either primitive again. Inline for now.
- Decide whether to add a short "how it works" / optimizer-docs page for `LEARN MORE` to point at. Needs content, not just a route — deferred.
