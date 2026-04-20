import type { Zone } from "@tarkov/ballistics";

export interface ZoneMeta {
  /** Human-readable label for the zone, shown in UI lists and buttons. */
  readonly label: string;
  /** Tailwind utility class for the zone's accent colour (pill backgrounds). */
  readonly colorClass: string;
}

export const ZONE_META: Readonly<Record<Zone, ZoneMeta>> = {
  head: { label: "Head", colorClass: "bg-amber-700" },
  thorax: { label: "Thorax", colorClass: "bg-red-700" },
  stomach: { label: "Stomach", colorClass: "bg-orange-700" },
  leftArm: { label: "L. Arm", colorClass: "bg-sky-700" },
  rightArm: { label: "R. Arm", colorClass: "bg-sky-700" },
  leftLeg: { label: "L. Leg", colorClass: "bg-teal-700" },
  rightLeg: { label: "R. Leg", colorClass: "bg-teal-700" },
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
