/**
 * How the site shows a build's ergonomics.
 *
 * `weaponSpec` reports ergonomics as the plain sum, weapon base plus every part's delta, which
 * can fall below 0. The game floors the effective figure at 0: the client computes
 * `Mathf.Max(0f, ErgonomicsTotal * (1f + DeltaErgonomics + ErgonomicsPenalty))`. A build at −23
 * handles exactly like one at 0. The sum itself stays raw in `@tarkov/ballistics` and
 * `@tarkov/optimizer`, whose constraints, objectives and deltas need it linear; only what the
 * page prints is floored, and every delta shown compares the floored values.
 */

/** The ergonomics the game uses for a build whose parts sum to `raw`. */
export function shownErgonomics(raw: number): number {
  return Math.max(0, raw);
}

/**
 * The raw sum behind a floored figure, for the value's `title`, e.g.
 * "−23 before the game's floor at 0". `undefined` when the sum is not below the floor.
 */
export function ergonomicsFloorNote(raw: number): string | undefined {
  if (raw >= 0) return undefined;
  return `−${Number(Math.abs(raw).toFixed(1))} before the game's floor at 0`;
}
