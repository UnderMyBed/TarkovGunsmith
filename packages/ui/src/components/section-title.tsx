import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn.js";

export interface SectionTitleProps extends HTMLAttributes<HTMLDivElement> {
  readonly index: string | number;
  readonly title: string;
  readonly meta?: ReactNode;
}

/**
 * Section divider: numbered accent label + title + thin rule + right-aligned meta label. Used between content blocks on long pages.
 */
export function SectionTitle({ index, title, meta, className, ...props }: SectionTitleProps) {
  return (
    <div className={cn("flex items-center gap-4 my-8", className)} {...props}>
      <span className="text-13 font-semibold text-[var(--color-primary-text)]">
        {String(index).padStart(2, "0")} · {title}
      </span>
      <span className="flex-1 h-px bg-[var(--color-border)]" />
      {meta && <span className="text-12 text-[var(--color-muted-foreground)]">{meta}</span>}
    </div>
  );
}
