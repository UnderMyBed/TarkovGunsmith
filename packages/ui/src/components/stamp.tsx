import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn.js";

const stampVariants = cva(
  "inline-block font-mono text-[10px] font-bold tracking-[0.25em] uppercase px-2.5 py-1 border-[1.5px] -rotate-2",
  {
    variants: {
      tone: {
        amber: "text-[var(--color-primary)] border-[var(--color-primary)]",
        red: "text-[var(--color-destructive)] border-[var(--color-destructive)]",
        paper: "text-[var(--color-foreground)] border-[var(--color-foreground)]",
      },
    },
    defaultVariants: { tone: "amber" },
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
