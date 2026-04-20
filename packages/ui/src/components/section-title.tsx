import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn.js";

export interface SectionTitleProps extends HTMLAttributes<HTMLDivElement> {
  readonly index: string | number;
  readonly title: string;
  readonly meta?: ReactNode;
}

/**
 * Field-ledger section divider: numbered amber label + title + thin rule +
 * right-aligned meta label. Used between content blocks on long pages.
 */
export function SectionTitle({ index, title, meta, className, ...props }: SectionTitleProps) {
  return (
    <div className={cn("flex items-center gap-4 my-8", className)} {...props}>
      <span className="font-mono text-[13px] tracking-[0.2em] text-[var(--color-primary)] uppercase">
        {String(index).padStart(2, "0")} · {title}
      </span>
      <span className="flex-1 h-px bg-[var(--color-border)]" />
      {meta && (
        <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)]">
          {meta}
        </span>
      )}
    </div>
  );
}
