# Armor Damage Calculator (`/adc`)

**Status:** design approved 2026-04-20 · second M2 feature (target v1.6.x)
**Depends on:** `@tarkov/ballistics` `simulateBurst`, `@tarkov/data` ammo + armor queries, `apps/web` v1.5.0
**Part of:** [rebuild design](./2026-04-18-tarkov-gunsmith-rebuild-design.md) §13 — Milestone 2 "Parity"

## 1. Context

`/calc` answers "one shot: did it pen, what damage, what durability remains." Simulator (`/sim`) handles multi-shot multi-zone engagements with kill determination. ADC sits between: **multi-shot forward ballistics at a single armor piece, with per-shot tabular detail.** It's the view a player reaches for when asking "how does this armor hold up to a burst of this ammo?"

The math primitive already exists — `simulateBurst(ammo, armor, shots, distance)` returns `ShotResult[]`. ADC is pure UI: a form that drives `simulateBurst` and renders a per-shot table plus a summary.

## 2. Goals

- **Reuses `simulateBurst` exactly as-is.** No new math.
- **Inverse of `/calc` only in quantity, not in direction.** Forward single-armor, N shots.
- **Ships in a single PR.** No multi-PR arc — scope fits one cohesive change.

## 3. Non-goals

- Multi-armor / body-part targeting — that's `/sim`.
- Effectiveness charts / visualisations — separate M2 sub-project.
- Share/save ADC inputs — mirror `/calc`'s stateless posture.
- Probabilistic / Monte Carlo mode.

## 4. Route `/adc`

### 4.1 Layout

Same visual vocabulary as `/calc` — Card / CardHeader / CardContent / Input from `@tarkov/ui`. Two sections stacked:

- **Inputs**
  - Ammo picker (reuse `useAmmoList` from `@tarkov/data`)
  - Armor picker (reuse `useArmorList`)
  - Shots (numeric input, default 5, min 1, max 50)
  - Distance (numeric input, default 15m, min 0, max 500)
  - Optional: Current durability override (numeric, defaults to max).

- **Results**
  - Summary card: total flesh damage dealt, shots-to-first-penetration (or "never penetrates"), final armor durability, ratio (final / max).
  - Per-shot table: shot #, pen (Y/N + effective pen chance as % from `penetrationChance`), damage dealt, armor damage, durability after, residual pen.

### 4.2 State + hooks

- `useState` for selections (ammo id, armor id, shots, distance, durability override). Same pattern as `/calc`.
- Derived via `useMemo` on inputs → adapted inputs → `simulateBurst` result. Live recompute (no "Calculate" button).

## 5. Build plan (1 PR)

### PR 1 — `/adc` route

- Create `apps/web/src/routes/adc.tsx` composing the form and results table.
- Add `/adc` nav link in `__root.tsx` + card on the landing page.
- Small pure helper `adcSummary(results, armor): { firstPenetrationAt, totalDamage, finalDurability }` unit-tested in vitest.
- No new math, no new data queries, no new UI primitives.

Commit as `feat(adc): ...` to trigger the minor release.

## 6. Testing

- `apps/web/src/features/adc/adcSummary.test.ts` — unit tests for the summary helper.
- No component tests (consistent with `/calc` and Sim).
- Manual visual verification: load `/adc`, pick M855 + PACA, shots = 5, confirm first-pen index + table matches math.

## 7. Known follow-ups

- Probabilistic mode (show per-shot pen chance distribution instead of binary threshold).
- "Minimum ammo to kill" inverse (falls to AEC sub-project).
- Compare two ammos side-by-side against the same armor.
