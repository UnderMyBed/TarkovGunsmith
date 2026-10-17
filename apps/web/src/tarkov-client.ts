import { createBuilderDataSource, createTarkovClient, memoryFetchedAtStore } from "@tarkov/data";
import type { BuilderDataSource, FetchedAtStore, TarkovJsonClient } from "@tarkov/data";

/**
 * Base URL for the tarkov.dev JSON API, including game mode.
 *
 * The GraphQL API this project originally used (api.tarkov.dev/graphql) has been
 * unavailable since ~2026-07-21 and tarkov.dev itself runs on this JSON API.
 * See the-hideout/tarkov-api#474.
 */
export const TARKOV_JSON_API_BASE = "https://json.tarkov.dev/regular/";

/** Where the build-time Builder snapshot is served (`apps/web/scripts/builder-snapshot.ts`). */
export const BUILDER_SNAPSHOT_URL = "/data/builder-snapshot.json";

export const tarkovClient: TarkovJsonClient = createTarkovClient(TARKOV_JSON_API_BASE);

const FETCHED_AT_KEY = "tarkov:prices-fetched-at";

/**
 * When prices were last fetched from upstream, kept in `localStorage` so the next page load
 * lets the HTTP cache answer within the hour. Where storage is unavailable (private windows,
 * blocked site data) it lasts as long as the page, which costs one uncached fetch per load.
 */
export function localFetchedAtStore(): FetchedAtStore {
  const memory = memoryFetchedAtStore();
  return {
    get: () => {
      try {
        const value = Number(localStorage.getItem(FETCHED_AT_KEY));
        return Number.isFinite(value) && value > 0 ? value : memory.get();
      } catch {
        return memory.get();
      }
    },
    set: (fetchedAt) => {
      memory.set(fetchedAt);
      try {
        localStorage.setItem(FETCHED_AT_KEY, String(fetchedAt));
      } catch {
        // Storage refused: the in-memory copy above still serves this page.
      }
    },
  };
}

/**
 * The Builder's game data from the snapshot, priced from upstream's live items document in a
 * Web Worker (`prices.worker.ts`). Where `Worker` does not exist — Node, the unit tests — the
 * prices are fetched on the calling thread instead.
 */
export const builderData: BuilderDataSource = createBuilderDataSource({
  snapshotUrl: BUILDER_SNAPSHOT_URL,
  itemsUrl: `${TARKOV_JSON_API_BASE}items`,
  fetchedAtStore: localFetchedAtStore(),
  ...(typeof Worker === "undefined"
    ? {}
    : {
        createPriceWorker: () =>
          new Worker(new URL("./prices.worker.ts", import.meta.url), { type: "module" }),
      }),
});
