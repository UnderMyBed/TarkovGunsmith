import {
  TarkovApiError,
  buildBuilderSnapshot,
  fetchSnapshotDocuments,
  staticBuilderDataSource,
  type BuilderDataSource,
  type TarkovJsonClient,
} from "@tarkov/data";

/**
 * The Builder data source a route test runs on: the snapshot the real generator builds from
 * `client`'s documents, priced at those documents' own prices — the same path the e2e build
 * takes from the committed captures.
 *
 * A client that fails a resource (`createTestClient({ errorResources: ["items"] })`) yields a
 * source that fails with the same error, so a route's error state renders as it would when
 * the snapshot or prices cannot load. Any other error is thrown.
 */
export async function createTestBuilderData(client: TarkovJsonClient): Promise<BuilderDataSource> {
  try {
    const { snapshot, prices } = buildBuilderSnapshot(
      await fetchSnapshotDocuments(client),
      "fixtures",
    );
    return staticBuilderDataSource(snapshot, prices.prices);
  } catch (error) {
    // Only an upstream failure is the intended error state. Anything else — drift in the
    // hand fixtures, a generator bug — fails the test that built this, rather than quietly
    // rendering a route's error state for the wrong reason.
    if (!(error instanceof TarkovApiError)) throw error;
    const fail = () => Promise.reject(error);
    return { snapshot: fail, prices: fail };
  }
}
