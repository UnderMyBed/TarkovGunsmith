import { describe, it, expect } from "vitest";
import { weaponSpec } from "@tarkov/ballistics";
import { lowerBoundForRemaining } from "./bounds.js";
import { slotCandidates } from "./feasibility.js";
import { optimize } from "./optimize.js";
import { M4A1_MODS, M4A1_TREE, M4A1_WEAPON } from "./__fixtures__/m4a1-like.js";
import {
  SMALL_WEAPON,
  SMALL_WEAPON_ITEM,
  SMALL_MODS,
  SMALL_TREE,
} from "./__fixtures__/small-weapon.js";
import { adaptMod, partsById, type AttachablePart, type PlayerProfile } from "@tarkov/data";

const PARTS = partsById(SMALL_MODS);

const flea: PlayerProfile = {
  mode: "basic",
  traders: { prapor: 1, therapist: 1, skier: 1, peacekeeper: 1, mechanic: 1, ragman: 1, jaeger: 1 },
  flea: true,
  // The shared fixtures' flea offers carry minPlayerLevel: 15, inert until
  // itemAvailability started enforcing it. 15 keeps these tests on their original subject.
  level: 15,
};

describe("lowerBoundForRemaining", () => {
  it("min-weight: null (0 weight) is always the best candidate → 0 bound", () => {
    const bound = lowerBoundForRemaining(
      SMALL_TREE.slots,
      PARTS,
      flea,
      new Map(),
      "min-weight",
      SMALL_WEAPON,
    );
    expect(bound).toBe(0);
  });

  it("max-ergonomics: negative sum of best-ergo candidate per slot", () => {
    const bound = lowerBoundForRemaining(
      SMALL_TREE.slots,
      PARTS,
      flea,
      new Map(),
      "max-ergonomics",
      SMALL_WEAPON,
    );
    // Best ergo per slot: muzzle max(2, 3, 0) = 3; grip max(5, 0) = 5; stock max(8, 0) = 8 → 16.
    // Score is negated: -16.
    expect(bound).toBe(-16);
  });

  it("min-recoil: best possible recoil delta after all slots contribute their min recoilModifier", () => {
    const bound = lowerBoundForRemaining(
      SMALL_TREE.slots,
      PARTS,
      flea,
      new Map(),
      "min-recoil",
      SMALL_WEAPON,
    );
    // Best per-slot recoilModifier: muzzle min(-0.12, -0.08, 0) = -0.12;
    // grip min(-0.04, 0) = -0.04; stock min(-0.06, 0) = -0.06.
    // Sum = -0.22 (a real -22%). base = 100 + 200 = 300. bound = 300 * -0.22 = -66.
    expect(bound).toBeCloseTo(-66, 5);
  });

  it("respects pinned slots (uses pinned item's value, not the best available)", () => {
    const pinBrake = new Map([["muzzle", "muzzle_brake"]]);
    const bound = lowerBoundForRemaining(
      SMALL_TREE.slots,
      PARTS,
      flea,
      pinBrake,
      "max-ergonomics",
      SMALL_WEAPON,
    );
    // muzzle pinned to brake (ergo 2) + grip best (5) + stock best (8) = 15. Score delta = -15.
    expect(bound).toBe(-15);
  });

  it("returns 0 when there are no remaining slots", () => {
    expect(
      lowerBoundForRemaining([], SMALL_MODS, flea, new Map(), "min-weight", SMALL_WEAPON),
    ).toBe(0);
  });

  it("max-accuracy: zero bound when no candidate can improve accuracy", () => {
    // SMALL_MODS have accuracyModifier: 0 for all. Best is 0. Sum = 0.
    expect(
      lowerBoundForRemaining(
        SMALL_TREE.slots,
        PARTS,
        flea,
        new Map(),
        "max-accuracy",
        SMALL_WEAPON,
      ),
    ).toBeCloseTo(0, 10);
  });

  it("max-accuracy: takes the LARGEST accuracyModifier per slot, not the smallest", () => {
    // Upstream reports positive for better accuracy and negative for worse, so
    // the reachable optimum uses the precision brake (+0.06), never the
    // suppressor (-0.05). Picking the smallest is what made this objective
    // select for the worst accuracy available.
    const mods = SMALL_MODS.map((m) =>
      m.id === "muzzle_brake"
        ? { ...m, properties: { ...m.properties, accuracyModifier: 0.06 } }
        : m.id === "muzzle_silencer"
          ? { ...m, properties: { ...m.properties, accuracyModifier: -0.05 } }
          : m,
    );
    const bound = lowerBoundForRemaining(
      [SMALL_TREE.slots[0]],
      partsById(mods),
      flea,
      new Map(),
      "max-accuracy",
      SMALL_WEAPON,
    );
    // Best is +0.06. With no barrel in reach the bound is -K·C·D·0.06: the weapon's
    // 0.01 cm at the 100-deviationMax factor is 0.343779 MOA, so -0.343779 × 0.06.
    expect(bound).toBeCloseTo(-0.0206267, 6);
  });
});

/**
 * The max-accuracy bound is additive while MOA is a product, so it is checked exhaustively: on
 * the 8-slot fixture, with real barrels (centerOfImpact, deviationMax, accuracy) in the barrel
 * slot and real accuracy modifiers on the muzzles, every partial build's score plus the bound
 * must be at most the best MOA any completion of it reaches. A bound above that would prune the
 * better build.
 */
// An exhaustive walk of 10,000+ nodes: about 0.3 s locally, but over 5 s on a CI runner under
// coverage with every package's suite running at once.
describe("the max-accuracy bound is admissible", { timeout: 60_000 }, () => {
  const BARRELS = [
    // AR-15 10.3", 14.5" and Hanson Carbine Pro 16" barrels, live 2026-10-17.
    { centerOfImpact: 0.07, deviationMax: 22, accuracyModifier: 0 },
    { centerOfImpact: 0.053, deviationMax: 23, accuracyModifier: 0 },
    { centerOfImpact: 0.03, deviationMax: 23, accuracyModifier: 0.07 },
  ];
  // VP-09 brake +0.04, Bramit suppressor -0.05, none, SV-98 SRVV brake +0.06.
  const MUZZLE_ACCURACY = [0.04, -0.05, 0, 0.06];
  const parts: AttachablePart[] = M4A1_MODS.map((part) => {
    const [slot, index] = part.id.split("_") as [string, string];
    const i = Number(index);
    if (slot === "barrel") {
      const { ergonomics, recoilModifier } = part.properties as {
        ergonomics: number;
        recoilModifier: number;
      };
      return {
        ...part,
        properties: {
          propertiesType: "ItemPropertiesBarrel",
          ergonomics,
          recoilModifier,
          velocity: 0,
          ...BARRELS[i]!,
        },
      };
    }
    if (slot === "muzzle") {
      return {
        ...part,
        properties: {
          ...part.properties,
          accuracyModifier: MUZZLE_ACCURACY[i]!,
        } as AttachablePart["properties"],
      };
    }
    return part;
  });
  const profile: PlayerProfile = { ...flea, level: 99 };
  const slots = M4A1_TREE.slots;
  const accuracyOf = (mods: readonly AttachablePart[]) =>
    weaponSpec(M4A1_WEAPON, mods.map(adaptMod)).accuracy;
  const NO_PINS: ReadonlyMap<string, string | null> = new Map();

  // A pinned slot offers only its pinned part, so a pinned part with a NEGATIVE accuracy
  // modifier (a suppressor's -0.05, here on the sight slot) makes the remaining slots' best
  // summed accuracy negative.
  const sightPath = slots.find((s) => s.nameId === "sight")!.path;
  const PINNED_NEGATIVE: ReadonlyMap<string, string | null> = new Map([[sightPath, "sight_0"]]);
  const withNegativeSight = parts.map((part) =>
    part.id === "sight_0"
      ? {
          ...part,
          properties: {
            ...part.properties,
            accuracyModifier: -0.05,
          } as AttachablePart["properties"],
        }
      : part,
  );
  // A barrel elsewhere in the catalog, not mountable on this weapon, at the live maximum
  // centerOfImpact of 0.75 cm: the bound reads the catalog's largest barrel, not the weapon's.
  const barrel0 = parts.find((p) => p.id === "barrel_0")!;
  const withFarBarrel = [
    ...withNegativeSight,
    {
      ...barrel0,
      id: "far_barrel",
      properties: { ...barrel0.properties, centerOfImpact: 0.75 } as AttachablePart["properties"],
    },
  ];

  /** Best MOA over every completion; checks the bound at every node on the way. */
  function bestCompletion(
    catalog: readonly AttachablePart[],
    pins: ReadonlyMap<string, string | null>,
    checked: { nodes: number },
  ): number {
    const byId = partsById(catalog);
    const walk = (index: number, mods: AttachablePart[]): number => {
      if (index === slots.length) return accuracyOf(mods);
      let best = Number.POSITIVE_INFINITY;
      for (const candidate of slotCandidates(slots[index]!, byId, profile, pins)) {
        const next = candidate === null ? mods : [...mods, candidate];
        best = Math.min(best, walk(index + 1, next));
      }
      const bound = lowerBoundForRemaining(
        slots.slice(index),
        byId,
        profile,
        pins,
        "max-accuracy",
        M4A1_WEAPON,
      );
      expect(accuracyOf(mods) + bound).toBeLessThanOrEqual(best + 1e-12);
      checked.nodes += 1;
      return best;
    };
    return walk(0, []);
  }

  function solve(catalog: readonly AttachablePart[], pins: ReadonlyMap<string, string | null>) {
    return optimize({
      weapon: M4A1_WEAPON,
      // No budget, so the weapon's offers only break ties: any obtainable gun will do.
      weaponItem: SMALL_WEAPON_ITEM,
      slotTree: M4A1_TREE,
      parts: [...catalog],
      constraints: { profile, pinnedSlots: new Map(pins) },
      objective: "max-accuracy",
      timeoutMs: 20_000,
    });
  }

  it("never projects above the best completion of any partial build", () => {
    const checked = { nodes: 0 };
    const best = bestCompletion(parts, NO_PINS, checked);
    expect(checked.nodes).toBeGreaterThan(10_000);
    // The solver leaves any slot empty, required or not, so the best build has no barrel
    // (the receiver's 0.01 cm alone) and the SRVV brake: 0.343779 MOA × (1 − 0.06).
    expect(best).toBeCloseTo(0.3231518, 6);
  });

  it("stays admissible when a pinned part makes the remaining accuracy negative", () => {
    // 0.343779 × (1 − (−0.05 + 0.06)): the pinned sight, no barrel, the SRVV brake.
    expect(bestCompletion(withNegativeSight, PINNED_NEGATIVE, { nodes: 0 })).toBeCloseTo(
      0.3403412,
      6,
    );
    expect(bestCompletion(withFarBarrel, PINNED_NEGATIVE, { nodes: 0 })).toBeCloseTo(0.3403412, 6);
  });

  it("lets the solver find that best build", () => {
    const result = solve(parts, NO_PINS);
    expect(result.ok && !result.partial).toBe(true);
    if (!result.ok) return;
    expect(result.stats.accuracy).toBeCloseTo(bestCompletion(parts, NO_PINS, { nodes: 0 }), 12);
    expect(result.build.attachments.barrel).toBeUndefined();
    expect(result.build.attachments.muzzle).toBe("muzzle_3");
  });

  it("lets the solver find the best build with a negative pinned part, near or far barrels", () => {
    for (const catalog of [withNegativeSight, withFarBarrel]) {
      const result = solve(catalog, PINNED_NEGATIVE);
      expect(result.ok && !result.partial).toBe(true);
      if (!result.ok) continue;
      expect(result.stats.accuracy).toBeCloseTo(0.3403412, 6);
      expect(result.build.attachments.barrel).toBeUndefined();
    }
  });
});
