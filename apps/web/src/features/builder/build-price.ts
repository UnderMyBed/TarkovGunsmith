import {
  buildPriceUnder,
  resolveBuild,
  type AttachablePart,
  type BuildPrice,
  type PriceGate,
  type PricedPreset,
  type WeaponListItem,
  type WeaponTree,
} from "@tarkov/data";

/**
 * What a build costs under `gate`: the weapon by its cheapest path, preset or receiver, plus
 * every part on the weapon that path does not come with ({@link buildPriceUnder}). Only parts
 * on the weapon count, one per filled slot, as for stats.
 *
 * `null` until the weapon, its slot tree and the part catalog are all in hand. A missing
 * price is never `0`: see `price-under.ts` in `@tarkov/data`.
 */
export function priceBuild(
  gate: PriceGate,
  weapon: WeaponListItem | undefined,
  tree: WeaponTree | undefined,
  attachments: Readonly<Record<string, string>>,
  byId: ReadonlyMap<string, AttachablePart>,
  presets: readonly PricedPreset[],
): BuildPrice | null {
  if (weapon === undefined || tree === undefined || tree.weaponId !== weapon.id) return null;
  const parts = resolveBuild(tree, attachments, byId).placed.map((e) => e.part);
  return buildPriceUnder(gate, { weapon, parts, presets });
}

/** The total a build price can be compared by: known only when every price on it is. */
export function totalOf(price: BuildPrice | null): number | null {
  return price?.status === "priced" ? price.totalRUB : null;
}

const RUB = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** `₽82,984`. */
export function formatRub(value: number): string {
  return `₽${RUB.format(value)}`;
}

/**
 * One line saying what a build costs, naming what keeps it from a total: the parts with no
 * price, or the parts (or weapon) the gate cannot get. `nameOf` names an item id.
 */
export function describeBuildPrice(price: BuildPrice, nameOf: (id: string) => string): string {
  switch (price.status) {
    case "priced":
      return formatRub(price.totalRUB);
    case "unknown":
      return `${formatRub(price.knownRUB)} known; no price for ${price.unpriced.map(nameOf).join(", ")}`;
    case "unobtainable":
      return `Can't be bought: ${price.missing.map(nameOf).join(", ")}`;
  }
}

/** Where live prices stand, for the line that says how old they are. */
export type PricesStatus =
  | { readonly state: "loading" }
  | { readonly state: "ready"; readonly asOf: string }
  | { readonly state: "error"; readonly message: string };

/** {@link PricesStatus} from the `useLivePrices` query. A table in hand wins over a failed refresh. */
export function pricesStatus(query: {
  readonly data?: { readonly asOf: string } | undefined;
  readonly error: Error | null;
}): PricesStatus {
  if (query.data !== undefined) return { state: "ready", asOf: query.data.asOf };
  if (query.error !== null) return { state: "error", message: query.error.message };
  return { state: "loading" };
}

/**
 * Item id → how many of it the preset `price` buys the weapon as comes with; empty for the
 * receiver, or a build with no path.
 */
export function coversOf(
  price: BuildPrice | null,
  presets: readonly PricedPreset[],
): ReadonlyMap<string, number> {
  const covers = new Map<string, number>();
  if (price === null || price.status === "unobtainable" || price.presetId === null) return covers;
  const preset = presets.find((p) => p.id === price.presetId);
  for (const id of Object.values(preset?.attachments ?? {}))
    covers.set(id, (covers.get(id) ?? 0) + 1);
  return covers;
}
