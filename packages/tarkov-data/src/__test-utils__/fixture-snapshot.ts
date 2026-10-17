import { fixtureClient } from "../__fixtures__/client.js";
import type { TarkovJsonClient } from "../client.js";
import type { Barter } from "../queries/barters.js";
import type { AttachablePart } from "../queries/parts.js";
import { createOfferResolver, type OfferResolver } from "../queries/shared/buy-for.js";
import type { WeaponTree } from "../queries/slot-graph.js";
import type { WeaponListItem } from "../queries/weaponList.js";
import { taskListItemSchema } from "../queries/tasks.js";
import { buildBuilderSnapshot, fetchSnapshotDocuments } from "../snapshot/generate.js";
import { staticBuilderDataSource, type BuilderDataSource } from "../snapshot/source.js";
import type { BuilderPrices, BuilderSnapshot } from "../snapshot/types.js";
import { snapshotPartCatalog, snapshotWeaponList, snapshotWeaponTree } from "../snapshot/views.js";

/**
 * The Builder snapshot built from a client's documents — the committed captures by default —
 * through the real generator, exactly as `apps/web` builds it for e2e. Built fresh per call:
 * tests may not share a mutable object.
 */
export async function fixtureSnapshot(
  client: TarkovJsonClient = fixtureClient(),
): Promise<{ snapshot: BuilderSnapshot; prices: BuilderPrices }> {
  return buildBuilderSnapshot(await fetchSnapshotDocuments(client), "fixtures");
}

/** A Builder data source over {@link fixtureSnapshot}, priced at the captures' prices. */
export async function fixtureBuilderData(
  client: TarkovJsonClient = fixtureClient(),
): Promise<BuilderDataSource> {
  const { snapshot, prices } = await fixtureSnapshot(client);
  return staticBuilderDataSource(snapshot, prices);
}

/** The part catalog the Builder sees, priced at the captures' prices. */
export async function fixturePartCatalog(
  client: TarkovJsonClient = fixtureClient(),
): Promise<AttachablePart[]> {
  const { snapshot, prices } = await fixtureSnapshot(client);
  return snapshotPartCatalog(snapshot, prices.prices);
}

/** The weapon list the Builder sees, priced at the captures' prices. */
export async function fixtureWeaponList(
  client: TarkovJsonClient = fixtureClient(),
): Promise<WeaponListItem[]> {
  const { snapshot, prices } = await fixtureSnapshot(client);
  return snapshotWeaponList(snapshot, prices.prices);
}

/** One weapon's tree as the Builder sees it. */
export async function fixtureWeaponTree(
  client: TarkovJsonClient,
  weaponId: string,
): Promise<WeaponTree> {
  return snapshotWeaponTree((await fixtureSnapshot(client)).snapshot, weaponId);
}

/**
 * `createOfferResolver` over a client's documents, with traders validated by the generator
 * first — what pricing an item straight from the documents looks like. Tasks are every task
 * in the documents, not the snapshot's: the snapshot keeps only the quests that gate one of
 * its own offers, and the resolver may be asked about any item.
 */
export async function fixtureOfferResolver(
  client: TarkovJsonClient = fixtureClient(),
): Promise<OfferResolver> {
  const docs = await fetchSnapshotDocuments(client);
  const { snapshot } = buildBuilderSnapshot(docs, "fixtures");
  const traderName = new Map(snapshot.traders.map((t) => [t.id, t.normalizedName]));
  const tasks = Object.values(docs.tasks.tasks).map((raw) =>
    taskListItemSchema.parse({
      ...(raw as object),
      trader: { normalizedName: traderName.get((raw as { trader: string }).trader) },
    }),
  );
  return createOfferResolver({
    items: docs.items.items,
    traders: snapshot.traders,
    tasks,
    // Unvalidated: the generator parses only barters that reward a snapshot item, so one for
    // anything else reaches the resolver as upstream sent it. The captured barters are all
    // well-formed; a test that breaks one should build its resolver itself.
    barters: docs.barters as Barter[],
  });
}
