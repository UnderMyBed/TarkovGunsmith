import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Compose class names with `clsx` and dedupe conflicting Tailwind utilities
 * with `tailwind-merge`. Use inside every `className={cn(...)}` for predictable
 * variant overrides.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
