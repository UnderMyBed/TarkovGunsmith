import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn.js";

export const cardVariants = cva(
  "relative rounded-[var(--radius)] border bg-[var(--color-card)] text-[var(--color-card-foreground)]",
  {
    variants: {
      variant: {
        plain: "",
        bracket:
          "before:content-[''] before:absolute before:top-[-1px] before:left-[-1px] before:w-3.5 before:h-3.5 before:border-[2px] before:border-b-0 before:border-r-0 before:border-[var(--color-primary)] after:content-[''] after:absolute after:bottom-[-1px] after:right-[-1px] after:w-3.5 after:h-3.5 after:border-[2px] after:border-t-0 after:border-l-0 after:border-[var(--color-primary)]",
        "bracket-olive":
          "before:content-[''] before:absolute before:top-[-1px] before:left-[-1px] before:w-3.5 before:h-3.5 before:border-[2px] before:border-b-0 before:border-r-0 before:border-[var(--color-olive)] after:content-[''] after:absolute after:bottom-[-1px] after:right-[-1px] after:w-3.5 after:h-3.5 after:border-[2px] after:border-t-0 after:border-l-0 after:border-[var(--color-olive)]",
      },
    },
    defaultVariants: { variant: "plain" },
  },
);

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, variant, ...props },
  ref,
) {
  return <div ref={ref} className={cn(cardVariants({ variant }), className)} {...props} />;
});

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col gap-1.5 border-b border-dashed border-[var(--color-border)] px-5 py-4",
          className,
        )}
        {...props}
      />
    );
  },
);

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...props }, ref) {
    return (
      <h3
        ref={ref}
        className={cn(
          "text-lg font-bold tracking-tight leading-tight text-[var(--color-foreground)]",
          className,
        )}
        {...props}
      />
    );
  },
);

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...props }, ref) {
  return (
    <p
      ref={ref}
      className={cn(
        "font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)]",
        className,
      )}
      {...props}
    />
  );
});

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} className={cn("px-5 py-4", className)} {...props} />;
  },
);

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center border-t border-dashed border-[var(--color-border)] px-5 py-3",
          className,
        )}
        {...props}
      />
    );
  },
);
