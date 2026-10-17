import type { Zone } from "@tarkov/ballistics";

export interface ZoneMeta {
  /** Human-readable label for the zone, shown in UI lists and buttons. */
  readonly label: string;
  /** Tailwind background utility for the zone's fill, as a palette token. */
  readonly colorClass: string;
  /** Tailwind text utility paired with `colorClass` — see the contrast note below. */
  readonly textClass: string;
}

/**
 * Zone fills, on the palette tokens in `packages/ui/src/styles/index.css`.
 *
 * The fills run by lethality: accent head, error-red thorax, orange stomach, blue arms,
 * strong-line grey legs.
 *
 * Each zone carries its own text token because no single one clears contrast on all five
 * fills. Ratios, text on fill: head 7.4:1, thorax 7.5:1, stomach 8.7:1, arms 9.0:1,
 * legs 7.4:1 — all above the 4.5:1 needed for these labels.
 */
export const ZONE_META: Readonly<Record<Zone, ZoneMeta>> = {
  head: {
    label: "Head",
    colorClass: "bg-[var(--color-primary)]",
    textClass: "text-[var(--color-primary-foreground)]",
  },
  thorax: {
    label: "Thorax",
    colorClass: "bg-[var(--color-destructive)]",
    textClass: "text-[var(--color-destructive-foreground)]",
  },
  stomach: {
    label: "Stomach",
    colorClass: "bg-[var(--color-worse)]",
    textClass: "text-[var(--color-destructive-foreground)]",
  },
  leftArm: {
    label: "L. Arm",
    colorClass: "bg-[var(--color-better)]",
    textClass: "text-[var(--color-primary-foreground)]",
  },
  rightArm: {
    label: "R. Arm",
    colorClass: "bg-[var(--color-better)]",
    textClass: "text-[var(--color-primary-foreground)]",
  },
  leftLeg: {
    label: "L. Leg",
    colorClass: "bg-[var(--color-border-strong)]",
    textClass: "text-[var(--color-foreground)]",
  },
  rightLeg: {
    label: "R. Leg",
    colorClass: "bg-[var(--color-border-strong)]",
    textClass: "text-[var(--color-foreground)]",
  },
};

/** Stable display order for zones — top to bottom on the silhouette. */
export const ORDERED_ZONES: readonly Zone[] = [
  "head",
  "thorax",
  "stomach",
  "leftArm",
  "rightArm",
  "leftLeg",
  "rightLeg",
];

/**
 * Return the display label for a zone.
 *
 * @example
 *   zoneLabel("head")     // "Head"
 *   zoneLabel("leftLeg")  // "L. Leg"
 */
export function zoneLabel(zone: Zone): string {
  return ZONE_META[zone].label;
}
