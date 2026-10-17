/**
 * Writes `packages/optimizer/src/__fixtures__/goldens.json`: the upstream records behind three
 * weapons' Builder data — the Colt M4A1, the AKM and the RSASS — cut down to the fields the
 * snapshot generator reads. The optimizer's golden tests
 * build a Builder snapshot from it with `buildBuilderSnapshot`, exactly as a deploy does, and
 * optimize over that.
 *
 *   pnpm exec tsx scripts/optimizer-goldens.ts          # from live json.tarkov.dev
 *   pnpm exec tsx scripts/optimizer-goldens.ts <dir>    # from a capture: <dir>/items.json,
 *                                                       # items_en.json, tasks.json, ...
 *
 * What it keeps:
 *
 *   - records: each weapon, every item its slots reach, its default ammo, every preset of a
 *     kept item and what the preset contains, the barters that sell a kept item and the items
 *     they take, the tasks that gate a kept offer, and every trader;
 *   - fields: a field is dropped, for every record of its kind at once, when the snapshot
 *     generated without it is byte-identical to the one generated with it. Fields are tried
 *     shallowest first, so the result is what this generator reads today, not a hand-kept list
 *     that could drift from it.
 *
 * Before writing, it checks that the cut-down documents give each weapon the same tree,
 * weapon record, presets and priced part catalog as the full documents do, and fails loud if
 * not. The file is written compact; `.prettierignore` leaves it so.
 */
import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { createTarkovClient } from "../packages/tarkov-data/src/client.js";
import {
  buildBuilderSnapshot,
  fetchSnapshotDocuments,
  type SnapshotDocuments,
} from "../packages/tarkov-data/src/snapshot/generate.js";
import { PART_TYPES } from "../packages/tarkov-data/src/queries/parts.js";
import {
  snapshotPartCatalog,
  snapshotWeaponList,
  snapshotWeaponPresets,
  snapshotWeaponTree,
} from "../packages/tarkov-data/src/snapshot/views.js";

const WEAPONS = {
  "5447a9cd4bdc2dbd208b4567": "Colt M4A1",
  "59d6088586f774275f37482f": "AKM",
  "5a367e5dc4a282000e49738f": "RSASS",
} as const;
const OUT = new URL("../packages/optimizer/src/__fixtures__/goldens.json", import.meta.url);

/** A raw upstream record: untyped JSON. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

async function documents(dir: string | undefined): Promise<SnapshotDocuments> {
  const fetchFrom: typeof fetch | undefined =
    dir === undefined
      ? undefined
      : async (input) => {
          const name = String(input).split("/").pop()!;
          return new Response(await readFile(`${dir}/${name}.json`));
        };
  return fetchSnapshotDocuments(createTarkovClient("https://json.tarkov.dev/regular/", fetchFrom));
}

function generate(docs: SnapshotDocuments) {
  return buildBuilderSnapshot(docs, "fixtures");
}

const docs = await documents(process.argv[2]);
const items = docs.items.items as Record<string, Raw>;

// Records.
const keep = new Set<string>();
const stack: string[] = Object.keys(WEAPONS);
for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
  if (keep.has(id) || items[id] === undefined) continue;
  keep.add(id);
  for (const slot of items[id].properties?.slots ?? [])
    stack.push(...(slot.filters?.allowedItems ?? []));
}
for (const id of Object.keys(WEAPONS)) keep.add(items[id]!.properties.defaultAmmo);
for (const [id, raw] of Object.entries(items)) {
  if (raw?.properties?.propertiesType !== "ItemPropertiesPreset") continue;
  if (!keep.has(raw.properties.baseItem)) continue;
  keep.add(id);
  for (const entry of raw.containsItems ?? []) keep.add(entry.item);
}
const barters = (docs.barters as Raw[]).filter((b) => keep.has(b.offeredItem?.item));
for (const barter of barters) for (const entry of barter.requiredItems) keep.add(entry.item);

let cut: SnapshotDocuments = structuredClone({
  items: { items: Object.fromEntries([...keep].sort().map((id) => [id, items[id]])) },
  tasks: docs.tasks,
  traders: docs.traders,
  barters,
} as unknown as SnapshotDocuments);
const gating = new Set(generate(cut).snapshot.tasks.map((t) => t.normalizedName));
cut.tasks = {
  tasks: Object.fromEntries(
    Object.entries((cut.tasks as Raw).tasks as Record<string, Raw>).filter(([, t]) =>
      gating.has(t.normalizedName),
    ),
  ),
} as unknown as SnapshotDocuments["tasks"];

// Fields.
const reference = JSON.stringify(generate(cut));
const same = (): boolean => {
  try {
    return JSON.stringify(generate(cut)) === reference;
  } catch {
    return false;
  }
};
const kindOf = (raw: Raw): string => {
  const type = raw?.properties?.propertiesType;
  if (type === "ItemPropertiesWeapon") return "weapon";
  if (PART_TYPES.has(type)) return "part";
  if (type === "ItemPropertiesPreset") return "preset";
  return "other item";
};
const kinds: Record<string, () => Raw[]> = {
  weapon: () =>
    Object.values((cut.items as Raw).items as Raw).filter((r) => kindOf(r) === "weapon"),
  part: () => Object.values((cut.items as Raw).items as Raw).filter((r) => kindOf(r) === "part"),
  preset: () =>
    Object.values((cut.items as Raw).items as Raw).filter((r) => kindOf(r) === "preset"),
  "other item": () =>
    Object.values((cut.items as Raw).items as Raw).filter((r) => kindOf(r) === "other item"),
  barter: () => cut.barters as Raw[],
  task: () => Object.values((cut.tasks as Raw).tasks as Raw),
  trader: () => Object.values(cut.traders as Raw),
};
/** Every field path in `value`, `[]` standing for any array element. */
function fieldPaths(
  value: unknown,
  depth: number,
  at: string[] = [],
  out = new Map<string, string[]>(),
) {
  if (depth === 0 || value === null || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    for (const x of value) fieldPaths(x, depth, [...at, "[]"], out);
    return out;
  }
  for (const key of Object.keys(value)) {
    const path = [...at, key];
    out.set(path.join("."), path);
    fieldPaths((value as Raw)[key], depth - 1, path, out);
  }
  return out;
}
function drop(value: unknown, path: readonly string[]): void {
  if (value === null || typeof value !== "object") return;
  const [head, ...rest] = path;
  if (head === "[]") {
    if (Array.isArray(value)) for (const x of value) drop(x, rest);
  } else if (rest.length === 0) {
    delete (value as Raw)[head!];
  } else {
    drop((value as Raw)[head!], rest);
  }
}
let dropped = 0;
for (const records of Object.values(kinds)) {
  const paths = [...fieldPaths(records(), 6).values()]
    .map((p) => p.slice(1))
    .sort((a, b) => a.length - b.length || a.join(".").localeCompare(b.join(".")));
  const gone: string[] = [];
  for (const path of paths) {
    const name = path.join(".");
    if (gone.some((g) => name.startsWith(`${g}.`))) continue;
    const saved = structuredClone(cut);
    for (const record of records()) drop(record, path);
    if (same()) {
      gone.push(name);
      dropped++;
    } else {
      cut = saved;
    }
  }
}

// Faithfulness: each weapon reads the same from the cut-down documents as from the full ones.
const full = buildBuilderSnapshot(docs, process.argv[2] === undefined ? "upstream" : "fixtures");
const mine = generate(cut);
for (const [id, name] of Object.entries(WEAPONS)) {
  const view = (s: typeof full) => {
    const tree = snapshotWeaponTree(s.snapshot, id);
    const reached = new Set<string>();
    const walk = (owner: string) => {
      for (const slot of s.snapshot.slots[owner]?.slots ?? []) {
        for (const part of slot.allowedItemIds) {
          if (reached.has(part)) continue;
          reached.add(part);
          walk(part);
        }
      }
    };
    walk(id);
    // The tree carries the whole slot graph; only this weapon's part of it is compared.
    const owners = [id, ...reached].flatMap((owner) => {
      const slots = tree.graph.owners[owner];
      return slots === undefined ? [] : [[owner, slots] as const];
    });
    return {
      tree: { ...tree, graph: Object.fromEntries(owners) },
      weapon: snapshotWeaponList(s.snapshot, s.prices.prices).find((w) => w.id === id),
      presets: snapshotWeaponPresets(s.snapshot, s.prices.prices)[id],
      parts: snapshotPartCatalog(s.snapshot, s.prices.prices).filter((p) => reached.has(p.id)),
    };
  };
  if (!isDeepStrictEqual(view(full), view(mine))) {
    throw new Error(
      `${name}: the cut-down documents do not give the Builder what the full ones do`,
    );
  }
}

const body = JSON.stringify({ weapons: WEAPONS, documents: cut });
writeFileSync(OUT, `${body}\n`);
console.log(
  `${OUT.pathname}: ${keep.size} items, ${(cut.barters as Raw[]).length} barters, ` +
    `${gating.size} tasks; ${dropped} fields dropped; ${(body.length / 1024).toFixed(0)} KB; ` +
    `data as of ${mine.snapshot.dataAsOf}`,
);
