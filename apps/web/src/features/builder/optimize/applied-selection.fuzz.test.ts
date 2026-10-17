import { describe, expect, it } from "vitest";
import {
  partsById,
  resolveBuild,
  type AttachablePart,
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

const SEEDS = [1, 2, 3, 4, 5];
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
    if (depth < 3 && rng.next() < 0.6) {
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

function partsOf(roots: readonly Node[]) {
  const ids = new Set<string>();
  const walk = (node: Node) =>
    node.items.forEach((item) => {
      ids.add(item.id);
      item.kids.forEach(walk);
    });
  roots.forEach(walk);
  return partsById(
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
      conflictingItems: [],
      conflictingSlotIds: [],
    })),
  );
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
    yield {
      tree: tinyTree("w", roots.map(toSpec)),
      parts: partsOf(roots),
      current: asBuild(current),
      proposed: asBuild(proposed),
      rng,
    };
  }
}

describe("appliedSelection, on random trees and toggle walks", () => {
  it.each(SEEDS)("shows what Apply does, seed %i", (seed) => {
    let checked = 0;
    let caseNo = 0;
    for (const { tree, parts, current, proposed, rng } of cases(seed)) {
      caseNo++;
      const currentOn = resolveBuild(tree, current.attachments, parts).attachments;
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
            const after = appliedSelection(current, proposed, next, tree, parts).rows.get(path);
            expect(after?.landed, where).toBe(!row.landed);
          }
          if (row.note?.startsWith("left empty")) {
            expect(on[path], where).toBeUndefined();
            expect(currentOn[path], where).toBeDefined();
          }
          checked++;
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
  });
});
