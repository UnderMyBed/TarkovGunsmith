import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn.js";

const pillVariants = cva(
  "inline-block font-mono text-[10px] font-semibold tracking-[0.2em] uppercase px-2 py-[2px] border",
  {
    variants: {
      tone: {
        default: "text-[var(--color-foreground)] border-[var(--color-border)]",
        reliable:
          "text-[var(--color-olive)] border-[var(--color-olive)] bg-[color:rgba(122,139,63,0.1)]",
        marginal:
          "text-[var(--color-primary)] border-[var(--color-primary)] bg-[color:rgba(245,158,11,0.08)]",
        ineffective: "text-[var(--color-paper-dim)] border-[var(--color-border)]",
        accent: "text-[var(--color-primary)] border-[var(--color-primary)]",
        muted: "text-[var(--color-paper-dim)] border-[var(--color-border)]",
      },
    },
    defaultVariants: { tone: "default" },
  },
);

export interface PillProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof pillVariants> {}

export const Pill = forwardRef<HTMLSpanElement, PillProps>(function Pill(
  { className, tone, ...props },
  ref,
) {
  return <span ref={ref} className={cn(pillVariants({ tone }), className)} {...props} />;
});
