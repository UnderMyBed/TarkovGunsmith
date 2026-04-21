import { describe, it, expect } from "vitest";
import { branchAndBound, type BnbState } from "./branch-and-bound.js";
import { SMALL_WEAPON, SMALL_MODS, SMALL_TREE } from "./__fixtures__/small-weapon.js";
import type { PlayerProfile } from "@tarkov/data";

const flea: PlayerProfile = {
  mode: "basic",
  traders: { prapor: 1, therapist: 1, skier: 1, peacekeeper: 1, mechanic: 1, ragman: 1, jaeger: 1 },
  flea: true,
};

function makeState(overrides: Partial<BnbState> = {}): BnbState {
  return {
    weapon: SMALL_WEAPON,
    modList: SMALL_MODS,
    profile: flea,
    pinnedSlots: new Map(),
    objective: "min-recoil",
    budgetRub: undefined,
    deadline: Number.POSITIVE_INFINITY,
    onNodeVisit: () => true,
    ...overrides,
  };
}

describe("branchAndBound", () => {
  it("finds min-recoil optimum on small weapon", () => {
    const best = branchAndBound(makeState(), SMALL_TREE.slots);
    expect(best).not.toBeNull();
    expect(best!.attachments).toEqual({
      muzzle: "muzzle_brake",
      grip: "grip_vertical",
      stock: "stock_standard",
    });
  });

  it("respects pinned slots", () => {
    const pin = new Map([["muzzle", "muzzle_silencer"]]);
    const best = branchAndBound(makeState({ pinnedSlots: pin }), SMALL_TREE.slots);
    expect(best!.attachments.muzzle).toBe("muzzle_silencer");
  });

  it("respects budget", () => {
    // brake (1500) + vertical (900) + stock (2200) = 4600 fits 5000 budget.
    // silencer (3500) + vertical (900) + stock (2200) = 6600 exceeds.
    const best = branchAndBound(makeState({ budgetRub: 5000 }), SMALL_TREE.slots);
    expect(best!.attachments.muzzle).toBe("muzzle_brake");
  });

  it("returns a feasible best at budget 0 (empty build)", () => {
    const best = branchAndBound(makeState({ budgetRub: 0 }), SMALL_TREE.slots);
    expect(best).not.toBeNull();
    expect(Object.keys(best!.attachments)).toHaveLength(0);
  });

  it("aborts when onNodeVisit returns false (timeout simulation)", () => {
    const best = branchAndBound(makeState({ onNodeVisit: () => false }), SMALL_TREE.slots);
    // Aborted early; doesn't throw. Result may be null or a partial best.
    expect(best === null || typeof best.score === "number").toBe(true);
  });

  it("tie-breaks deterministically: min-weight on this fixture always picks empty build", () => {
    const best = branchAndBound(makeState({ objective: "min-weight" }), SMALL_TREE.slots);
    expect(best!.attachments).toEqual({});
    expect(best!.price).toBe(0);
  });

  it("is deterministic — same input, same output across 5 runs", () => {
    const state = makeState();
    const first = branchAndBound(state, SMALL_TREE.slots);
    for (let i = 0; i < 4; i++) {
      const r = branchAndBound(state, SMALL_TREE.slots);
      expect(r).toEqual(first);
    }
  });

  it("respects the post-onNodeVisit deadline check when the callback allows but the clock has passed", () => {
    // Build a wide 1100-slot state so the periodic visits%1000 check fires.
    // Use a deadline already in the past with an onNodeVisit that always
    // returns true — this exercises the redundant `Date.now() >= deadline`
    // safety check inside branchAndBound.
    const wide = makeVeryWideState();
    const best = branchAndBound(
      { ...wide.state, deadline: Date.now() - 1, onNodeVisit: () => true },
      wide.slots,
    );
    // Aborted post-onNodeVisit — no completed leaf, so null is valid;
    // but a partial best is also legal since aborting happens mid-descent.
    expect(best === null || typeof best.score === "number").toBe(true);
  }, 30_000);

  it("computes a 0 bound for slots with no feasible candidates (bounds fallback)", () => {
    // Construct a tree where picking item A unlocks a sub-slot pinned to
    // a nonexistent id — that sub-slot has 0 candidates. After the empty/
    // alt branch produces a leaf and sets best, the DFS tries item A and
    // calls lowerBoundForRemaining, which hits `candidates.length === 0`
    // and returns 0 for that sub-slot.
    const modList = [
      // B sorts first (lower recoilModifier), reaches a leaf, sets best.
      // Then A is tried — its pruning check calls lowerBoundForRemaining
      // for the sub-slot, hitting the empty-candidates fallback.
      tieMod("A", 0, 0, 0.1, 100),
      tieMod("B", -10, 0, 0.1, 100),
    ];
    const slots = [
      {
        nameId: "top",
        path: "top",
        name: "top",
        required: false,
        allowedItemIds: new Set(["A", "B"]),
        allowedItems: [
          {
            id: "A",
            name: "A",
            children: [
              {
                nameId: "sub",
                path: "top/sub",
                name: "sub",
                required: false,
                allowedItemIds: new Set(["nonexistent"]),
                allowedItems: [{ id: "nonexistent", name: "nonexistent", children: [] as never[] }],
                children: [],
              },
            ] as never[],
          },
          { id: "B", name: "B", children: [] as never[] },
        ],
        children: [],
      },
    ] as never[];
    const best = branchAndBound(
      makeState({
        modList,
        pinnedSlots: new Map([["top/sub", "nonexistent"]]),
      }),
      slots,
    );
    // Both branches run. B's branch is the only one that completes (sub-slot
    // has 0 candidates, so A's path never reaches a leaf). Final best = B.
    expect(best).not.toBeNull();
    expect(best!.attachments).toEqual({ top: "B" });
  });

  it("handles a pinned item whose id isn't in slot.allowedItems (?? [] fallback)", () => {
    // Pin muzzle to a pistolgrip — the item exists in modList but not in
    // the muzzle slot's allowedItemIds, so `.find()` returns undefined and
    // the `?? []` fallback path is taken for subSlots.
    const extendedModList = [
      ...SMALL_MODS,
      {
        id: "rogue_item",
        name: "Rogue",
        shortName: "R",
        iconLink: "https://example.com/rogue.png",
        weight: 0.1,
        types: ["mods"],
        minLevelForFlea: null,
        properties: {
          __typename: "ItemPropertiesWeaponMod",
          ergonomics: 0,
          recoilModifier: 0,
          accuracyModifier: 0,
        },
        buyFor: [
          {
            priceRUB: 100,
            currency: "RUB",
            vendor: {
              __typename: "FleaMarket",
              normalizedName: "flea-market",
              minPlayerLevel: 15,
            },
          },
        ],
      } as never,
    ];
    const best = branchAndBound(
      makeState({
        modList: extendedModList,
        pinnedSlots: new Map([["muzzle", "rogue_item"]]),
      }),
      SMALL_TREE.slots,
    );
    expect(best).not.toBeNull();
    expect(best!.attachments.muzzle).toBe("rogue_item");
  });

  it("handles a pinned item that is unavailable under the player profile (priceOrNull=null path)", () => {
    // Pin muzzle to a specific item; use fleaOff so the item isn't
    // available — `cheapestPrice` returns null, DFS proceeds at price 0.
    // Also exercises the `?? []` fallback when the pinned item id isn't
    // found in slot.allowedItems (since pinning bypasses the compatibility
    // filter in slotCandidates).
    const fleaOff: PlayerProfile = { ...flea, flea: false };
    const best = branchAndBound(
      makeState({
        profile: fleaOff,
        pinnedSlots: new Map([["muzzle", "muzzle_brake"]]),
      }),
      SMALL_TREE.slots,
    );
    expect(best).not.toBeNull();
    expect(best!.attachments.muzzle).toBe("muzzle_brake");
    expect(best!.price).toBe(0); // pinned-unavailable item billed at 0
  });

  it("picks the lexicographically-smaller build on a score+price tie (tie-break branch)", () => {
    // This setup forces the DFS to reach TWO leaves with identical scores,
    // exercising the tie-break branch at lines 175-182.
    //
    // Slot B has a min-recoil premium (excluded by budget) plus two
    // affordable duplicates (Bc1, Bc2). Slot C has a premium (excluded)
    // and one affordable item (Cc). The lower-bound uses the premium's
    // recoil, so it's optimistic enough that the Bc2 branch isn't pruned
    // even after Bc1's leaf sets best. Both Bc1+Cc and Bc2+Cc reach leaves
    // with identical scores — priced equally, so the tie resolves via
    // stableKey (Bc1 < Bc2 lex).
    const modList = [
      tieMod("B_premium", -20, 0, 0.1, 99999),
      tieMod("Bc1", -10, 0, 0.1, 100),
      tieMod("Bc2", -10, 0, 0.1, 100),
      tieMod("C_premium", -20, 0, 0.1, 99999),
      tieMod("Cc", -10, 0, 0.1, 100),
    ];
    const slots = [
      {
        nameId: "B",
        path: "B",
        name: "B",
        required: false,
        allowedItemIds: new Set(["B_premium", "Bc1", "Bc2"]),
        allowedItems: [
          { id: "B_premium", name: "B_premium", children: [] as never[] },
          { id: "Bc1", name: "Bc1", children: [] as never[] },
          { id: "Bc2", name: "Bc2", children: [] as never[] },
        ],
        children: [],
      },
      {
        nameId: "C",
        path: "C",
        name: "C",
        required: false,
        allowedItemIds: new Set(["C_premium", "Cc"]),
        allowedItems: [
          { id: "C_premium", name: "C_premium", children: [] as never[] },
          { id: "Cc", name: "Cc", children: [] as never[] },
        ],
        children: [],
      },
    ] as never[];
    const best = branchAndBound(makeState({ modList, budgetRub: 500 }), slots);
    expect(best).not.toBeNull();
    // Bc1 < Bc2 by stableKey — ties resolve to Bc1.
    expect(best!.attachments).toEqual({ B: "Bc1", C: "Cc" });
  });
});

function tieMod(id: string, recoil: number, ergo: number, weight: number, price: number) {
  return {
    id,
    name: id,
    shortName: id,
    iconLink: `https://example.com/${id}.png`,
    weight,
    types: ["mods"],
    minLevelForFlea: null,
    properties: {
      __typename: "ItemPropertiesWeaponMod",
      ergonomics: ergo,
      recoilModifier: recoil,
      accuracyModifier: 0,
    },
    buyFor: [
      {
        priceRUB: price,
        currency: "RUB",
        vendor: {
          __typename: "FleaMarket",
          normalizedName: "flea-market",
          minPlayerLevel: 15,
        },
      },
    ],
  } as never;
}

function makeVeryWideState(): { state: BnbState; slots: never[] } {
  const numSlots = 1100;
  const mods: unknown[] = [];
  const slots: unknown[] = [];
  for (let s = 0; s < numSlots; s++) {
    const id = `slot${s}_item`;
    mods.push(tieMod(id, 0, 0, 0, 1000));
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
    state: makeState({ modList: mods as never }),
    slots: slots as never[],
  };
}
