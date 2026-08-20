import type { HydrateMod, HydrateWeapon } from "@tarkov/og";
import type { AvailabilityMod } from "./og-availability.js";
import {
  createTarkovClient,
  resolveBuyFor,
  fetchTraders,
  fetchTasks,
  type TarkovJsonClient,
} from "@tarkov/data";

/**
 * The mods returned by this fetcher serve two consumers: `hydrateBuildCard`
 * (reads `buyFor[].priceRUB`) and `availabilityPillText` (reads
 * `buyFor[].vendor.normalizedName` + `minTraderLevel`). This intersection type
 * lets TypeScript see that one row satisfies both contracts.
 */
export type OgMod = HydrateMod & AvailabilityMod;

/**
 * Base URL for the tarkov.dev JSON API.
 *
 * This module used to POST GraphQL to api.tarkov.dev, which has been unavailable since
 * ~2026-07-21 (the-hideout/tarkov-api#474) — OG cards silently rendered without stats.
 */
export const OG_JSON_API_BASE = "https://json.tarkov.dev/regular/";

/**
 * Clients keyed by base URL, at module scope so the items document is fetched once per
 * isolate rather than once per card render. The client's own TTL cache does the work; OG
 * rendering is per-request and the document is 1.36 MB gzipped, so an uncached fetch per card
 * would be untenable.
 *
 * Keyed rather than singular because the base is configurable (see `fetchOgRowsForBuild`),
 * and a client built for one base must never answer a request meant for another.
 */
const clientsByBase = new Map<string, TarkovJsonClient>();

function clientFor(baseUrl: string): TarkovJsonClient {
  const existing = clientsByBase.get(baseUrl);
  if (existing !== undefined) return existing;
  const created = createTarkovClient(baseUrl);
  clientsByBase.set(baseUrl, created);
  return created;
}

interface Args {
  weaponId: string;
  modIds: readonly string[];
}

interface ItemsDoc {
  items: Record<string, unknown>;
}

function readNumber(source: unknown, key: string): number {
  if (source === null || typeof source !== "object") return 0;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "number" ? value : 0;
}

/**
 * @param baseUrl - Where to read the items/traders/tasks documents from. Defaults to
 *   {@link OG_JSON_API_BASE}, which is what production runs on. The override exists for the
 *   e2e suite: these Functions execute server-side inside `wrangler pages dev`, so their
 *   upstream call is out of reach of the browser-side interception in
 *   `apps/web/e2e/upstream.ts`, and Playwright points them at a local fixture server through
 *   the `TARKOV_JSON_API_BASE` binding instead. An empty or absent value falls back to
 *   production rather than producing a request to `undefined/items`.
 */
export async function fetchOgRowsForBuild(
  args: Args,
  baseUrl?: string,
): Promise<{ weapon: HydrateWeapon; mods: OgMod[] }> {
  const client = clientFor(baseUrl !== undefined && baseUrl !== "" ? baseUrl : OG_JSON_API_BASE);

  const [doc, traders, tasks] = await Promise.all([
    client.fetchResource<ItemsDoc>("items"),
    fetchTraders(client),
    fetchTasks(client),
  ]);

  const rawWeapon = doc.items[args.weaponId];
  if (rawWeapon === null || rawWeapon === undefined || typeof rawWeapon !== "object") {
    throw new Error(`og-graphql: weapon ${args.weaponId} not found`);
  }
  const weaponRecord = rawWeapon as Record<string, unknown>;
  const weaponProps = weaponRecord.properties;

  const weapon: HydrateWeapon = {
    id: args.weaponId,
    shortName: typeof weaponRecord.shortName === "string" ? weaponRecord.shortName : args.weaponId,
    properties: {
      ergonomics: readNumber(weaponProps, "ergonomics"),
      recoilVertical: readNumber(weaponProps, "recoilVertical"),
      recoilHorizontal: readNumber(weaponProps, "recoilHorizontal"),
    },
  };

  const mods: OgMod[] = [];
  for (const id of args.modIds) {
    const raw = doc.items[id];
    if (raw === null || raw === undefined || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const props = record.properties;

    mods.push({
      id,
      shortName: typeof record.shortName === "string" ? record.shortName : id,
      weight: readNumber(record, "weight"),
      properties: {
        ergonomics: readNumber(props, "ergonomics"),
        recoilModifier: readNumber(props, "recoilModifier"),
        accuracyModifier: readNumber(props, "accuracyModifier"),
      },
      // Flatten minTraderLevel up from the vendor, where availabilityPillText expects it.
      buyFor: resolveBuyFor(raw, traders, tasks).map((entry) => ({
        vendor: { normalizedName: entry.vendor.normalizedName },
        priceRUB: entry.priceRUB ?? 0,
        minTraderLevel:
          entry.vendor.__typename === "TraderOffer"
            ? (entry.vendor.minTraderLevel ?? undefined)
            : undefined,
      })),
    });
  }

  return { weapon, mods };
}
