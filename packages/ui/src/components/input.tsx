import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = "text", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-9 w-full rounded-[var(--radius)] border border-[var(--color-border-strong)] bg-[var(--color-input)] px-3 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-faint)] focus-visible:outline-none focus-visible:border-[var(--color-primary)] focus-visible:ring-1 focus-visible:ring-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-40 tabular-nums",
        // Numbers are set in the mono face; every other field is Chivo like the rest of the UI.
        type === "number" && "font-mono",
        className,
      )}
      {...props}
    />
  );
});
