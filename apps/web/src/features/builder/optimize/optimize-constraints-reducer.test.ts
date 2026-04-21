import { describe, it, expect } from "vitest";
import {
  constraintsReducer,
  initialConstraintsState,
  toOptimizerInput,
  type ConstraintsState,
} from "./optimize-constraints-reducer.js";
import type { PlayerProfile } from "@tarkov/data";

const profile: PlayerProfile = {
  mode: "basic",
  traders: {
    prapor: 1,
    therapist: 1,
    skier: 1,
    peacekeeper: 1,
    mechanic: 1,
    ragman: 1,
    jaeger: 1,
  },
  flea: true,
};

describe("constraintsReducer", () => {
  it("initial state has objective=min-recoil and no budget", () => {
    expect(initialConstraintsState.objective).toBe("min-recoil");
    expect(initialConstraintsState.budgetRub).toBeUndefined();
    expect(initialConstraintsState.pinnedSlots.size).toBe(0);
  });

  it("SET_OBJECTIVE updates the objective", () => {
    const next = constraintsReducer(initialConstraintsState, {
      type: "SET_OBJECTIVE",
      objective: "max-ergonomics",
    });
    expect(next.objective).toBe("max-ergonomics");
  });

  it("SET_BUDGET parses string input and handles blank as undefined", () => {
    const set = constraintsReducer(initialConstraintsState, {
      type: "SET_BUDGET",
      value: "50000",
    });
    expect(set.budgetRub).toBe(50000);
    const cleared = constraintsReducer(set, { type: "SET_BUDGET", value: "" });
    expect(cleared.budgetRub).toBeUndefined();
  });

  it("SET_BUDGET ignores negative or non-numeric input", () => {
    const neg = constraintsReducer(initialConstraintsState, { type: "SET_BUDGET", value: "-5" });
    expect(neg).toBe(initialConstraintsState);
    const nan = constraintsReducer(initialConstraintsState, { type: "SET_BUDGET", value: "abc" });
    expect(nan).toBe(initialConstraintsState);
  });

  it("TOGGLE_PIN removes a pinned slot", () => {
    const state: ConstraintsState = {
      ...initialConstraintsState,
      pinnedSlots: new Map([["muzzle", "muzzle_brake"]]),
    };
    const removed = constraintsReducer(state, { type: "TOGGLE_PIN", slotPath: "muzzle" });
    expect(removed.pinnedSlots.has("muzzle")).toBe(false);
  });

  it("TOGGLE_PIN adds a slot with a default item id when provided", () => {
    const state = initialConstraintsState;
    const added = constraintsReducer(state, {
      type: "TOGGLE_PIN",
      slotPath: "muzzle",
      defaultItemId: "muzzle_brake",
    });
    expect(added.pinnedSlots.get("muzzle")).toBe("muzzle_brake");
  });

  it("TOGGLE_PIN adds a slot with null (empty pin) when no default provided", () => {
    const added = constraintsReducer(initialConstraintsState, {
      type: "TOGGLE_PIN",
      slotPath: "muzzle",
    });
    expect(added.pinnedSlots.has("muzzle")).toBe(true);
    expect(added.pinnedSlots.get("muzzle")).toBeNull();
  });

  it("INIT_FROM_BUILD populates pinnedSlots with all currently-attached mods", () => {
    const state = constraintsReducer(initialConstraintsState, {
      type: "INIT_FROM_BUILD",
      attachments: { muzzle: "brake", grip: "vgrip" },
    });
    expect(state.pinnedSlots.get("muzzle")).toBe("brake");
    expect(state.pinnedSlots.get("grip")).toBe("vgrip");
    expect(state.pinnedSlots.size).toBe(2);
  });

  it("RESET returns to initial", () => {
    const state: ConstraintsState = {
      objective: "max-ergonomics",
      budgetRub: 5000,
      pinnedSlots: new Map([["muzzle", "brake"]]),
    };
    expect(constraintsReducer(state, { type: "RESET" })).toEqual(initialConstraintsState);
  });
});

describe("toOptimizerInput", () => {
  it("builds an OptimizationInput from ConstraintsState + deps", () => {
    const state: ConstraintsState = {
      objective: "min-recoil",
      budgetRub: 50000,
      pinnedSlots: new Map([["muzzle", "brake"]]),
    };
    const out = toOptimizerInput(state, {
      weapon: {
        id: "w1",
        name: "W",
        baseErgonomics: 0,
        baseVerticalRecoil: 0,
        baseHorizontalRecoil: 0,
        baseWeight: 0,
        baseAccuracy: 0,
      },
      slotTree: { weaponId: "w1", weaponName: "W", slots: [] },
      modList: [],
      profile,
    });
    expect(out.objective).toBe("min-recoil");
    expect(out.constraints.budgetRub).toBe(50000);
    expect(out.constraints.pinnedSlots.get("muzzle")).toBe("brake");
    expect(out.constraints.profile).toBe(profile);
  });

  it("omits budgetRub when state's budgetRub is undefined", () => {
    const state: ConstraintsState = initialConstraintsState;
    const out = toOptimizerInput(state, {
      weapon: {
        id: "w1",
        name: "W",
        baseErgonomics: 0,
        baseVerticalRecoil: 0,
        baseHorizontalRecoil: 0,
        baseWeight: 0,
        baseAccuracy: 0,
      },
      slotTree: { weaponId: "w1", weaponName: "W", slots: [] },
      modList: [],
      profile,
    });
    expect(out.constraints.budgetRub).toBeUndefined();
  });
});
