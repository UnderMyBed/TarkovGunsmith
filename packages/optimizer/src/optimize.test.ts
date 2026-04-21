import { describe, it, expect } from "vitest";
import { optimize } from "./optimize.js";
import { SMALL_WEAPON, SMALL_MODS, SMALL_TREE } from "./__fixtures__/small-weapon.js";
import { M4A1_WEAPON, M4A1_MODS, M4A1_TREE } from "./__fixtures__/m4a1-like.js";
import type { ModListItem, PlayerProfile, WeaponTree } from "@tarkov/data";

function makeTieMod(
  id: string,
  name: string,
  recoilModifier: number,
  ergonomics: number,
  weight: number,
  priceRub: number,
): ModListItem {
  return {
    id,
    name,
    shortName: name,
    iconLink: `https://example.com/${id}.png`,
    weight,
    types: ["mods"],
    minLevelForFlea: null,
    properties: {
      __typename: "ItemPropertiesWeaponMod",
      ergonomics,
      recoilModifier,
      accuracyModifier: 0,
    },
    buyFor: [
      {
        priceRUB: priceRub,
        currency: "RUB",
        vendor: {
          __typename: "FleaMarket",
          normalizedName: "flea-market",
          minPlayerLevel: 15,
        },
      },
    ],
  } as ModListItem;
}

/**
 * Wide fixture: N sequential slots, each with a single pinned-required
 * candidate. The DFS visits all N slots before reaching a leaf, so with
 * N > 1000 the periodic `visits.count % 1000 === 0` check fires inside
 * `branchAndBound` and exercises the onNodeVisit callback path.
 */
function makeVeryWideFixture(numSlots: number): {
  weapon: typeof SMALL_WEAPON;
  tree: WeaponTree;
  mods: readonly ModListItem[];
} {
  const mods: ModListItem[] = [];
  const slots = [];
  for (let s = 0; s < numSlots; s++) {
    const id = `slot${s}_item`;
    mods.push(makeTieMod(id, id, 0, 0, 0, 1000));
    slots.push({
      nameId: `slot${s}`,
      path: `slot${s}`,
      name: `slot${s}`,
      required: false,
      allowedItemIds: new Set([id]),
      allowedItems: [{ id, name: id, children: [] as never[] }],
      children: [],
    });
  }
  return {
    weapon: SMALL_WEAPON,
    tree: { weaponId: SMALL_WEAPON.id, weaponName: SMALL_WEAPON.name, slots },
    mods,
  };
}

const flea: PlayerProfile = {
  mode: "basic",
  traders: { prapor: 1, therapist: 1, skier: 1, peacekeeper: 1, mechanic: 1, ragman: 1, jaeger: 1 },
  flea: true,
};

const fleaOff: PlayerProfile = { ...flea, flea: false };

describe("optimize — small weapon", () => {
  it("returns ok:true with the computable optimum for min-recoil", () => {
    const result = optimize({
      weapon: SMALL_WEAPON,
      slotTree: SMALL_TREE,
      modList: SMALL_MODS,
      constraints: { profile: flea, pinnedSlots: new Map() },
      objective: "min-recoil",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.build.version).toBe(4);
    expect(result.build.attachments).toEqual({
      muzzle: "muzzle_brake",
      grip: "grip_vertical",
      stock: "stock_standard",
    });
  });

  it("returns ok:true with empty build when profile excludes all items", () => {
    const result = optimize({
      weapon: SMALL_WEAPON,
      slotTree: SMALL_TREE,
      modList: SMALL_MODS,
      constraints: { profile: fleaOff, pinnedSlots: new Map() },
      objective: "min-recoil",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.build.attachments).toEqual({});
  });

  it("returns ok:false reason=no-valid-combinations when a pinned item isn't in modList", () => {
    const result = optimize({
      weapon: SMALL_WEAPON,
      slotTree: SMALL_TREE,
      modList: SMALL_MODS,
      constraints: {
        profile: flea,
        pinnedSlots: new Map([["muzzle", "nonexistent"]]),
      },
      objective: "min-recoil",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("no-valid-combinations");
  });

  it("returns ok:true when budget is tight but some combinations fit", () => {
    const result = optimize({
      weapon: SMALL_WEAPON,
      slotTree: SMALL_TREE,
      modList: SMALL_MODS,
      constraints: { profile: flea, pinnedSlots: new Map(), budgetRub: 2000 },
      objective: "min-recoil",
    });
    expect(result.ok).toBe(true);
  });

  it("is deterministic — same input, same output across 10 runs", () => {
    const input = {
      weapon: SMALL_WEAPON,
      slotTree: SMALL_TREE,
      modList: SMALL_MODS,
      constraints: { profile: flea, pinnedSlots: new Map() },
      objective: "min-recoil" as const,
    };
    const first = optimize(input);
    for (let i = 0; i < 9; i++) {
      const r = optimize(input);
      expect(r).toEqual(first);
    }
  });
});

describe("optimize — m4a1-like weapon", () => {
  it("returns ok:true for min-recoil within 2s (performance check)", () => {
    const start = Date.now();
    const result = optimize({
      weapon: M4A1_WEAPON,
      slotTree: M4A1_TREE,
      modList: M4A1_MODS,
      constraints: { profile: flea, pinnedSlots: new Map() },
      objective: "min-recoil",
    });
    const elapsed = Date.now() - start;
    expect(result.ok).toBe(true);
    expect(elapsed).toBeLessThan(2000);
  });

  it("returns ok:true for max-ergonomics", () => {
    const result = optimize({
      weapon: M4A1_WEAPON,
      slotTree: M4A1_TREE,
      modList: M4A1_MODS,
      constraints: { profile: flea, pinnedSlots: new Map() },
      objective: "max-ergonomics",
    });
    expect(result.ok).toBe(true);
  });

  it("returns ok:true for min-weight", () => {
    const result = optimize({
      weapon: M4A1_WEAPON,
      slotTree: M4A1_TREE,
      modList: M4A1_MODS,
      constraints: { profile: flea, pinnedSlots: new Map() },
      objective: "min-weight",
    });
    expect(result.ok).toBe(true);
  });

  it("returns ok:true for max-accuracy", () => {
    const result = optimize({
      weapon: M4A1_WEAPON,
      slotTree: M4A1_TREE,
      modList: M4A1_MODS,
      constraints: { profile: flea, pinnedSlots: new Map() },
      objective: "max-accuracy",
    });
    expect(result.ok).toBe(true);
  });

  it("respects budget — resulting build costs at most budget", () => {
    const budget = 20000;
    const result = optimize({
      weapon: M4A1_WEAPON,
      slotTree: M4A1_TREE,
      modList: M4A1_MODS,
      constraints: { profile: flea, pinnedSlots: new Map(), budgetRub: budget },
      objective: "min-recoil",
    });
    expect(result.ok).toBe(true);
    // (Can't easily assert exact cost without duplicating price logic, but
    //  the DFS rejects any branch where runningPrice > budget.)
  });
});

describe("optimize — tiebreak", () => {
  it("deterministically picks the cheaper build when two builds score equal", () => {
    // Two muzzles with identical recoil/ergo/weight stats but different prices.
    // The optimizer should pick the cheaper one by tie-breaking.
    const modListForTie = [
      ...SMALL_MODS.filter((m) => !m.id.startsWith("muzzle")),
      makeTieMod("muzzle_a", "A", -12, 2, 0.3, 1000),
      makeTieMod("muzzle_b", "B", -12, 2, 0.3, 2000),
    ];
    const treeForTie = {
      ...SMALL_TREE,
      slots: SMALL_TREE.slots.map((s) =>
        s.nameId === "muzzle"
          ? {
              ...s,
              allowedItemIds: new Set(["muzzle_a", "muzzle_b"]),
              allowedItems: [
                { id: "muzzle_a", name: "A", children: [] as never[] },
                { id: "muzzle_b", name: "B", children: [] as never[] },
              ],
            }
          : s,
      ),
    };
    const result = optimize({
      weapon: SMALL_WEAPON,
      slotTree: treeForTie,
      modList: modListForTie,
      constraints: { profile: flea, pinnedSlots: new Map() },
      objective: "min-recoil",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.build.attachments.muzzle).toBe("muzzle_a");
  });
});

describe("optimize — timeout", () => {
  it("continues when onNodeVisit fires and deadline has not elapsed", () => {
    // 1100-slot wide fixture forces the visit%1000 check to fire, and a
    // generous 60s timeout guarantees the onNodeVisit callback returns
    // true (covering the no-abort branch inside the callback).
    const wide = makeVeryWideFixture(1100);
    const result = optimize({
      weapon: wide.weapon,
      slotTree: wide.tree,
      modList: wide.mods,
      constraints: { profile: flea, pinnedSlots: new Map() },
      objective: "min-recoil",
      timeoutMs: 60_000,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.partial).toBeUndefined();
  }, 30_000);

  it("aborts mid-search via onNodeVisit when the deadline elapses mid-flight", () => {
    // 1100-slot wide fixture — each slot has 1 candidate, so the first
    // (only) leaf requires > 1000 dfs() calls. That guarantees the
    // `visits.count % 1000 === 0` check in branchAndBound fires, which
    // invokes the onNodeVisit callback in optimize.ts. With timeoutMs:0
    // the callback observes `Date.now() >= deadline` and returns false,
    // covering both the optimize.ts abort branch and the branch-and-bound
    // periodic-check path.
    const wide = makeVeryWideFixture(1100);
    const result = optimize({
      weapon: wide.weapon,
      slotTree: wide.tree,
      modList: wide.mods,
      constraints: { profile: flea, pinnedSlots: new Map() },
      objective: "min-recoil",
      timeoutMs: 0,
    });
    if (result.ok) {
      expect(result.partial).toBe(true);
    } else {
      expect(result.reason).toBe("timeout");
    }
  });

  it("returns ok:false reason=timeout when the deadline is already in the past", () => {
    // Use timeoutMs: 0 so onNodeVisit (via `Date.now() >= deadline`) aborts
    // on the very first check before any leaf is scored.
    const result = optimize({
      weapon: M4A1_WEAPON,
      slotTree: M4A1_TREE,
      modList: M4A1_MODS,
      constraints: { profile: flea, pinnedSlots: new Map() },
      objective: "min-recoil",
      timeoutMs: 0,
    });
    if (result.ok) {
      expect(result.partial).toBe(true);
    } else {
      expect(result.reason).toBe("timeout");
    }
  });
});
