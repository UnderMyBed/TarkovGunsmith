/**
 * Writes the Builder's game data into `public/data/`, where Vite copies it into the deploy:
 *
 *   - `builder-snapshot.json` — weapons, parts, slots and unpriced offers; the SPA loads it.
 *   - `builder-prices.json`   — prices as of the same documents; only the OG card Functions
 *                               read it.
 *
 * `TARKOV_SNAPSHOT_SOURCE` picks the documents:
 *
 *   - `fixtures` (the default) — the committed captures in
 *     `packages/tarkov-data/src/__fixtures__/`, served through the same client and
 *     translation merge as live data. Local dev, CI and the e2e suite run on these, so no
 *     build depends on upstream being reachable.
 *   - `upstream` — live `json.tarkov.dev`. The release deploy builds with this.
 *
 * Generation is strict: any record that no longer matches the schemas fails the build with
 * every problem listed, rather than shipping a snapshot with rows missing.
 *
 *   TARKOV_SNAPSHOT_SOURCE=upstream pnpm exec tsx scripts/builder-snapshot.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { brotliCompressSync } from "node:zlib";
import {
  buildBuilderSnapshot,
  createTarkovClient,
  fetchSnapshotDocuments,
  SnapshotDriftError,
  type SnapshotSource,
} from "@tarkov/data";
import { upstreamFixtureBody } from "../e2e/upstream-fixtures.js";

const UPSTREAM_BASE = "https://json.tarkov.dev/regular/";
const OUT_DIR = new URL("../public/data/", import.meta.url);

function sourceFromEnv(): SnapshotSource {
  const value = process.env.TARKOV_SNAPSHOT_SOURCE ?? "fixtures";
  if (value === "fixtures" || value === "upstream") return value;
  throw new Error(`TARKOV_SNAPSHOT_SOURCE must be "fixtures" or "upstream", got "${value}"`);
}

/** A fetch that answers every upstream resource from the committed captures. */
const fixtureFetch: typeof fetch = (input) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const body = upstreamFixtureBody(new URL(url).pathname.split("/").pop() ?? "");
  return Promise.resolve(
    body === null
      ? new Response(`no capture for ${url}`, { status: 404, statusText: "Not Found" })
      : new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
  );
};

function write(name: string, value: unknown): void {
  const text = JSON.stringify(value);
  writeFileSync(new URL(name, OUT_DIR), text);
  const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;
  process.stdout.write(
    `  ${name}: ${kb(new TextEncoder().encode(text).length)} raw, ${kb(brotliCompressSync(text).length)} brotli\n`,
  );
}

async function main(): Promise<void> {
  const source = sourceFromEnv();
  const client = createTarkovClient(
    UPSTREAM_BASE,
    source === "fixtures" ? fixtureFetch : undefined,
  );
  process.stdout.write(`builder snapshot: reading ${source} documents\n`);
  const { snapshot, prices } = buildBuilderSnapshot(await fetchSnapshotDocuments(client), source);
  mkdirSync(OUT_DIR, { recursive: true });
  write("builder-snapshot.json", snapshot);
  write("builder-prices.json", prices);
  process.stdout.write(
    `  ${snapshot.weapons.length} weapons, ${snapshot.parts.length} parts, data as of ${snapshot.dataAsOf}\n`,
  );
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    error instanceof SnapshotDriftError
      ? `${error.message}\n`
      : `builder snapshot failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
}
