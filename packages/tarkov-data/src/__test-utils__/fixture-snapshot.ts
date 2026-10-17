import { fixtureClient } from "../__fixtures__/client.js";
import type { TarkovJsonClient } from "../client.js";
import type { Barter } from "../queries/barters.js";
import type { AttachablePart } from "../queries/parts.js";
import { createOfferResolver, type OfferResolver } from "../queries/shared/buy-for.js";
import type { WeaponTree } from "../queries/slot-graph.js";
import type { WeaponListItem } from "../queries/weaponList.js";
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
  return staticBuilderDataSource(snapshot, prices.prices);
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
 * `createOfferResolver` over a client's documents, with traders, tasks and barters validated
 * by the generator first — what pricing an item straight from the documents looks like.
 */
export async function fixtureOfferResolver(
  client: TarkovJsonClient = fixtureClient(),
): Promise<OfferResolver> {
  const docs = await fetchSnapshotDocuments(client);
  const { snapshot } = buildBuilderSnapshot(docs, "fixtures");
  return createOfferResolver({
    items: docs.items.items,
    traders: snapshot.traders,
    tasks: snapshot.tasks,
    // Validated by the generator call above, which throws on any malformed barter.
    barters: docs.barters as Barter[],
  });
}
