import { createBuilderDataSource, createTarkovClient } from "@tarkov/data";
import type { BuilderDataSource, TarkovJsonClient } from "@tarkov/data";

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

/**
 * The Builder's game data from the snapshot, priced from upstream's live items document in a
 * Web Worker (`prices.worker.ts`). Where `Worker` does not exist — Node, the unit tests — the
 * prices are fetched on the calling thread instead.
 */
export const builderData: BuilderDataSource = createBuilderDataSource({
  snapshotUrl: BUILDER_SNAPSHOT_URL,
  itemsUrl: `${TARKOV_JSON_API_BASE}items`,
  ...(typeof Worker === "undefined"
    ? {}
    : {
        createPriceWorker: () =>
          new Worker(new URL("./prices.worker.ts", import.meta.url), { type: "module" }),
      }),
});
