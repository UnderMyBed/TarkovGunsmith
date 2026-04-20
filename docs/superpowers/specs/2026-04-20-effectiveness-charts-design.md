# Effectiveness Charts (`/charts`)

**Status:** design approved 2026-04-20 · fifth and final M2 feature.
**Depends on:** `@tarkov/ballistics` `simulateBurst`; `@tarkov/data` ammo + armor hooks.
**Part of:** rebuild design §13 Milestone 2.

## 1. Context

M2's tabular views (ADC, AEC, DataSheets) cover the data. The effectiveness charts layer adds **visual** answers to "how does this ammo stack up?" using a charting library.

## 2. Goals

- **Visual view of `shots-to-break`** for one ammo across every armor.
- **First charting dep in the project.** Add Recharts — de-facto standard for React charts, tree-shakable, lightweight.
- **Single PR.** The smallest useful chart view; expand later.

## 3. Non-goals

- Multi-ammo / multi-armor matrix heatmap — possible v2.
- Animations / drill-downs — static bar chart only.
- Custom SVG chart from scratch — Recharts is worth the dep.

## 4. Route `/charts`

### 4.1 Layout

- Ammo picker + shot cap + distance inputs (reuse `/aec`'s pattern).
- Single bar chart: X axis = armor name, Y axis = shots to break, bars classified + coloured (reliable green / marginal amber / ineffective grey). Infinite values rendered as a capped bar with an "∞" label.

### 4.2 Helper

```ts
interface ChartRow {
  readonly armor: BallisticArmor;
  readonly shotsToBreak: number; // Infinity if never breaks within sim window
  readonly classification: "reliable" | "marginal" | "ineffective";
}
function rankArmorsForAmmo(ammo, armors, shotCap, distance): ChartRow[];
```

Inverse of `rankAmmos` from AEC. Lives in `apps/web/src/features/charts/`.

## 5. Dependency: Recharts

- Add `recharts` to `apps/web` dependencies. Latest 3.x. Tree-shaken imports (`BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `Cell`).
- Bundle impact monitored via `pnpm -r build`; current SPA gzip is ~145 kB; recharts adds ~40 kB gzipped.

## 6. Testing

- `rankArmorsForAmmo` unit-tested.
- No component tests; manual visual verification.

## 7. Known follow-ups

- Mirror view: pick armor → bar chart of shots-to-break per ammo.
- Heatmap matrix.
- Export chart as PNG.
