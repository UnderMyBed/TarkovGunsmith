import type { HydrateMod, HydrateWeapon } from "@tarkov/og";
import type { AvailabilityMod, AvailabilityOffer } from "./og-availability.js";
import {
  adaptMod,
  buildPriceUnder,
  parseBuilderPrices,
  parseBuilderSnapshot,
  resolveBuild,
  snapshotPart,
  snapshotPartsById,
  snapshotWeaponList,
  snapshotWeaponPresets,
  snapshotWeaponTree,
  type AttachablePart,
  type BuilderPrices,
  type BuilderSnapshot,
  type BuyForEntry,
  type PriceGate,
} from "@tarkov/data";

/**
 * The mods returned here serve two consumers: `hydrateBuildCard` draws their stats, and
 * `availabilityPillText` reads `offers` (every offer, priced or not). This intersection type
 * lets TypeScript see that one row satisfies both contracts.
 */
export type OgMod = HydrateMod & AvailabilityMod;

/** The build-time game data a card is drawn from. */
export interface OgData {
  snapshot: BuilderSnapshot;
  prices: BuilderPrices;
}

/** Where the deploy serves the two files, relative to the site root. */
export const OG_SNAPSHOT_PATH = "/data/builder-snapshot.json";
export const OG_PRICES_PATH = "/data/builder-prices.json";

/**
 * The parsed files, at module scope so an isolate reads them once rather than once per card.
 * They ship with the deploy that runs this code, so they cannot change under it. A failed load
 * is not kept: the next card tries again.
 */
let loaded: Promise<OgData> | null = null;

async function readAsset<T>(
  assets: Fetcher,
  origin: string,
  path: string,
  parse: (json: unknown) => T,
): Promise<T> {
  const response = await assets.fetch(new URL(path, origin).href);
  if (!response.ok) throw new Error(`${path}: ${response.status} ${response.statusText}`);
  return parse(await response.json());
}

/**
 * Load the snapshot and its release-time prices from the deploy's own static assets.
 *
 * @param assets - The Pages `ASSETS` binding.
 * @param requestUrl - The request being answered; only its origin is used.
 */
export function loadOgData(assets: Fetcher, requestUrl: string): Promise<OgData> {
  if (loaded !== null) return loaded;
  const { origin } = new URL(requestUrl);
  const pending = Promise.all([
    readAsset(assets, origin, OG_SNAPSHOT_PATH, parseBuilderSnapshot),
    readAsset(assets, origin, OG_PRICES_PATH, parseBuilderPrices),
  ]).then(([snapshot, prices]) => ({ snapshot, prices }));
  loaded = pending;
  pending.catch(() => {
    if (loaded === pending) loaded = null;
  });
  return pending;
}

/** Drop the isolate's loaded data. For tests. */
export function resetOgData(): void {
  loaded = null;
}

interface Args {
  weaponId: string;
  /** The saved build's attachments, slot path → item id. */
  attachments: Readonly<Record<string, string>>;
  /**
   * Whose gates price the card: the author's embedded profile, or `null` (theorycraft, the
   * cheapest path anyone can use) for a build saved without one.
   */
  gate: PriceGate;
}

/**
 * Every offer on one part, for the availability pill. Unpriced ones count: a Ref barter whose
 * GP-coin cost has no flea price still says which trader, at which level, sells the part.
 */
function availabilityOffers(buyFor: readonly BuyForEntry[]): AvailabilityOffer[] {
  return buyFor.map(({ vendor }) => ({
    vendor: { normalizedName: vendor.normalizedName },
    // Flattened up from the vendor, where availabilityPillText expects it.
    minTraderLevel:
      vendor.__typename === "TraderOffer" || vendor.__typename === "TraderBarter"
        ? (vendor.minTraderLevel ?? undefined)
        : undefined,
  }));
}

/**
 * The weapon and mounted parts of a saved build, as the card draws them.
 *
 * @throws When the build's weapon is not in the snapshot.
 */
export function fetchOgRowsForBuild(
  args: Args,
  data: OgData,
): {
  weapon: HydrateWeapon;
  mods: OgMod[];
  /** The attachments actually on the weapon (`resolveBuild`); the card counts these. */
  attachments: Record<string, string>;
  /**
   * The build's price under `args.gate` by the Builder's own rule (`buildPriceUnder`): weapon
   * or preset plus parts, at the release's prices. `null` unless every price is known.
   */
  priceRub: number | null;
} {
  const { snapshot } = data;
  const table = data.prices.prices;
  const found = snapshotWeaponList(snapshot, table).find((w) => w.id === args.weaponId);
  if (found === undefined) throw new Error(`og: weapon ${args.weaponId} not found`);

  const weapon: HydrateWeapon = {
    id: found.id,
    shortName: found.shortName,
    properties: {
      ergonomics: found.properties.ergonomics,
      recoilVertical: found.properties.recoilVertical,
      recoilHorizontal: found.properties.recoilHorizontal,
      centerOfImpact: found.properties.centerOfImpact,
      deviationCurve: found.properties.deviationCurve,
      velocity: found.velocity,
      fireRate: found.properties.fireRate,
      effectiveDistance: found.properties.effectiveDistance,
      sightingRange: found.properties.sightingRange,
      defaultAmmo:
        found.defaultAmmo === null
          ? null
          : { name: found.defaultAmmo.shortName, initialSpeed: found.defaultAmmo.initialSpeed },
    },
  };

  // Only parts on the weapon reach the card, resolved exactly as the Builder resolves them: a
  // key beneath an empty or replaced part, or an id the snapshot does not hold, is not on it.
  const { placed, attachments } = resolveBuild(
    snapshotWeaponTree(snapshot, args.weaponId),
    args.attachments,
    snapshotPartsById(snapshot),
  );

  // One row per distinct part: the lookup `hydrateBuildCard` maps `attachments` onto, one entry
  // per filled slot, so a part fitted twice counts twice for stats as in the Builder.
  const mods: OgMod[] = [];
  const priced = new Map<string, AttachablePart>();
  for (const { itemId } of placed) {
    if (priced.has(itemId)) continue;
    // The same part record and adapter the Builder uses, so a barrel, scope or magazine counts
    // here exactly as it does on the page, and cylinder ammo adds weight but no stat modifiers.
    const part = snapshotPart(snapshot, table, itemId)!;
    priced.set(itemId, part);
    const stats = adaptMod(part);
    mods.push({
      id: itemId,
      shortName: part.shortName,
      weight: part.weight,
      properties: {
        ergonomics: stats.ergonomicsDelta,
        recoilModifier: stats.recoilModifier,
        accuracyModifier: stats.accuracyModifier,
      },
      centerOfImpact: stats.centerOfImpact,
      deviationMax: stats.deviationMax,
      velocity: stats.velocity,
      sightingRange: stats.sightingRange,
      offers: availabilityOffers(part.buyFor ?? []),
    });
  }

  // One entry per filled slot, so a part fitted twice is paid for twice, as in the Builder.
  const parts = placed.map(({ itemId }) => priced.get(itemId)!);
  // The weapon's presets, as the Builder passes them (`priceBuild`): a build bought as a preset
  // does not pay again for the parts it comes with.
  const presets = snapshotWeaponPresets(snapshot, table)[args.weaponId] ?? [];
  const price = buildPriceUnder(args.gate, { weapon: found, parts, presets });
  return {
    weapon,
    mods,
    attachments: { ...attachments },
    priceRub: price.status === "priced" ? price.totalRUB : null,
  };
}
