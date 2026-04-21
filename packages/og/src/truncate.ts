/**
 * Single-line truncate with trailing `…`. `max` is the total length including
 * the ellipsis character (counts as 1). Used to clip headline overflow so the
 * card layout never wraps.
 */
export function truncate(input: string, max: number): string {
  if (max < 2) throw new Error(`truncate: max must be ≥ 2 (got ${max})`);
  if (input.length <= max) return input;
  return `${input.slice(0, max - 1)}…`;
}
