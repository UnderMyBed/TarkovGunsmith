/**
 * Bucket a shots-to-break number into a qualitative effectiveness category.
 * Used by the AmmoVsArmor matrix to color cells.
 */
export type EffectivenessBucket = "great" | "good" | "fair" | "poor" | "none";

/**
 * Thresholds track the live shots-to-break distribution, measured across the
 * full 200 ammo x 47 vest matrix on 2026-08-19: p25 = 52, median = 102,
 * p75 = 203. The rounded 50/100/200 cuts land at 24% / 50% / 74% cumulative,
 * so each band holds roughly a quartile.
 *
 * The previous 3/8/15 cuts were inherited from the defective durability model
 * and captured 0.0% / 0.9% / 3.9% of live cells respectively — every live cell
 * rendered "poor". See docs/operations/data-api-audit.md §G.
 */
export function shotsToBreakBucket(shots: number): EffectivenessBucket {
  if (!Number.isFinite(shots) || shots <= 0) return "none";
  if (shots <= 50) return "great";
  if (shots <= 100) return "good";
  if (shots <= 200) return "fair";
  return "poor";
}

/**
 * Tailwind color classes per bucket. Background + foreground tuned for
 * dark-theme cells in a tight grid. Palette follows the Field Ledger tokens:
 * olive (great) → amber (good) → amber-deep (fair) → rust (poor) → muted (none).
 */
export const BUCKET_CLASSES: Record<EffectivenessBucket, string> = {
  great: "bg-[color:rgba(122,139,63,0.85)] text-[var(--color-primary-foreground)]",
  good: "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]",
  fair: "bg-[var(--color-amber-deep)] text-[var(--color-foreground)]",
  poor: "bg-[var(--color-rust)] text-[var(--color-foreground)]",
  none: "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
};
