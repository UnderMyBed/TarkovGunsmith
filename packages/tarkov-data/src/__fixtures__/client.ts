import { mergeTranslations } from "../translations.js";
import type { TarkovJsonClient } from "../client.js";
import itemsFixture from "./items-sample.json" with { type: "json" };
import tasksFixture from "./tasks-sample.json" with { type: "json" };
import tradersFixture from "./traders-sample.json" with { type: "json" };

const FIXTURES: Record<string, { document: unknown; lang: Record<string, string> }> = {
  items: itemsFixture as never,
  tasks: tasksFixture as never,
  traders: tradersFixture as never,
};

/**
 * A client backed by the committed fixtures, translations merged exactly as the real client
 * merges them.
 *
 * `structuredClone` per call because `mergeTranslations` rewrites the document in place — a
 * shared fixture object would be mutated by the first test and read pre-translated by the rest,
 * hiding merge bugs.
 */
export function fixtureClient(): TarkovJsonClient {
  return {
    fetchResource: <T,>(resource: string): Promise<T> => {
      const fixture = FIXTURES[resource];
      if (fixture === undefined) {
        return Promise.reject(new Error(`no fixture for resource "${resource}"`));
      }
      return Promise.resolve(
        mergeTranslations(structuredClone(fixture.document) as never, fixture.lang) as T,
      );
    },
  };
}
