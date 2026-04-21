/**
 * Pure pair-of-WeaponSpec → per-stat delta helper. Used by the
 * `/builder/compare` stat-delta strip. "Direction" is per-stat aware:
 * ergonomics higher is better; recoil / weight / accuracy lower is better.
 * Missing on either side → delta=null, direction='unavailable'.
 *
 * The input shape is the 5 numeric fields of `WeaponSpec` — we accept a
 * structural subset rather than importing `WeaponSpec` directly so this
 * helper stays in `@tarkov/data` without a runtime dep on
 * `@tarkov/ballistics`.
 */

export type StatDirection = "better" | "worse" | "neutral" | "unavailable";

export type StatKey = "ergonomics" | "verticalRecoil" | "horizontalRecoil" | "weight" | "accuracy";

export interface StatDeltaRow {
  key: StatKey;
  label: string;
  left: number | null;
  right: number | null;
  delta: number | null;
  direction: StatDirection;
}

export type StatDeltaResult = readonly StatDeltaRow[];

interface StatLike {
  ergonomics?: number;
  verticalRecoil?: number;
  horizontalRecoil?: number;
  weight?: number;
  accuracy?: number;
}

interface StatDef {
  key: StatKey;
  label: string;
  /** true → lower is better (recoil / weight / accuracy); false → higher is better (ergo). */
  lowerIsBetter: boolean;
}

const STATS: readonly StatDef[] = [
  { key: "ergonomics", label: "Ergonomics", lowerIsBetter: false },
  { key: "verticalRecoil", label: "Vertical recoil", lowerIsBetter: true },
  { key: "horizontalRecoil", label: "Horizontal recoil", lowerIsBetter: true },
  { key: "weight", label: "Weight", lowerIsBetter: true },
  { key: "accuracy", label: "Accuracy (MOA)", lowerIsBetter: true },
];

function direction(delta: number | null, lowerIsBetter: boolean): StatDirection {
  if (delta === null) return "unavailable";
  if (delta === 0) return "neutral";
  const isLess = delta < 0;
  if (lowerIsBetter) return isLess ? "better" : "worse";
  return isLess ? "worse" : "better";
}

export function statDelta(
  left: StatLike | null | undefined,
  right: StatLike | null | undefined,
): StatDeltaResult {
  return STATS.map((def) => {
    const l = left?.[def.key];
    const r = right?.[def.key];
    const lVal = typeof l === "number" ? l : null;
    const rVal = typeof r === "number" ? r : null;
    const delta = lVal !== null && rVal !== null ? rVal - lVal : null;
    return {
      key: def.key,
      label: def.label,
      left: lVal,
      right: rVal,
      delta,
      direction: direction(delta, def.lowerIsBetter),
    };
  });
}
