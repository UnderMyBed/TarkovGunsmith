import { JSONPath } from "jsonpath-plus";

/** An upstream document: payload plus the JSONPaths whose values are translation keys. */
export interface TranslatedDocument<T> {
  data: T;
  translations?: readonly string[];
}

/**
 * Replace every translation key named by `doc.translations` with its translated text.
 *
 * The path list comes from upstream rather than being hard-coded here on purpose: they add
 * paths without warning, and a hard-coded list would silently stop translating new fields
 * instead of failing visibly. A key with no translation passes through unchanged, matching
 * the reference client (the-hideout/tarkov-dev, src/modules/api-request.mjs).
 */
export function mergeTranslations<T>(doc: TranslatedDocument<T>, lang: Record<string, string>): T {
  for (const path of doc.translations ?? []) {
    try {
      JSONPath({
        path,
        json: doc,
        resultType: "all",
        callback: (result: unknown) => {
          const { value, parent, parentProperty } = result as {
            value: unknown;
            parent: Record<string, unknown> | undefined;
            parentProperty: string;
          };
          if (typeof value !== "string" || parent === undefined) return;
          parent[parentProperty] = lang[value] ?? value;
        },
      });
    } catch {
      // A malformed or unmatched path must not take the rest of the merge with it.
      continue;
    }
  }
  return doc.data;
}
