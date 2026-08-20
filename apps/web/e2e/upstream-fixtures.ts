/**
 * The upstream documents the e2e suite serves in place of live `json.tarkov.dev`.
 *
 * Two producers ask this module for bodies:
 *
 *   - `upstream.ts`, which fulfils the browser's own `fetch` — the shipped bundle really does
 *     request `https://json.tarkov.dev/regular/items` (`apps/web/src/tarkov-client.ts:12`), so
 *     the request is intercepted rather than reconfigured, and the artifact under test stays
 *     byte-identical to the one that deploys.
 *   - `upstream-fixture-server.ts`, which serves the same bodies over HTTP for the OG Pages
 *     Functions. Those run server-side inside `wrangler pages dev` and fetch upstream
 *     themselves (`apps/web/functions/lib/og-graphql.ts:19`), where `page.route` cannot reach
 *     them; they get the fixture host through the `TARKOV_JSON_API_BASE` binding instead.
 *
 * The bodies are the RAW upstream envelopes, not pre-merged documents: `items` returns
 * `{ data, translations }` and `items_en` returns `{ data: <key -> text> }`, exactly as
 * upstream does. That keeps `createTarkovClient`'s two-request fetch and `mergeTranslations`
 * on the real path in both consumers — a translation-merge regression still fails the suite.
 *
 * Source of truth is `packages/tarkov-data/src/__fixtures__/*-sample.json` — trimmed captures
 * of the live documents, read here rather than re-invented. See that directory's README for
 * what they deliberately include.
 */
import { readFileSync } from "node:fs";

const FIXTURE_DIR = new URL("../../../packages/tarkov-data/src/__fixtures__/", import.meta.url);

/** The resources `packages/tarkov-data` fetches. Each has an `_en` translation sibling. */
export const UPSTREAM_RESOURCES = ["items", "tasks", "traders"] as const;
export type UpstreamResource = (typeof UPSTREAM_RESOURCES)[number];

interface CapturedFixture {
  /** The raw upstream envelope: payload plus the JSONPaths whose values are translation keys. */
  readonly document: { data: Record<string, unknown>; translations?: readonly string[] };
  /** The subset of the `_en` map those records need. */
  readonly lang: Record<string, string>;
}

const captures = new Map<UpstreamResource, CapturedFixture>();

function capture(resource: UpstreamResource): CapturedFixture {
  const hit = captures.get(resource);
  if (hit !== undefined) return hit;
  const path = new URL(`${resource}-sample.json`, FIXTURE_DIR);
  const parsed = JSON.parse(readFileSync(path, "utf8")) as CapturedFixture;
  captures.set(resource, parsed);
  return parsed;
}

function isUpstreamResource(name: string): name is UpstreamResource {
  return (UPSTREAM_RESOURCES as readonly string[]).includes(name);
}

/**
 * The JSON body upstream would answer with for one resource path segment
 * (`items`, `items_en`, `tasks`, …), or `null` when nothing is captured for it.
 *
 * A `null` is deliberately not papered over with an empty document: a resource the app asks
 * for and the fixtures don't carry is a gap in the fixtures, and it has to be visible as one.
 */
export function upstreamFixtureBody(segment: string): string | null {
  const isTranslation = segment.endsWith("_en");
  const resource = isTranslation ? segment.slice(0, -"_en".length) : segment;
  if (!isUpstreamResource(resource)) return null;
  const fixture = capture(resource);
  return JSON.stringify(isTranslation ? { data: fixture.lang } : fixture.document);
}

/**
 * How many items in the captured document carry `properties.propertiesType === type`.
 *
 * Lets a spec state the row count it expects from the fixture instead of a magic number, and
 * without re-deriving it through the selector under test — the count comes from the raw
 * capture, the rows come from `fetchModList` + Zod + React.
 */
export function fixtureItemCount(propertiesType: string): number {
  const items = capture("items").document.data.items as Record<
    string,
    { properties?: { propertiesType?: unknown } | null }
  >;
  return Object.values(items).filter((item) => item.properties?.propertiesType === propertiesType)
    .length;
}
