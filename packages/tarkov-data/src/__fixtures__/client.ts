import { mergeTranslations } from "../translations.js";
import type { TarkovJsonClient } from "../client.js";
import itemsFixture from "./items-sample.json" with { type: "json" };
import tasksFixture from "./tasks-sample.json" with { type: "json" };
import tradersFixture from "./traders-sample.json" with { type: "json" };

export interface Capture {
  document: unknown;
  lang: Record<string, string>;
}

const FIXTURES: Record<string, Capture> = {
  items: itemsFixture,
  tasks: tasksFixture,
  traders: tradersFixture,
};

/**
 * A client backed by the committed fixtures, translations merged exactly as the real client
 * merges them.
 *
 * `structuredClone` per call because `mergeTranslations` rewrites the document in place — a
 * shared fixture object would be mutated by the first test and read pre-translated by the rest,
 * hiding merge bugs.
 *
 * `overrides` swaps in another capture for a resource (the preset oracle's items document, say)
 * while the rest keep coming from the shared samples.
 */
export function fixtureClient(overrides: Readonly<Record<string, Capture>> = {}): TarkovJsonClient {
  return {
    fetchResource: <T>(resource: string): Promise<T> => {
      const fixture = overrides[resource] ?? FIXTURES[resource];
      if (fixture === undefined) {
        return Promise.reject(new Error(`no fixture for resource "${resource}"`));
      }
      return Promise.resolve(
        mergeTranslations(structuredClone(fixture.document) as never, fixture.lang),
      );
    },
  };
}
