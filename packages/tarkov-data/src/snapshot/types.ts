import type { z } from "zod";
import type { snapshotPartSchema } from "../queries/parts.js";
import type { snapshotWeaponSchema } from "../queries/weaponList.js";
import type { SlotOwner } from "../queries/slot-graph.js";
import type { UnpricedOffer } from "../queries/shared/buy-for.js";
import type { PriceTable } from "../prices/table.js";
import type { TaskListItem } from "../queries/tasks.js";
import type { TraderListItem } from "../queries/traders.js";
import type { WeaponPreset } from "../queries/presets.js";

/**
 * Version of the snapshot file shape. Bump it with any change to {@link BuilderSnapshot} or
 * {@link BuilderPrices}: the snapshot ships in the same deploy as the code that reads it, so
 * the only reader that can ever see a different version is a tab opened before a deploy.
 */
export const BUILDER_SNAPSHOT_SCHEMA = 4;

/** Where a snapshot's documents came from: live `json.tarkov.dev`, or the committed captures. */
export type SnapshotSource = "upstream" | "fixtures";

export type SnapshotWeapon = z.infer<typeof snapshotWeaponSchema>;
export type SnapshotPart = z.infer<typeof snapshotPartSchema>;

/**
 * A weapon preset placed into the slot graph, as a new build of its weapon starts from.
 *
 * What the preset costs is split the way upstream splits it: its trader offers and barters
 * are already among its weapon's offers, tagged with the preset, so they are not repeated
 * here. Its own flea listing is not among them (a weapon's flea offer is the bare receiver's),
 * so it is carried here: `flea` is the listing's player-level gate, or `null` when upstream
 * flags the preset `noFlea`. The listing is priced from the preset's own id.
 */
export interface SnapshotPreset extends WeaponPreset {
  readonly flea: { readonly minPlayerLevel: number | null } | null;
}

/**
 * The Builder's game data, generated at build time from the upstream documents.
 *
 * Every shape inside is one the rest of this package already uses, minus prices: weapons are
 * `WeaponListItem`s and parts `AttachablePart`s without `buyFor`, `slots` is `SlotGraph.owners`
 * verbatim, and `offers` are `UnpricedOffer`s that {@link priceOffers} turns into `buyFor`.
 * Served as `/data/builder-snapshot.json`.
 */
export interface BuilderSnapshot {
  readonly schema: typeof BUILDER_SNAPSHOT_SCHEMA;
  readonly source: SnapshotSource;
  /**
   * The newest `updated` timestamp in the items document (ISO 8601). Upstream refreshes some
   * item every few minutes, so this is in effect when the snapshot was taken, not when the
   * game last changed.
   */
  readonly dataAsOf: string;
  /** Buildable weapons, sorted by id. */
  readonly weapons: readonly SnapshotWeapon[];
  /** Every part reachable through slots from a buildable weapon, sorted by id. */
  readonly parts: readonly SnapshotPart[];
  /** Slots of every weapon and reachable part that has any, keyed by owner id. */
  readonly slots: Readonly<Record<string, SlotOwner>>;
  /** Unpriced offers for every weapon and part, keyed by item id. */
  readonly offers: Readonly<Record<string, readonly UnpricedOffer[]>>;
  /**
   * Weapon id → its presets: exactly one default, listed first, then the rest in document
   * order. A weapon upstream gives no preset is absent.
   */
  readonly presets: Readonly<Record<string, readonly SnapshotPreset[]>>;
  /** Names of barter ingredients that are neither weapons nor parts. */
  readonly ingredientNames: Readonly<Record<string, string>>;
  /** Every trader, including the ones the profile does not track. */
  readonly traders: readonly TraderListItem[];
  /**
   * The tasks that gate an offer above, sorted by `normalizedName`: the quests a profile can
   * mark done. Every other upstream task is left out.
   */
  readonly tasks: readonly TaskListItem[];
}

/**
 * Prices as of the snapshot, served as `/data/builder-prices.json`. Only the Open Graph card
 * Functions read this: a share card is cached for 30 days, so its price is a point-in-time
 * figure regardless. The SPA prices from live data.
 */
export interface BuilderPrices {
  readonly schema: typeof BUILDER_SNAPSHOT_SCHEMA;
  readonly source: SnapshotSource;
  readonly dataAsOf: string;
  readonly prices: PriceTable;
}
