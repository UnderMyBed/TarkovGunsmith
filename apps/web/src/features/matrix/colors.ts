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
