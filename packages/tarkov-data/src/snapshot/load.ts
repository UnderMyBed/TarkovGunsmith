import { BUILDER_SNAPSHOT_SCHEMA, type BuilderPrices, type BuilderSnapshot } from "./types.js";

/**
 * The served snapshot is a different version from the code reading it. Only a tab opened
 * before a deploy can see this, so the message tells the reader what to do about it.
 */
export class SnapshotVersionError extends Error {
  override name = "SnapshotVersionError";
  constructor(readonly found: unknown) {
    super("Game data was updated. Reload the page.");
  }
}

function header(json: unknown, label: string): Record<string, unknown> {
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    throw new Error(`${label} is not a JSON object`);
  }
  const record = json as Record<string, unknown>;
  if (record.schema !== BUILDER_SNAPSHOT_SCHEMA) throw new SnapshotVersionError(record.schema);
  if (record.source !== "upstream" && record.source !== "fixtures") {
    throw new Error(`${label} has an unknown source ${JSON.stringify(record.source)}`);
  }
  if (typeof record.dataAsOf !== "string") throw new Error(`${label} has no dataAsOf`);
  return record;
}

/**
 * Check a fetched `builder-snapshot.json` and type it.
 *
 * Only the header and the top-level containers are checked. The body was validated field by
 * field when the generator built it, in the same deploy as this code; running a 3.5 MB
 * document through Zod again on every page load would cost more than the parse itself.
 */
export function parseBuilderSnapshot(json: unknown): BuilderSnapshot {
  const record = header(json, "builder-snapshot.json");
  for (const key of ["weapons", "parts", "traders", "tasks"]) {
    if (!Array.isArray(record[key])) throw new Error(`builder-snapshot.json has no ${key} list`);
  }
  for (const key of ["slots", "offers", "presets", "ingredientNames"]) {
    const value = record[key];
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`builder-snapshot.json has no ${key} map`);
    }
  }
  return record as unknown as BuilderSnapshot;
}

/** Check a fetched `builder-prices.json` and type it. */
export function parseBuilderPrices(json: unknown): BuilderPrices {
  const record = header(json, "builder-prices.json");
  const prices = record.prices as { items?: unknown; trader?: unknown } | null | undefined;
  if (
    prices === null ||
    typeof prices !== "object" ||
    typeof prices.items !== "object" ||
    typeof prices.trader !== "object"
  ) {
    throw new Error("builder-prices.json has no price table");
  }
  return record as unknown as BuilderPrices;
}

/**
 * React Query's `retry` for anything read from the snapshot: the default three retries, but
 * none for a {@link SnapshotVersionError}, which no retry can fix — only a reload can.
 */
export function retrySnapshotLoad(failureCount: number, error: unknown): boolean {
  return !(error instanceof SnapshotVersionError) && failureCount < 3;
}
