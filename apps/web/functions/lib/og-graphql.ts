import type { BallisticMod } from "@tarkov/ballistics";
import type { HydrateWeapon } from "@tarkov/og";
import { availabilityPill } from "./og-availability.js";
import {
  adaptMod,
  adaptWeapon,
  Build,
  BuildPair,
  buildPriceUnder,
  loadSavedBuild,
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
  type BuildV6,
  type PlayerProfile,
  type PriceGate,
} from "@tarkov/data";

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

/**
 * A stored build of any version, as the Builder opens it: checked against the `Build` schema,
 * as `loadBuild` checks it for the SPA, then brought to the current version and checked
 * against the game data by `loadSavedBuild`, the SPA's one load path (`/builder/$id`). A v1
 * build's bare mod ids are placed on the weapon here; nothing downstream reads an old shape.
 *
 * @throws The schema's error when the record is not a build the SPA would open either.
 */
export function loadStoredBuild(raw: unknown, snapshot: BuilderSnapshot): BuildV6 {
  return loadSavedBuild(Build.parse(raw), snapshot);
}

/** A stored comparison: each side through {@link loadStoredBuild}'s path, with its profile. */
export interface StoredPairSide {
  build: BuildV6;
  /** The side's profile, which the Compare page prices it under (`compare-workspace.tsx`). */
  profile: PlayerProfile | undefined;
}

/**
 * A stored comparison of any version, both sides loaded as the Compare page loads them
 * (`loadPair` in `apps/web/src/features/builder/compare/known-parts.ts`).
 *
 * @throws The schema's error when the record is not a pair the SPA would open either.
 */
export function loadStoredPair(
  raw: unknown,
  snapshot: BuilderSnapshot,
): { left: StoredPairSide | null; right: StoredPairSide | null } {
  const pair = BuildPair.parse(raw);
  const side = (build: Build | null, profile: PlayerProfile | undefined) =>
    build === null ? null : { build: loadSavedBuild(build, snapshot), profile };
  return {
    left: side(pair.left, pair.leftProfile),
    right: side(pair.right, pair.rightProfile),
  };
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
 * The weapon and mounted parts of a saved build, as the card draws them.
 *
 * @throws When the build's weapon is not in the snapshot.
 */
export function fetchOgRowsForBuild(
  args: Args,
  data: OgData,
): {
  weapon: HydrateWeapon;
  /**
   * Every part on the weapon as the Builder hands it to `weaponSpec`: `adaptMod` over
   * `resolveBuild(...).placed`, one entry per filled slot, so a part fitted twice counts twice.
   */
  mods: BallisticMod[];
  /**
   * The availability pill under `args.gate` (`availabilityPill`), from the same weapon, parts
   * and price; `null` when there is nothing to show.
   */
  availability: string | null;
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

  // The weapon's own stats, its weight included, through the Builder's own adapter.
  const weapon: HydrateWeapon = { shortName: found.shortName, ballistic: adaptWeapon(found) };

  // Only parts on the weapon reach the card, resolved exactly as the Builder resolves them: a
  // key beneath an empty or replaced part, or an id the snapshot does not hold, is not on it.
  const { placed } = resolveBuild(
    snapshotWeaponTree(snapshot, args.weaponId),
    args.attachments,
    snapshotPartsById(snapshot),
  );

  // Each distinct part, priced once from the release's table; `placed` repeats it per slot.
  const priced = new Map<string, AttachablePart>();
  for (const { itemId } of placed) {
    if (priced.has(itemId)) continue;
    const part = snapshotPart(snapshot, table, itemId);
    // `resolveBuild` places only ids the snapshot holds, so this cannot miss; if it does, the
    // card fails rather than drawing a build short a part.
    if (part === undefined) throw new Error(`og: placed part ${itemId} not in the snapshot`);
    priced.set(itemId, part);
  }

  // One entry per filled slot, so a part fitted twice counts and is paid for twice, as in the
  // Builder. The same adapter the Builder uses: a barrel, scope or magazine counts here exactly
  // as it does on the page, and cylinder ammo adds weight but no stat modifiers.
  const parts = placed.map(({ itemId }) => priced.get(itemId)!);
  // The weapon's presets, as the Builder passes them (`priceBuild`): a build bought as a preset
  // does not pay again for the parts it comes with.
  const presets = snapshotWeaponPresets(snapshot, table)[args.weaponId] ?? [];
  const price = buildPriceUnder(args.gate, { weapon: found, parts, presets });
  return {
    weapon,
    mods: parts.map(adaptMod),
    availability: availabilityPill(
      args.gate,
      { weapon: found, parts: [...priced.values()] },
      price,
    ),
    priceRub: price.status === "priced" ? price.totalRUB : null,
  };
}
