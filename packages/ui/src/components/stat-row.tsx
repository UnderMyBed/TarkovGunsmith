import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

export interface StatRowProps extends HTMLAttributes<HTMLDivElement> {
  /** Sentence-case label. */
  readonly label: string;
  /** Stock / baseline value (struck-through). */
  readonly stock?: string | number;
  /** Delta vs stock — e.g. "+18", "−34%". */
  readonly delta?: string;
  /** Whether the delta is an improvement (better) or a regression (worse). */
  readonly deltaDirection?: "up" | "down" | "neutral";
  /** Current value. */
  readonly value: string | number;
  /** 0–100 value for the trailing bar. Omitted = no bar. */
  readonly percent?: number;
  /** Bar color token. */
  readonly barTone?: "primary" | "better" | "worse";
}

/**
 * Horizontal stat row: label → stock (strike) → delta → current → bar.
 * Used by the Builder's stat grid and any "vs. baseline" comparison view.
 */
export function StatRow({
  label,
  stock,
  delta,
  deltaDirection = "neutral",
  value,
  percent,
  barTone = "primary",
  className,
  ...props
}: StatRowProps) {
  const deltaColor =
    deltaDirection === "up"
      ? "text-[var(--color-better)]"
      : deltaDirection === "down"
        ? "text-[var(--color-worse)]"
        : "text-[var(--color-muted-foreground)]";
  const directionWord =
    deltaDirection === "up" ? "better" : deltaDirection === "down" ? "worse" : undefined;
  const barColor =
    barTone === "better"
      ? "bg-[var(--color-better)]"
      : barTone === "worse"
        ? "bg-[var(--color-worse)]"
        : "bg-[var(--color-primary)]";

  return (
    <div
      className={cn(
        "grid grid-cols-[110px_46px_56px_48px_1fr] items-center gap-2.5 py-1",
        className,
      )}
      {...props}
    >
      <div className="text-12 text-[var(--color-muted-foreground)]">{label}</div>
      <div className="font-mono text-xs text-right text-[var(--color-faint)] line-through decoration-[var(--color-border)]">
        {stock ?? ""}
      </div>
      <div className={cn("font-mono text-12 text-right", deltaColor)} title={directionWord}>
        {delta ?? ""}
        {/* The colour is not the only signal: the direction is spoken and on hover too. */}
        {delta !== undefined && directionWord !== undefined && (
          <span className="sr-only"> {directionWord}</span>
        )}
      </div>
      <div className="font-mono text-lg text-right font-semibold text-[var(--color-foreground)] tabular-nums">
        {value}
      </div>
      <div className="h-1 rounded-full border border-[var(--color-divider)] bg-[var(--color-muted)] overflow-hidden">
        {percent !== undefined && (
          <span
            className={cn("block h-full", barColor)}
            style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
          />
        )}
      </div>
    </div>
  );
}
