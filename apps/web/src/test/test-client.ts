import type { TarkovJsonClient } from "@tarkov/data";
import { ITEMS_DOCUMENT, TRADERS_DOCUMENT, TASKS_DOCUMENT } from "./fixtures.js";

const RESOURCES: Record<string, unknown> = {
  items: ITEMS_DOCUMENT,
  traders: TRADERS_DOCUMENT,
  tasks: TASKS_DOCUMENT,
};

/**
 * A `TarkovJsonClient` test double backed by the fixtures in `./fixtures.ts`, mirroring
 * `packages/tarkov-data/src/__fixtures__/client.ts`'s `fixtureClient()` (same idea: resolve
 * pre-built documents instead of hitting the network) but hand-shaped for `apps/web`'s route
 * scenarios rather than a trimmed capture of the live document.
 *
 * `structuredClone` per call for the same reason `fixtureClient()` does it: nothing downstream
 * mutates these documents today, but a shared object silently hides a mutation bug the moment
 * something starts.
 *
 * @param errorResources - resource names that should reject instead of resolving, for testing
 *   a route's error state (e.g. `createTestClient({ errorResources: ["items"] })`).
 */
export function createTestClient(options?: {
  errorResources?: readonly string[];
}): TarkovJsonClient {
  const errorResources = new Set(options?.errorResources ?? []);
  return {
    fetchResource<T>(resource: string): Promise<T> {
      if (errorResources.has(resource)) {
        return Promise.reject(new Error(`fixture client: forced failure for "${resource}"`));
      }
      const doc = RESOURCES[resource];
      if (doc === undefined) {
        return Promise.reject(new Error(`fixture client: no fixture for resource "${resource}"`));
      }
      return Promise.resolve(structuredClone(doc) as T);
    },
  };
}
