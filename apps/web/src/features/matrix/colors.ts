/**
 * Bucket a shots-to-break number into a qualitative effectiveness category.
 * Used by the AmmoVsArmor matrix to color cells.
 */
export type EffectivenessBucket = "great" | "good" | "fair" | "poor" | "none";

export function shotsToBreakBucket(shots: number): EffectivenessBucket {
  if (!Number.isFinite(shots) || shots <= 0) return "none";
  if (shots <= 3) return "great";
  if (shots <= 8) return "good";
  if (shots <= 15) return "fair";
  return "poor";
}

/**
 * Tailwind color classes per bucket. Background + foreground tuned for
 * dark-theme cells in a tight grid.
 */
export const BUCKET_CLASSES: Record<EffectivenessBucket, string> = {
  great: "bg-[oklch(0.45_0.13_140)] text-white",
  good: "bg-[oklch(0.55_0.13_100)] text-white",
  fair: "bg-[oklch(0.55_0.15_60)] text-white",
  poor: "bg-[oklch(0.45_0.15_30)] text-white",
  none: "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
};
