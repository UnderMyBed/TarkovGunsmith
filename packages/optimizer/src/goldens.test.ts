import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  adaptMod,
  adaptWeapon,
  buildBuilderSnapshot,
  buildPriceUnder,
  partsById,
  resolveBuild,
  snapshotPartCatalog,
  snapshotWeaponList,
  snapshotWeaponPresets,
  snapshotWeaponTree,
  type PlayerProfile,
  type PriceGate,
  type SnapshotDocuments,
} from "@tarkov/data";
import { weaponSpec } from "@tarkov/ballistics";
import { optimize } from "./optimize.js";
import type { Objective } from "./types.js";

/*
 * Real upstream records for three weapons (`scripts/optimizer-goldens.ts` writes them), built
 * into a Builder snapshot the way a deploy builds one. Every result must be a build the Builder
 * accepts as it stands — no conflict, no empty required slot, nothing orphaned — with the
 * stats `weaponSpec` gives it and, under a budget, a price `buildPriceUnder` agrees fits.
 */
const fixture = JSON.parse(
  readFileSync(new URL("./__fixtures__/goldens.json", import.meta.url), "utf8"),
) as { weapons: Record<string, string>; documents: SnapshotDocuments };
const { snapshot, prices } = buildBuilderSnapshot(fixture.documents, "fixtures");
const parts = snapshotPartCatalog(snapshot, prices.prices);
const byId = partsById(parts);
const weapons = snapshotWeaponList(snapshot, prices.prices);
const presets = snapshotWeaponPresets(snapshot, prices.prices);
const idOf = (name: string) => Object.entries(fixture.weapons).find(([, n]) => n === name)![0];

const LL4: PlayerProfile = {
  mode: "basic",
  traders: { prapor: 4, therapist: 4, skier: 4, peacekeeper: 4, mechanic: 4, ragman: 4, jaeger: 4 },
  flea: true,
  level: 79,
};
const GATES: [string, PriceGate][] = [
  ["LL4", LL4],
  ["theorycraft", null],
];
const OBJECTIVES: Objective[] = ["min-recoil", "max-ergonomics", "min-weight", "max-accuracy"];

function run(
  name: string,
  objective: Objective,
  profile: PriceGate,
  extra: { budgetRub?: number; pins?: Record<string, string | null> } = {},
) {
  const id = idOf(name);
  const item = weapons.find((w) => w.id === id)!;
  const tree = snapshotWeaponTree(snapshot, id);
  const result = optimize({
    weapon: adaptWeapon(item),
    weaponItem: item,
    presets: presets[id] ?? [],
    slotTree: tree,
    parts,
    constraints: {
      profile,
      pinnedSlots: new Map(Object.entries(extra.pins ?? {})),
      ...(extra.budgetRub === undefined ? {} : { budgetRub: extra.budgetRub }),
    },
    objective,
    // The safety net is not under test, and coverage on a shared runner is slow.
    timeoutMs: 60_000,
  });
  return { result, item, tree, id };
}

/** The build, checked to be one the Builder takes as it stands. */
function valid(name: string, outcome: ReturnType<typeof run>, profile: PriceGate) {
  const { result, item, tree, id } = outcome;
  if (!result.ok) throw new Error(`${name}: ${result.reason}`);
  const resolved = resolveBuild(tree, result.build.attachments, byId);
  expect(resolved.conflicts, name).toEqual([]);
  expect(resolved.missingRequired, name).toEqual([]);
  expect(resolved.orphaned, name).toEqual([]);
  const placed = resolved.placed.map((p) => p.part);
  expect(result.stats, name).toEqual(weaponSpec(adaptWeapon(item), placed.map(adaptMod)));
  const price = buildPriceUnder(profile, { weapon: item, parts: placed, presets: presets[id] });
  return { result, placed, price };
}

const sum = (placed: readonly { id: string }[], field: (id: string) => number) =>
  placed.reduce((total, p) => total + field(p.id), 0);
const modifier = (id: string) => adaptMod(byId.get(id)!);

describe("goldens — real weapons", () => {
  it("returns a build the Builder accepts for every weapon, objective and gate", () => {
    for (const name of Object.values(fixture.weapons)) {
      for (const objective of OBJECTIVES) {
        for (const [gateName, gate] of GATES) {
          valid(`${name} ${objective} ${gateName}`, run(name, objective, gate), gate);
        }
      }
    }
  }, 120_000);

  // The optimum of each objective's own sum, from a MILP (CBC) solved independently over the
  // same records with every conflict, required slot and availability gate as a constraint.
  it("reaches the MILP optimum on LL4", () => {
    const optimum = (name: string, objective: Objective) =>
      valid(name, run(name, objective, LL4), LL4);
    const recoil = (id: string) => modifier(id).recoilModifier;
    const ergonomics = (id: string) => modifier(id).ergonomicsDelta;
    const weight = (id: string) => modifier(id).weight;
    expect(sum(optimum("Colt M4A1", "min-recoil").placed, recoil)).toBeCloseTo(-0.667, 9);
    expect(sum(optimum("Colt M4A1", "max-ergonomics").placed, ergonomics)).toBeCloseTo(78.25, 9);
    expect(sum(optimum("Colt M4A1", "min-weight").placed, weight)).toBeCloseTo(0.872, 9);
    expect(sum(optimum("AKM", "min-recoil").placed, recoil)).toBeCloseTo(-0.501, 9);
    expect(sum(optimum("AKM", "max-ergonomics").placed, ergonomics)).toBeCloseTo(71.6, 9);
    expect(sum(optimum("RSASS", "min-recoil").placed, recoil)).toBeCloseTo(-0.605, 9);
  }, 120_000);

  it("keeps a budget by the Builder's own price, and costs no more than it must", () => {
    for (const name of Object.values(fixture.weapons)) {
      const free = valid(name, run(name, "min-recoil", LL4), LL4);
      if (free.price.status !== "priced") throw new Error(`${name}: unpriced optimum`);
      // A budget the unbudgeted optimum fits returns a build as good, at no higher price.
      const roomy = valid(
        name,
        run(name, "min-recoil", LL4, { budgetRub: free.price.totalRUB }),
        LL4,
      );
      expect(roomy.result.stats.verticalRecoil, name).toBeCloseTo(
        free.result.stats.verticalRecoil,
        9,
      );
      expect(roomy.price, name).toEqual(free.price);
      // A tighter one returns a build inside it.
      const budgetRub = Math.round(free.price.totalRUB * 0.6);
      const tight = valid(name, run(name, "min-recoil", LL4, { budgetRub }), LL4).price;
      expect(tight.status === "priced" && tight.totalRUB <= budgetRub, name).toBe(true);
    }
  }, 120_000);

  it("keeps pins taken from another objective's build", () => {
    for (const name of Object.values(fixture.weapons)) {
      const ergo = valid(name, run(name, "max-ergonomics", LL4), LL4).result;
      const [path, itemId] = Object.entries(ergo.build.attachments).sort()[0]!;
      const pinned = valid(name, run(name, "min-recoil", LL4, { pins: { [path]: itemId } }), LL4);
      expect(pinned.result.build.attachments[path], name).toBe(itemId);
      expect(pinned.result.pins, name).toEqual({ honoured: [path], dropped: [] });
    }
  }, 120_000);
});
