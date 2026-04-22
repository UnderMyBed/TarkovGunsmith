import type { CSSProperties, HTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Width (CSS string or number → px). Defaults to "100%". */
  width?: CSSProperties["width"];
  /** Height (CSS string or number → px). Defaults to "1rem". */
  height?: CSSProperties["height"];
  /** Number of stacked rows, each `height` tall, spaced by `space-y-2`. */
  rows?: number;
}

/**
 * Field Ledger placeholder rectangle. Use during a loading state to hint at
 * the eventual content's shape without shifting layout when data arrives.
 *
 * For multi-row skeletons, set `rows`. For a single block, leave it unset.
 *
 * Styling: muted background, dashed amber border, `animate-pulse`.
 */
export function Skeleton({
  width = "100%",
  height = "1rem",
  rows,
  className,
  style,
  ...props
}: SkeletonProps) {
  if (rows && rows > 1) {
    return (
      <div
        className={cn("flex flex-col space-y-2", className)}
        style={{ width, ...style }}
        {...props}
      >
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="bg-[var(--color-muted)] border border-dashed border-[var(--color-border)] animate-pulse"
            style={{ height }}
          />
        ))}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "bg-[var(--color-muted)] border border-dashed border-[var(--color-border)] animate-pulse",
        className,
      )}
      style={{ width, height, ...style }}
      {...props}
    />
  );
}
