import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

export interface StatRowProps extends HTMLAttributes<HTMLDivElement> {
  /** Uppercase mono label. */
  readonly label: string;
  /** Stock / baseline value (struck-through). */
  readonly stock?: string | number;
  /** Delta vs stock — e.g. "+18", "−34%". */
  readonly delta?: string;
  /** Whether the delta is an improvement (olive) or regression (blood). */
  readonly deltaDirection?: "up" | "down" | "neutral";
  /** Current value (large, amber/paper). */
  readonly value: string | number;
  /** 0–100 value for the trailing bar. Omitted = no bar. */
  readonly percent?: number;
  /** Bar color token. */
  readonly barTone?: "primary" | "olive" | "destructive";
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
      ? "text-[var(--color-olive)]"
      : deltaDirection === "down"
        ? "text-[var(--color-destructive)]"
        : "text-[var(--color-muted-foreground)]";
  const barColor =
    barTone === "olive"
      ? "bg-[var(--color-olive)]"
      : barTone === "destructive"
        ? "bg-[var(--color-destructive)]"
        : "bg-[var(--color-primary)]";

  return (
    <div
      className={cn(
        "grid grid-cols-[110px_46px_56px_48px_1fr] items-center gap-2.5 py-1",
        className,
      )}
      {...props}
    >
      <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)]">
        {label}
      </div>
      <div className="font-mono text-xs text-right text-[var(--color-paper-dim)] line-through decoration-[var(--color-border)]">
        {stock ?? ""}
      </div>
      <div className={cn("font-mono text-[11px] text-right tracking-wide", deltaColor)}>
        {delta ?? ""}
      </div>
      <div className="font-mono text-lg text-right font-semibold text-[var(--color-foreground)] tabular-nums">
        {value}
      </div>
      <div className="h-1 border border-[var(--color-line-muted)] bg-[var(--color-muted)] overflow-hidden">
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
