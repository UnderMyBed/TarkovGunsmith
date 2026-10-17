import type {
  AttachablePart,
  PriceGate,
  PricedPreset,
  WeaponListItem,
  WeaponTree,
} from "@tarkov/data";
import type { Objective } from "@tarkov/optimizer";
import { OPTIMIZER_TIMEOUT_MS, type OptimizeRequest } from "./optimize-protocol.js";
import type { BallisticWeapon } from "@tarkov/ballistics";

export interface ConstraintsState {
  objective: Objective;
  budgetRub: number | undefined;
  /**
   * Slot path → the part to keep there, or `null` to leave it empty. A slot absent from the
   * map is free: the solver's to choose. Starts empty — the optimizer pins nothing unasked.
   */
  pinnedSlots: Map<string, string | null>;
}

export const initialConstraintsState: ConstraintsState = {
  objective: "min-recoil",
  budgetRub: undefined,
  pinnedSlots: new Map(),
};

/** What a slot is pinned to: nothing (free), empty, or one part. */
export type PinChoice = "free" | "empty" | { readonly itemId: string };

export type ConstraintsAction =
  | { type: "SET_OBJECTIVE"; objective: Objective }
  | { type: "SET_BUDGET"; value: string }
  | { type: "SET_PIN"; slotPath: string; pin: PinChoice }
  /** Free these slots for the solver: their pins are removed, never set to empty. */
  | { type: "UNPIN"; slotPaths: readonly string[] }
  | { type: "CLEAR_PINS" }
  | { type: "RESET" };

/** Whether `path` lies strictly below `parent` in the slot tree. */
export function isBelow(path: string, parent: string): boolean {
  return path.startsWith(`${parent}/`);
}

export function constraintsReducer(
  state: ConstraintsState,
  action: ConstraintsAction,
): ConstraintsState {
  switch (action.type) {
    case "SET_OBJECTIVE":
      return { ...state, objective: action.objective };
    case "SET_BUDGET": {
      const trimmed = action.value.trim();
      if (trimmed === "") return { ...state, budgetRub: undefined };
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0) return state;
      return { ...state, budgetRub: parsed };
    }
    case "SET_PIN": {
      const next = new Map(state.pinnedSlots);
      const { slotPath, pin } = action;
      if (pin === "free") {
        next.delete(slotPath);
      } else if (pin === "empty") {
        next.set(slotPath, null);
        // An empty slot has nothing below it: a pin there could never hold.
        for (const path of [...next.keys()]) if (isBelow(path, slotPath)) next.delete(path);
      } else {
        next.set(slotPath, pin.itemId);
      }
      return { ...state, pinnedSlots: next };
    }
    case "UNPIN": {
      const next = new Map(state.pinnedSlots);
      for (const path of action.slotPaths) next.delete(path);
      return { ...state, pinnedSlots: next };
    }
    case "CLEAR_PINS":
      return { ...state, pinnedSlots: new Map() };
    case "RESET":
      return initialConstraintsState;
  }
}

export interface OptimizerInputDeps {
  weapon: BallisticWeapon;
  /** The weapon's own record: its offers count toward the budget. */
  weaponItem: WeaponListItem;
  slotTree: WeaponTree;
  parts: readonly AttachablePart[];
  /** Whose gates the search and the budget read: the profile, or `null` in theorycraft. */
  gate: PriceGate;
  /** The weapon's presets, so the budget does not pay twice for parts a preset comes with. */
  presets: readonly PricedPreset[];
  /** Without live prices no build can be shown to fit a budget, so none is sent. */
  pricesReady: boolean;
}

/**
 * Combine the form state with the runtime deps into the request the optimizer worker runs
 * `optimize()` on, with the Builder's time limit.
 */
export function toOptimizerInput(
  state: ConstraintsState,
  deps: OptimizerInputDeps,
): OptimizeRequest {
  return {
    weapon: deps.weapon,
    weaponItem: deps.weaponItem,
    slotTree: deps.slotTree,
    parts: deps.parts,
    presets: deps.presets,
    objective: state.objective,
    timeoutMs: OPTIMIZER_TIMEOUT_MS,
    constraints: {
      profile: deps.gate,
      pinnedSlots: state.pinnedSlots,
      ...(state.budgetRub !== undefined && deps.pricesReady ? { budgetRub: state.budgetRub } : {}),
    },
  };
}
