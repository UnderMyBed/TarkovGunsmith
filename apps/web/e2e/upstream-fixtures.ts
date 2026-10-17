/**
 * The upstream documents the e2e suite serves in place of live `json.tarkov.dev`.
 *
 * Two producers ask this module for bodies:
 *
 *   - `upstream.ts`, which fulfils the browser's own `fetch` — the shipped bundle really does
 *     request `https://json.tarkov.dev/regular/...` (`apps/web/src/tarkov-client.ts`), so the
 *     request is intercepted rather than reconfigured, and the artifact under test stays
 *     byte-identical to the one that deploys.
 *   - `scripts/builder-snapshot.ts`, which generates the Builder snapshot from these bodies on
 *     every build that is not the release deploy. The OG card Functions read that snapshot
 *     from the deploy's own assets, so they make no upstream request of their own.
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
import type { BuilderSnapshot } from "@tarkov/data";

const FIXTURE_DIR = new URL("../../../packages/tarkov-data/src/__fixtures__/", import.meta.url);

/** The resources `packages/tarkov-data` fetches. Each has an `_en` translation sibling. */
export const UPSTREAM_RESOURCES = ["items", "tasks", "traders", "barters"] as const;
export type UpstreamResource = (typeof UPSTREAM_RESOURCES)[number];

interface CapturedFixture {
  /**
   * The raw upstream envelope: payload plus the JSONPaths whose values are translation keys.
   * `data` is an object for items/tasks/traders and an array for barters.
   */
  readonly document: { data: unknown; translations?: readonly string[] };
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
 * capture, the rows come from the snapshot generator + Zod + React.
 */
export function fixtureItemCount(propertiesType: string): number {
  return capturedItems().filter((item) => item.properties?.propertiesType === propertiesType)
    .length;
}

interface CapturedItem {
  readonly types?: readonly string[];
  readonly properties?: { propertiesType?: unknown } | null;
}

function capturedItems(): CapturedItem[] {
  const data = capture("items").document.data as { items: Record<string, CapturedItem> };
  return Object.values(data.items);
}

/**
 * How many captured weapons the Builder's picker can offer: `ItemPropertiesWeapon` items
 * minus the special-slot ones (the SP-81 signal pistol and RSP-30 cartridges), which
 * `isBuildableWeapon` (`packages/tarkov-data/src/queries/weaponList.ts`) drops.
 */
export function fixtureBuildableWeaponCount(): number {
  return capturedItems().filter(
    (item) =>
      item.properties?.propertiesType === "ItemPropertiesWeapon" &&
      !(item.types ?? []).includes("specialSlot"),
  ).length;
}

/**
 * How many parts a captured weapon preset puts on the weapon: its placed attachments that sit
 * on the weapon (`resolveBuild`), read from the snapshot this run's build
 * generated — the same file `wrangler pages dev` serves.
 */
export async function fixturePresetPartCount(weaponId: string, presetId: string): Promise<number> {
  const { resolveBuild, snapshotPartsById, snapshotWeaponTree } = await import("@tarkov/data");
  const snapshot = JSON.parse(
    readFileSync(new URL("../dist/data/builder-snapshot.json", import.meta.url), "utf8"),
  ) as BuilderSnapshot;
  const preset = snapshot.presets[weaponId]?.find((p) => p.id === presetId);
  if (preset === undefined) throw new Error(`the snapshot has no preset ${presetId}`);
  const tree = snapshotWeaponTree(snapshot, weaponId);
  return resolveBuild(tree, preset.attachments, snapshotPartsById(snapshot)).placed.length;
}
