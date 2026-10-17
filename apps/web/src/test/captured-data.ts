import {
  buildBuilderSnapshot,
  createTarkovClient,
  fetchSnapshotDocuments,
  type BuilderPrices,
  type BuilderSnapshot,
} from "@tarkov/data";
import { upstreamFixtureBody } from "../../e2e/upstream-fixtures.js";

/**
 * The snapshot and prices the fixture deploy serves, generated from the committed captures
 * (`packages/tarkov-data/src/__fixtures__/`) exactly as `scripts/builder-snapshot.ts` does: real
 * weapons with real presets, for tests whose point needs them.
 */
export async function capturedBuilderData(): Promise<{
  snapshot: BuilderSnapshot;
  prices: BuilderPrices;
}> {
  const client = createTarkovClient("https://json.tarkov.dev/regular/", (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const body = upstreamFixtureBody(new URL(url).pathname.split("/").pop() ?? "");
    return Promise.resolve(new Response(body, { status: body === null ? 404 : 200 }));
  });
  return buildBuilderSnapshot(await fetchSnapshotDocuments(client), "fixtures");
}
