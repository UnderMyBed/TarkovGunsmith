import { forwardRef, type ImgHTMLAttributes } from "react";
import { cn } from "../lib/cn.js";
import { iconUrl } from "./tarkov-icon.js";

/**
 * Build the CDN URL for a weapon's silhouette base-image.
 *
 * Delegates to `iconUrl(itemId, "base-image")` — exported separately so
 * tests can assert the URL without rendering.
 */
export function weaponSilhouetteSrc(itemId: string): string {
  return iconUrl(itemId, "base-image");
}

export interface WeaponSilhouetteProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  /** Weapon item id. Passed to `iconUrl(..., "base-image")`. */
  itemId: string;
}

/**
 * Renders a weapon's base-image from the tarkov.dev CDN, treated as a
 * Field Ledger monochrome silhouette. Hides itself on CDN failure so
 * layout stays intact.
 *
 * Consumer controls sizing/positioning via `className`. Typical pattern:
 *
 *     <div className="absolute inset-y-0 right-0 w-1/2 pointer-events-none">
 *       <WeaponSilhouette
 *         itemId={weaponId}
 *         alt={weaponName}
 *         className="h-full w-full object-contain object-right"
 *       />
 *     </div>
 */
/* v8 ignore next 24 -- presentational; covered by apps/web Playwright tests */
export const WeaponSilhouette = forwardRef<HTMLImageElement, WeaponSilhouetteProps>(
  function WeaponSilhouette({ itemId, className, alt = "", loading = "lazy", ...props }, ref) {
    return (
      <img
        ref={ref}
        src={weaponSilhouetteSrc(itemId)}
        alt={alt}
        loading={loading}
        className={cn(
          "block [filter:grayscale(1)_brightness(0.95)_contrast(1.15)] mix-blend-multiply",
          className,
        )}
        style={{ opacity: 0.55 }}
        onError={(e) => {
          // Hide on CDN 404 / network failure; consumer layout unaffected.
          const el = e.currentTarget;
          el.style.display = "none";
        }}
        {...props}
      />
    );
  },
);
