import type { Zone } from "@tarkov/ballistics";

export interface ZoneMeta {
  /** Human-readable label for the zone, shown in UI lists and buttons. */
  readonly label: string;
  /** Tailwind background utility for the zone's fill, as a Field Ledger token. */
  readonly colorClass: string;
  /** Tailwind text utility paired with `colorClass` — see the contrast note below. */
  readonly textClass: string;
}

/**
 * Zone fills, on the Field Ledger palette.
 *
 * These were the last raw Tailwind palette classes in the app (`bg-amber-700`, `bg-red-700`,
 * `bg-orange-700`, `bg-sky-700`, `bg-teal-700`, plus `text-white`). Two were already the palette
 * by coincidence — Tailwind's `amber-700` IS `--color-amber-deep` (#b45309) and `red-700` IS
 * `--color-destructive` (#b91c1c) — and the two cool hues, sky and teal, had nothing behind them
 * in a warm amber/olive/paper system. The palette is defined in `packages/ui/src/styles/index.css`.
 *
 * The five fills run by lethality rather than as arbitrary hues: amber head, red thorax, rust
 * stomach, olive arms, stroke-grey legs. That is the ordering the Simulator is about, and it is
 * one a two-hue palette can actually express.
 *
 * Each zone carries its own text token because no single one clears contrast on all five fills.
 * Ratios at full opacity, text on fill: head 8.9:1, thorax 5.1:1, stomach 5.2:1, arms 5.1:1,
 * legs 8.8:1 — every one at or above the 5.0:1 floor the previous `text-white` pairings held,
 * and all above the 4.5:1 needed for these 12px labels.
 *
 * Head takes `--color-primary` rather than the identical-to-before `--color-amber-deep` for that
 * reason and no other: amber-deep is a mid-tone that reaches only 3.9:1 against the light text
 * token and 3.8:1 against the dark one, so it has no accessible label colour in this palette.
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
    colorClass: "bg-[var(--color-rust)]",
    textClass: "text-[var(--color-foreground)]",
  },
  leftArm: {
    label: "L. Arm",
    colorClass: "bg-[var(--color-olive)]",
    textClass: "text-[var(--color-primary-foreground)]",
  },
  rightArm: {
    label: "R. Arm",
    colorClass: "bg-[var(--color-olive)]",
    textClass: "text-[var(--color-primary-foreground)]",
  },
  leftLeg: {
    label: "L. Leg",
    colorClass: "bg-[var(--color-border)]",
    textClass: "text-[var(--color-foreground)]",
  },
  rightLeg: {
    label: "R. Leg",
    colorClass: "bg-[var(--color-border)]",
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
