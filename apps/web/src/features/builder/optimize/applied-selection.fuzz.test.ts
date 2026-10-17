import { describe, expect, it } from "vitest";
import {
  partsById,
  resolveBuild,
  type AttachablePart,
  type BuildConflict,
  type BuildV6,
  type WeaponTree,
} from "@tarkov/data";
import { tinyTree, type SlotSpec } from "../../../test/tiny-tree.js";
import { appliedSelection, toggleChange } from "./applied-selection.js";
import { buildFromSelection } from "./build-from-selection.js";

/**
 * Property test: on random trees, builds and toggle walks, the tree shows what Apply does.
 * Fixed seeds and a seeded generator keep every run the same; a failure names its seed, case
 * and step.
 */

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const CASES_PER_SEED = 100;
const STEPS_PER_CASE = 10;

/** A linear congruential generator: deterministic, and enough to spread the cases. */
function generator(seed: number) {
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  return { next, pick };
}
type Rng = ReturnType<typeof generator>;

interface Node {
  nameId: string;
  required: boolean;
  items: { id: string; kids: Node[] }[];
}

const LEAVES = ["L0", "L1", "L2", "L3"];

function randomSlot(rng: Rng, nameId: string, depth: number, ids: { n: number }): Node {
  const items: Node["items"] = [];
  const count = 1 + Math.floor(rng.next() * 3);
  for (let i = 0; i < count; i++) {
    const sibling = items.find((item) => item.kids.length > 0);
    if (sibling && rng.next() < 0.5) {
      // Another part for the same slot with the same slots (a handguard and its replacement,
      // both taking the same rail), listed in its own order: a change below can keep a part
      // with slots of its own while the part above it changes, and a clash's two parts can
      // come the other way round. Its slots are its own (`owner:nameId` ids).
      const kids = rng.next() < 0.5 ? [...sibling.kids] : [...sibling.kids].reverse();
      items.push({ id: `i${ids.n++}`, kids });
    } else if (depth < 3 && rng.next() < 0.6) {
      const kids: Node[] = [];
      for (const kid of ["a", "b"])
        if (rng.next() < 0.6) kids.push(randomSlot(rng, kid, depth + 1, ids));
      items.push({ id: `i${ids.n++}`, kids });
    } else {
      const id = rng.pick(LEAVES);
      if (!items.some((item) => item.id === id)) items.push({ id, kids: [] });
    }
  }
  return { nameId, required: rng.next() < 0.4, items };
}

const toSpec = (node: Node): SlotSpec => ({
  nameId: node.nameId,
  required: node.required,
  items: node.items.map((item) =>
    item.kids.length > 0 ? ([item.id, item.kids.map(toSpec)] as const) : item.id,
  ),
});

/**
 * A random build over `nodes`. With `base`, a slot keeps the base's part half the time, so the
 * proposal shares parents with the current build. `fillRequired` fills every required slot,
 * as a solver result does; the current build may leave one empty.
 */
function randomBuild(
  rng: Rng,
  nodes: readonly Node[],
  fillRequired: boolean,
  base?: Readonly<Record<string, string>>,
  path = "",
  out: Record<string, string> = {},
): Record<string, string> {
  for (const node of nodes) {
    const p = path ? `${path}/${node.nameId}` : node.nameId;
    const kept = base?.[p] === undefined ? undefined : node.items.find((i) => i.id === base[p]);
    let item: Node["items"][number] | undefined;
    if (kept && rng.next() < 0.5) item = kept;
    else if ((node.required && (fillRequired || rng.next() < 0.7)) || rng.next() < 0.7) {
      item = rng.pick(node.items);
    }
    if (item) {
      out[p] = item.id;
      randomBuild(rng, item.kids, fillRequired, base, p, out);
    }
  }
  return out;
}

const asBuild = (attachments: Record<string, string>): BuildV6 => ({
  version: 6,
  weaponId: "w",
  attachments,
  orphaned: [],
  createdAt: "2026-04-22T00:00:00Z",
});

/**
 * Every part on `roots`. A part the proposal fits clashes, now and then, with one the current
 * build has (`conflictingItems`) or blocks a slot (`conflictingSlotIds`, tinyTree's
 * `owner:nameId` ids), so the walk meets the pairs a partial apply could leave on the weapon
 * together. Clashes inside the proposal are taken back out: a solver result never holds one.
 * The current build may.
 */
function partsOf(
  rng: Rng,
  roots: readonly Node[],
  tree: WeaponTree,
  current: Readonly<Record<string, string>>,
  proposed: Readonly<Record<string, string>>,
) {
  const ids = new Set<string>();
  const slotIds = new Set<string>();
  const walk = (owner: string) => (node: Node) => {
    slotIds.add(`${owner}:${node.nameId}`);
    node.items.forEach((item) => {
      ids.add(item.id);
      item.kids.forEach(walk(item.id));
    });
  };
  roots.forEach(walk("w"));
  // The old parts the proposal replaces: a clash with one of them is the kind a partial apply
  // can leave on the weapon. A clash with a part both builds keep is taken back out below.
  const replaced = Object.keys(current)
    .filter((p) => proposed[p] !== current[p])
    .map((p) => current[p]!);
  const slots = [...slotIds];
  const clashes = new Map(
    [...ids].map((id) => [id, { items: [] as string[], slots: [] as string[] }]),
  );
  for (const id of Object.values(proposed)) {
    if (replaced.length > 0 && rng.next() < 0.4) clashes.get(id)!.items.push(rng.pick(replaced));
    if (rng.next() < 0.08) clashes.get(id)!.slots.push(rng.pick(slots));
  }
  // Clashes the current build already has, which a tick never has to clear. Most are between
  // parts in two different slots under one part: if a replacement lists those slots the other
  // way round, the build lists the clash's two parts the other way round too.
  const paths = Object.keys(current);
  for (const p of paths) {
    if (rng.next() >= 0.15) continue;
    const parent = p.slice(0, Math.max(0, p.lastIndexOf("/")));
    const cousins = paths.filter(
      (q) =>
        q !== p && q.startsWith(`${parent}/`) && !q.startsWith(`${p}/`) && !p.startsWith(`${q}/`),
    );
    const other = cousins.length > 0 && rng.next() < 0.8 ? rng.pick(cousins) : rng.pick(paths);
    clashes.get(current[p]!)!.items.push(current[other]!);
  }
  const make = () =>
    partsById(
      [...ids].map((id): AttachablePart => ({
        id,
        name: id,
        shortName: id,
        iconLink: "https://assets.tarkov.dev/x.webp",
        weight: 0,
        types: ["mods"],
        minLevelForFlea: null,
        properties: {
          propertiesType: "ItemPropertiesWeaponMod",
          ergonomics: 0,
          recoilModifier: 0,
          accuracyModifier: 0,
          velocity: 0,
        },
        buyFor: [],
        conflictingItems: [...clashes.get(id)!.items],
        conflictingSlotIds: [...clashes.get(id)!.slots],
      })),
    );
  for (;;) {
    const parts = make();
    const inside = resolveBuild(tree, proposed, parts).conflicts;
    if (inside.length === 0) return parts;
    for (const c of inside) {
      for (const [x, y] of [
        [c.a, c.b],
        [c.b, c.a],
      ] as const) {
        const own = clashes.get(x.itemId)!;
        own.items = own.items.filter((i) => i !== y.itemId);
        own.slots = own.slots.filter((sl) => sl !== c.slotId);
      }
    }
  }
}

const parentOf = (path: string): string | null => {
  const cut = path.lastIndexOf("/");
  return cut < 0 ? null : path.slice(0, cut);
};

interface Case {
  tree: WeaponTree;
  parts: ReturnType<typeof partsOf>;
  current: BuildV6;
  proposed: BuildV6;
  rng: Rng;
}

function* cases(seed: number): Generator<Case> {
  const rng = generator(seed);
  for (let c = 0; c < CASES_PER_SEED; c++) {
    const ids = { n: 0 };
    const roots = ["x", "y", "z"].map((name) => randomSlot(rng, name, 1, ids));
    const current = randomBuild(rng, roots, false);
    const proposed = randomBuild(rng, roots, true, current);
    const tree = tinyTree("w", roots.map(toSpec));
    const parts = partsOf(rng, roots, tree, current, proposed);
    yield { tree, parts, current: asBuild(current), proposed: asBuild(proposed), rng };
  }
}

describe("appliedSelection, on random trees and toggle walks", () => {
  it.each(SEEDS)("shows what Apply does, seed %i", (seed) => {
    let checked = 0;
    let coupled = 0;
    let caseNo = 0;
    for (const { tree, parts, current, proposed, rng } of cases(seed)) {
      caseNo++;
      const currentResolved = resolveBuild(tree, current.attachments, parts);
      const currentOn = currentResolved.attachments;
      // The same clash whichever of its parts the build lists first.
      const clashKey = (c: BuildConflict) => {
        const sides = [`${c.a.path}|${c.a.itemId}`, `${c.b.path}|${c.b.itemId}`];
        return [c.kind, ...(c.kind === "item" ? sides.sort() : sides), c.slotId ?? ""].join("|");
      };
      const currentClashes = new Set(currentResolved.conflicts.map(clashKey));
      const proposedOn = resolveBuild(tree, proposed.attachments, parts).attachments;
      let ticked: ReadonlySet<string> = new Set(
        appliedSelection(current, proposed, new Set(), tree, parts).rows.keys(),
      );
      if (ticked.size === 0) continue;

      for (let step = 0; step < STEPS_PER_CASE; step++) {
        const at = `seed ${seed}, case ${caseNo}, step ${step}`;
        const view = appliedSelection(current, proposed, ticked, tree, parts);
        const applied = buildFromSelection(current, proposed, ticked, tree, parts);
        expect(view.build, at).toEqual(applied);
        const resolved = resolveBuild(tree, applied.attachments, parts);
        const on = resolved.attachments;

        for (const [path, row] of view.rows) {
          const where = `${at}, ${path}`;
          // A row shows ticked exactly when Apply puts the proposal's part (or emptying) there.
          expect(row.landed, where).toBe(on[path] === proposedOn[path]);
          if (row.disabled) {
            // A locked row says why, and clicking it does nothing.
            expect(row.note, where).not.toBeNull();
            expect(toggleChange(path, current, proposed, ticked, tree, parts), where).toBe(ticked);
          } else {
            // No dead clicks: toggling an enabled row flips what Apply does there.
            const next = toggleChange(path, current, proposed, ticked, tree, parts);
            const afterView = appliedSelection(current, proposed, next, tree, parts);
            expect(afterView.rows.get(path)?.landed, where).toBe(!row.landed);
            if (row.note?.startsWith("makes room") || row.note?.startsWith("conflicts with")) {
              // The note says toggling this row moves another: it does.
              coupled++;
              const moved = [...afterView.rows].filter(
                ([p, r]) => p !== path && r.landed !== view.rows.get(p)?.landed,
              );
              expect(moved.length, where).toBeGreaterThan(0);
            }
            // No more than a clash calls for: each change the toggle moves beyond the row and
            // what it always takes along (`plain`), put back as it was, brings a new clash.
            const changes = [...view.rows.keys()];
            const below = (p: string) => changes.filter((c) => c.startsWith(`${p}/`));
            const plain = new Set(ticked);
            if (row.landed) {
              for (const p of [path, ...below(path)]) plain.delete(p);
            } else {
              const needs = changes.filter(
                (c) => path.startsWith(`${c}/`) && !view.rows.get(c)!.landed,
              );
              for (const p of [path, ...needs]) for (const q of [p, ...below(p)]) plain.add(q);
            }
            const extra = row.landed
              ? [...plain].filter((p) => !next.has(p))
              : [...next].filter((p) => !plain.has(p));
            const tops = extra.filter((p) => !extra.some((q) => p.startsWith(`${q}/`)));
            for (const top of tops) {
              const group = [top, ...below(top)].filter((p) => extra.includes(p));
              const back = new Set(next);
              for (const p of group) {
                if (row.landed) back.add(p);
                else back.delete(p);
              }
              const undone = buildFromSelection(current, proposed, back, tree, parts);
              const clashes = resolveBuild(tree, undone.attachments, parts).conflicts;
              expect(
                clashes.some((c) => !currentClashes.has(clashKey(c))),
                `${where}: ${row.landed ? "unticking" : "ticking"} also moved ${top} for no clash`,
              ).toBe(true);
            }
          }
          if (row.note?.startsWith("left empty")) {
            expect(on[path], where).toBeUndefined();
            expect(currentOn[path], where).toBeDefined();
          }
          checked++;
        }

        // Apply never puts two parts together that clash, unless the current build has them.
        for (const c of resolved.conflicts) {
          expect(currentClashes.has(clashKey(c)), `${at}, clash ${clashKey(c)}`).toBe(true);
        }

        // Apply never empties a required slot the current build filled (under the same part)
        // or a landed new parent part's proposal filled. A slot the current build already has
        // empty may stay so: unticking the proposal's fill keeps the build as it is.
        for (const slot of resolved.missingRequired) {
          const parent = parentOf(slot.path);
          const where = `${at}, required ${slot.path}`;
          const parentIsCurrent = parent === null || on[parent] === currentOn[parent];
          const parentIsProposed = parent !== null && on[parent] === proposedOn[parent];
          if (parentIsCurrent) expect(currentOn[slot.path], where).toBeUndefined();
          if (parentIsProposed && !parentIsCurrent) {
            expect(proposedOn[slot.path], where).toBeUndefined();
          }
        }

        ticked = toggleChange(
          rng.pick([...view.rows.keys()]),
          current,
          proposed,
          ticked,
          tree,
          parts,
        );
      }
    }
    // The walk exercised rows, not only empty diffs.
    expect(checked).toBeGreaterThan(500);
    // ...and rows whose toggle clears or brings back a clash.
    expect(coupled, "coupled rows").toBeGreaterThan(20);
  });
});
