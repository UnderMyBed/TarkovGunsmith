# Armor Effectiveness Calculator (`/aec`)

**Status:** design approved 2026-04-20 · third M2 feature (v1.7.x)
**Depends on:** `@tarkov/ballistics` `simulateBurst` + `armorEffectiveness`, `@tarkov/data`.
**Part of:** [rebuild design](./2026-04-18-tarkov-gunsmith-rebuild-design.md) §13 Milestone 2.

## 1. Context

`/calc` is single-shot forward. `/adc` is multi-shot forward, single armor. `/matrix` is full ammo×armor matrix. **AEC is armor-first and inverse:** "pick one armor, rank all ammos by how efficiently they break it." Answers "what do I need to carry to defeat this armor?"

## 2. Goals

- **Armor-first, ammo-ranked.** Single armor picker; ammo list is the output.
- **Sorted by effectiveness.** Ammos that break the armor in fewer shots rank higher. Ammos that can't break it within the cap rank last (∞).
- **One PR.** Pure-math helper + UI route + nav link + landing card. Matches `/adc`'s scope.

## 3. Non-goals

- Trader-price or quest-progression weighting in the ranking — future.
- Cross-armor comparison — that's `/matrix`.
- Effectiveness charts — separate M2 sub-project.
- Probabilistic / Monte Carlo mode.

## 4. Route `/aec`

### 4.1 Layout

Same visual vocabulary as `/adc`. Two sections:

- **Inputs**: armor picker, optional shot cap (default 30), optional distance (default 15m).
- **Results**: ranked ammo table — columns: rank, name, caliber, shots-to-break, damage-to-break, first-pen-index, classification ("reliable" ≤ shot cap / "marginal" ≤ cap×2 / "ineffective").

### 4.2 Helper

```ts
interface AecRow {
  readonly ammo: BallisticAmmo;
  readonly shotsToBreak: number; // Infinity if cap exceeded
  readonly firstPenetrationAt: number | null;
  readonly totalDamageAtBreak: number; // 0 if never breaks
  readonly classification: "reliable" | "marginal" | "ineffective";
}
function rankAmmos(ammos, armor, shotCap, distance): AecRow[]; // sorted asc by shotsToBreak
```

- `shotsToBreak === Infinity` → ammo placed at end.
- `classification`: `"reliable"` when `shotsToBreak ≤ shotCap`, `"marginal"` when `≤ shotCap * 2`, else `"ineffective"`.

Lives in `apps/web/src/features/aec/rankAmmos.ts`. Unit-tested.

## 5. Testing

- `rankAmmos.test.ts` — ordering, Infinity handling, classification boundaries.
- Route verified via typecheck + lint + manual browser.

## 6. Known follow-ups

- Ranking by damage-per-shot (for lethality, not armor break).
- Combine with trader cost for "cheapest effective" ranking.
- Filter by caliber (reuse a future /matrix caliber-filter primitive).
