# Frontend Design Pass — "Field Ledger"

**Status:** design approved 2026-04-20 · first M3 feature.
**Depends on:** `packages/ui` v0.x (current primitives), `apps/web` v2.x (post-M2 shipped state).
**Mood board:** [`docs/design/mood-board.html`](../../design/mood-board.html) — open in a browser. Source of truth for color, type, spacing, and motif decisions.
**Part of:** [rebuild design](./2026-04-18-tarkov-gunsmith-rebuild-design.md) §13 — Milestone 3 "Differentiators," leading with the frontend pass before feature work.

## 1. Context

M1 through M2 prioritised shipping function. Eight routes are live (`/builder`, `/calc`, `/matrix`, `/sim`, `/adc`, `/aec`, `/data`, `/charts`), all working, all unremarkable-looking. The UI has generic default styling — rounded cards, generic sans fonts, an undifferentiated dark theme. Before M3's differentiator features land, the site needs a real visual identity so those features arrive into a container that already feels designed.

## 2. Direction — "Field Ledger"

A tactical, field-manual aesthetic — like a declassified NATO ballistics binder, typewritten, annotated, and stamped, but with modern clarity. Dark warm-black background, paper-warm foreground, amber-phosphor accent. Corner-bracketed panels, dashed internal dividers, tick-mark table rules. Typography leans on three distinctive families: Bungee (display shouts), Chivo (UI copy), Azeret Mono (every numeric value).

The mood board is the spec for the look. This document specifies how the pass rolls out.

## 3. Goals

- **Builder-forward.** The Weapon Builder is the primary tool; the landing page, nav ordering, and route hierarchy must reflect that. Ballistics tools are supporting.
- **Cohesive design system.** All colors, spacing, and typography come from tokens defined in `packages/ui`. No one-off styles in routes.
- **Route parity.** Every route gets the treatment. No orphaned "old style" routes in prod.
- **No functional regressions.** This is a visual pass, not a feature rewrite. All 78+ tests keep passing.
- **Accessibility baseline.** Semantic markup preserved; color contrast meets WCAG AA for text; keyboard focus remains clearly visible (amber outline).

## 4. Non-goals

- Light theme. Dark-only for M3. Light mode can be a follow-up.
- Playwright e2e setup. Still deferred — this pass is risky-but-reversible and manual verification suffices.
- New features. Any behavior change belongs in its own spec.
- Animations beyond static / hover transitions. Motion is intentionally minimal in v1.
- Custom illustration / photography. Tarkov-api icon CDN + SVG decorations only.
- Mobile-first rework. Mobile-responsive (as today), not mobile-first.

## 5. Design system summary

Full values live in the mood board and will be translated to CSS variables in PR 1. Quick reference:

- **Palette (dark):** `--bg #0E0F0C`, `--surface #16170F`, `--surface-2 #1F211A`, `--surface-3 #2A2C23`, `--line #3A3D33`, `--line-muted #26291F`, `--paper #E6E4DB`, `--paper-muted #9A988D`, `--paper-dim #6B6A60`, `--amber #F59E0B`, `--amber-deep #B45309`, `--olive #7A8B3F`, `--rust #9C3F1E`, `--blood #B91C1C`.
- **Typography:** `--font-display` Bungee, `--font-body` Chivo, `--font-mono` Azeret Mono. All via Google Fonts. Bungee reserved for hero shouts and decorative display; Chivo does all UI copy; Azeret Mono for every number, label, timestamp, and classification.
- **Semantic tokens (wrappers over palette):** `--color-primary` = `--amber`, `--color-destructive` = `--blood`, `--color-success` = `--olive`, etc. Keep route code agnostic to hex values.
- **Motifs:** corner brackets on primary panels (`::before` + `::after` amber L-shapes); tick-mark table rules (dashed 1px `--line`); hatched background on empty states; rotated-stamp style for shared/classified callouts.

## 6. PR arc (5 PRs)

Each PR is a worktree, a plan, a subagent-driven execution, and a squash-merge. Same cadence as M1.5 and the Simulator arc.

### PR 1 — Design tokens + primitive redesign (`packages/ui`)

Scope: the CSS variable set, the Google Fonts link / `@font-face`, and a refreshed `@tarkov/ui` — `Card` (with corner brackets), `Button` (tactical primary / ghost / outline), `Input` (ledger style), plus new primitives `Pill`, `Stamp`, `StatRow`, `SectionTitle`. Does NOT touch `apps/web` routes beyond whatever incidental breakage needs fixing to keep the app compiling.

After this PR merges, the app looks visually different everywhere, but layouts are unchanged. This is the foundation.

### PR 2 — Landing page + top nav

Scope: `apps/web/src/routes/__root.tsx` + `apps/web/src/routes/index.tsx`. New brand lockup, reordered nav (Builder first), Builder-forward hero, redesigned feature cards. Landing becomes the best visual showcase of the system.

### PR 3 — Builder redesign (`/builder`)

Scope: `apps/web/src/routes/builder.tsx` + `apps/web/src/features/builder/*`. Slot tree gets tick-mark dividers + pill-per-row availability + parent/child ▾/▸ markers. Header becomes the Builder-hero (weapon name in Bungee, stat grid with stock-diff deltas, share stamp). `BuildHeader` consolidates name/desc editor + stat grid. This is the visual flagship of the redesign.

### PR 4 — Ballistics routes sweep (`/calc`, `/sim`, `/adc`, `/aec`)

Scope: route composition refactor to use the new primitives + `SectionTitle` + corner-bracketed panels. Results panels gain the summary-card / timeline split from the mood board. No math changes.

### PR 5 — Data + chart routes (`/data`, `/charts`, `/matrix`)

Scope: ledger-style tables (tick dividers, amber sort carets, uppercase mono headers), chart palette aligned to the new tokens, `/matrix` heatmap cells use olive/amber/blood ramp instead of red/yellow/green.

## 7. Testing strategy

- **Pure-logic tests stay unchanged.** Every PR keeps the 78+ tests green.
- **No component-rendering tests added.** `@testing-library/react` still not installed; the bar for adding it is higher than this visual pass warrants.
- **Visual verification per PR.** Developer runs `pnpm --filter @tarkov/web dev`, walks every route, confirms no regressions. PR body explicitly flags what was visually inspected.
- **CI parity per PR.** `pnpm typecheck && lint && format:check && test && -r build` must exit 0.

## 8. Risks

- **Recharts colors bleeding into the `/charts` route** — Recharts uses its own palette defaults; PR 5 must explicitly pass `--color-*` values via `fill`/`stroke` on `<Cell>` and axes.
- **Contrast regressions on amber text.** Amber-on-dark is fine for large display text; for body copy / small labels, amber may fail AA. Use `--paper` for body, reserve amber for accents, nums, and decorative headings.
- **Builder slot-tree re-skin fighting the existing `<details>` elements.** The current `SlotTree` uses native `<details>` for collapsibles. PR 3 preserves the HTML tag but re-styles the summary / expanded rows. Do not rewrite the component structure to avoid introducing state bugs.
- **Tailwind v4 + CSS variable ordering.** `packages/ui/src/styles.css` loads first; changes there cascade globally. A single typo can bomb every page. Gate every PR on `pnpm -r build` + visual walkthrough before merging.

## 9. Known follow-ups (deferred from this pass)

- Light theme.
- Playwright e2e — revisit once this pass is done (now that we have a design system worth regression-testing).
- Custom loading states / skeleton shimmers matching the aesthetic.
- Custom favicon / OG image / social cards — ties into M3's own "OG share cards" sub-project.
- Keyboard shortcut overlay (pairs well with the field-manual aesthetic).
- Real weapon silhouettes on `/builder` and `/sim` beyond the current hit-zone buttons.
