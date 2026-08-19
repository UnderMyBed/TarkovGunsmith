import { forwardRef } from "react";
import type { ImgHTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

const CDN_BASE = "https://assets.tarkov.dev";

export type IconVariant = "icon" | "grid-image" | "base-image";

/**
 * Build the CDN URL for a tarkov-api item icon.
 *
 * @example
 *   iconUrl("5656d7c34bdc2d9d198b4587"); // → "https://assets.tarkov.dev/5656d7c34bdc2d9d198b4587-icon.webp"
 */
export function iconUrl(itemId: string, variant: IconVariant = "icon"): string {
  if (!itemId) throw new Error("iconUrl: itemId is required");
  return `${CDN_BASE}/${itemId}-${variant}.webp`;
}

export interface TarkovIconProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  itemId: string;
  variant?: IconVariant;
}

/**
 * Renders an EFT item icon from `assets.tarkov.dev`.
 */
export const TarkovIcon = forwardRef<HTMLImageElement, TarkovIconProps>(function TarkovIcon(
  { itemId, variant = "icon", className, alt = "", loading = "lazy", ...props },
  ref,
) {
  return (
    <img
      ref={ref}
      src={iconUrl(itemId, variant)}
      alt={alt}
      loading={loading}
      className={cn("inline-block", className)}
      {...props}
    />
  );
});
