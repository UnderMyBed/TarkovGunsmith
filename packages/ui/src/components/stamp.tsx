import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn.js";

const stampVariants = cva(
  "inline-block rounded-[var(--radius)] text-12 font-bold px-2.5 py-1 border-[1.5px]",
  {
    variants: {
      tone: {
        accent: "text-[var(--color-primary-text)] border-[var(--color-primary)]",
        red: "text-[var(--color-destructive)] border-[var(--color-destructive)]",
        neutral: "text-[var(--color-foreground)] border-[var(--color-border-strong)]",
      },
    },
    defaultVariants: { tone: "accent" },
  },
);

export interface StampProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof stampVariants> {}

export const Stamp = forwardRef<HTMLSpanElement, StampProps>(function Stamp(
  { className, tone, ...props },
  ref,
) {
  return <span ref={ref} className={cn(stampVariants({ tone }), className)} {...props} />;
});
