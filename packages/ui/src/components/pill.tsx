import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn.js";

const pillVariants = cva(
  "inline-block rounded-[var(--radius)] text-11 font-medium px-2 py-[2px] border",
  {
    variants: {
      tone: {
        default: "text-[var(--color-foreground-2)] border-[var(--color-border-strong)]",
        reliable:
          "text-[var(--color-better)] border-[var(--color-better)] bg-[color-mix(in_srgb,var(--color-better)_10%,transparent)]",
        marginal:
          "text-[var(--color-worse)] border-[var(--color-worse)] bg-[color-mix(in_srgb,var(--color-worse)_10%,transparent)]",
        ineffective: "text-[var(--color-faint)] border-[var(--color-border)]",
        accent: "text-[var(--color-primary-text)] border-[var(--color-primary)]",
        muted: "text-[var(--color-faint)] border-[var(--color-border)]",
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
