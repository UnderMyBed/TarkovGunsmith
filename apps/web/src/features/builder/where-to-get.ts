import type { ItemAvailability } from "@tarkov/data";

const TRADER_LABELS: Readonly<Record<string, string>> = {
  prapor: "Prapor",
  therapist: "Therapist",
  fence: "Fence",
  skier: "Skier",
  peacekeeper: "Peacekeeper",
  mechanic: "Mechanic",
  ragman: "Ragman",
  jaeger: "Jaeger",
  ref: "Ref",
  lightkeeper: "Lightkeeper",
  "btr-driver": "BTR Driver",
};

/** A trader's display name from upstream's `normalizedName`: "peacekeeper" → "Peacekeeper". */
export function traderLabel(normalizedName: string): string {
  return (
    TRADER_LABELS[normalizedName] ??
    normalizedName
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}

/**
 * The trader an available part is bought from, for the words before its availability pill
 * ("Peacekeeper" before "LL1"); `null` for the flea market and for a part no path is open to.
 */
export function sellerOf(availability: ItemAvailability): string | null {
  if (!availability.available || availability.kind === "flea") return null;
  return traderLabel(availability.traderNormalizedName);
}

/** What an available part costs by the path shown, in roubles, or `null` when unpriced. */
export function priceOf(availability: ItemAvailability | null): number | null {
  return availability?.available ? availability.priceRUB : null;
}
