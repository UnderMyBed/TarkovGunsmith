/**
 * The barrel deviation factor at a given durability: how much a worn barrel widens the
 * build's dispersion. Ported verbatim from upstream's preset stat computation,
 * `getBarrelDeviation` in the-hideout/tarkov-data-manager
 * `src/tarkov-data-manager/modules/preset-data.mjs` (lines 120-126 at
 * d1c7a3e05734db150813517a93b46984ade6e09c), which is what every upstream preset `moa` is
 * computed with.
 *
 * `deviationCurve` is the WEAPON's (upstream reads `baseItem._props.DeviationCurve`, not the
 * barrel's). `deviationMax` is the mounted barrel's, or 100 when the build has none — upstream's
 * own default. At full durability the factor is 1.0000..1.0025 on live data and `deviationMax`
 * moves it by under 2e-5. The Builder models new weapons, so `weaponSpec` uses the default
 * durability of 100.
 *
 * @example
 *   barrelDeviation(1.35, 23); // 1.0000172 — a fresh barrel on a 1.35-curve weapon
 */
export function barrelDeviation(
  deviationCurve: number,
  deviationMax: number,
  durability = 100,
): number {
  const num = 2 * deviationCurve;
  const num2 =
    100 - num === 0
      ? durability / num
      : (-deviationCurve + Math.sqrt((100 - num) * durability + deviationCurve)) / (100 - num);
  const num3 = 1 - num2;
  return num3 * num3 * deviationMax + 2 * num2 * num3 * deviationCurve + num2 * num2;
}
