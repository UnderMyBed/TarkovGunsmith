import { describe, it, expect } from "vitest";
import { weaponSpec } from "@tarkov/ballistics";
import { lowerBoundForRemaining } from "./bounds.js";
import { slotCandidates } from "./feasibility.js";
import { optimize } from "./optimize.js";
import { M4A1_MODS, M4A1_TREE, M4A1_WEAPON } from "./__fixtures__/m4a1-like.js";
import { SMALL_WEAPON, SMALL_MODS, SMALL_TREE } from "./__fixtures__/small-weapon.js";
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
describe("the max-accuracy bound is admissible", () => {
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
  const byId = partsById(parts);
  const profile: PlayerProfile = { ...flea, level: 99 };
  const slots = M4A1_TREE.slots;
  const accuracyOf = (mods: readonly AttachablePart[]) =>
    weaponSpec(M4A1_WEAPON, mods.map(adaptMod)).accuracy;

  /** Best MOA over every completion; checks the bound at every node on the way. */
  function bestCompletion(
    index: number,
    mods: AttachablePart[],
    checked: { nodes: number },
  ): number {
    if (index === slots.length) return accuracyOf(mods);
    let best = Number.POSITIVE_INFINITY;
    for (const candidate of slotCandidates(slots[index]!, byId, profile, new Map())) {
      const next = candidate === null ? mods : [...mods, candidate];
      best = Math.min(best, bestCompletion(index + 1, next, checked));
    }
    const bound = lowerBoundForRemaining(
      slots.slice(index),
      byId,
      profile,
      new Map(),
      "max-accuracy",
      M4A1_WEAPON,
    );
    expect(accuracyOf(mods) + bound).toBeLessThanOrEqual(best + 1e-12);
    checked.nodes += 1;
    return best;
  }

  it("never projects above the best completion of any partial build", () => {
    const checked = { nodes: 0 };
    const best = bestCompletion(0, [], checked);
    expect(checked.nodes).toBeGreaterThan(10_000);
    // The solver leaves any slot empty, required or not, so the best build has no barrel
    // (the receiver's 0.01 cm alone) and the SRVV brake: 0.343779 MOA × (1 − 0.06).
    expect(best).toBeCloseTo(0.3231518, 6);
  });

  it("lets the solver find that best build", () => {
    const result = optimize({
      weapon: M4A1_WEAPON,
      slotTree: M4A1_TREE,
      parts,
      constraints: { profile, pinnedSlots: new Map() },
      objective: "max-accuracy",
      timeoutMs: 20_000,
    });
    expect(result.ok && !result.partial).toBe(true);
    if (!result.ok) return;
    expect(result.stats.accuracy).toBeCloseTo(bestCompletion(0, [], { nodes: 0 }), 12);
    expect(result.build.attachments.barrel).toBeUndefined();
    expect(result.build.attachments.muzzle).toBe("muzzle_3");
  });
});
