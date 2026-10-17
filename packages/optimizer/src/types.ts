import type {
  AttachablePart,
  AvailabilityInput,
  BuildV6,
  PresetContents,
  PriceGate,
  WeaponTree,
} from "@tarkov/data";
import type { BallisticWeapon, WeaponSpec } from "@tarkov/ballistics";

/** What the solver optimizes first. Ties go to the cheaper build, then to the one with fewer parts. */
export type Objective = "min-recoil" | "max-ergonomics" | "min-weight" | "max-accuracy";

export interface OptimizationConstraints {
  /**
   * Hard cap in RUB on the whole build — the weapon (or the preset it is bought as) plus its
   * parts, priced by `@tarkov/data`'s `buildPriceUnder` rule. `undefined` → no budget.
   */
  readonly budgetRub?: number;
  /**
   * Whose gates decide what can be bought and at what price (`@tarkov/data` `priceUnder`);
   * `null` is theorycraft.
   */
  readonly profile: PriceGate;
  /**
   * Slot path → item id (put this part there) or `null` (leave it empty), wherever the build
   * has that path. A pinned part skips the availability gate. Slots absent from the map are
   * the solver's to choose. The result's {@link PinReport} says which pins it kept.
   */
  readonly pinnedSlots: ReadonlyMap<string, string | null>;
}

export interface OptimizationInput {
  /** Adapted weapon (output of `apps/web`'s `adaptWeapon`). */
  readonly weapon: BallisticWeapon;
  /** The weapon's own record, for its offers and its short name in messages. */
  readonly weaponItem: AvailabilityInput & { readonly shortName: string };
  /** The weapon's presets, so parts a bought preset comes with are not paid for twice. */
  readonly presets?: readonly PresetContents[];
  /** Resolved weapon slot tree (output of `useWeaponTree`). */
  readonly slotTree: WeaponTree;
  /** Every attachable part (output of `usePartCatalog`): mods, barrels, scopes, magazines, ammo. */
  readonly parts: readonly AttachablePart[];
  readonly constraints: OptimizationConstraints;
  readonly objective: Objective;
  /** Wall-clock safety net in milliseconds. Default 2000. */
  readonly timeoutMs?: number;
  /**
   * Called each time the search takes a candidate build to check against the conflict rules,
   * with how many it has taken so far in this run, across every search the run makes. It only
   * observes: the result is the same with or without it.
   */
  readonly onProgress?: (progress: OptimizationProgress) => void;
}

/** How far a run has got. */
export interface OptimizationProgress {
  /** Candidate builds checked so far. */
  readonly nodes: number;
}

/** Why a pin is not in the result. */
export type DroppedPinReason =
  /** The build the solver chose has no slot at that path. */
  | "absent"
  /** The slot at that path does not take the pinned part. */
  | "not-allowed"
  /** The game data does not hold the pinned id. */
  | "unknown-item"
  /** The pin asks to leave a required slot empty. */
  | "required";

export interface DroppedPin {
  readonly path: string;
  readonly itemId: string | null;
  readonly reason: DroppedPinReason;
}

export interface PinReport {
  /** Paths whose pin the build keeps. */
  readonly honoured: readonly string[];
  readonly dropped: readonly DroppedPin[];
}

export type OptimizationResult =
  | {
      readonly ok: true;
      readonly build: BuildV6;
      readonly stats: WeaponSpec;
      readonly pins: PinReport;
    }
  | {
      /** The safety net fired before the search finished. */
      readonly ok: false;
      readonly reason: "timeout";
    }
  | {
      /** The profile cannot get the weapon at all. */
      readonly ok: false;
      readonly reason: "weapon-unavailable";
      readonly message: string;
    }
  | {
      /** A required slot nothing the profile can get fills, however the weapon is bought. */
      readonly ok: false;
      readonly reason: "required-slot";
      readonly slotPath: string;
      readonly message: string;
    }
  | {
      /** Complete builds exist, but none that keeps every pin. */
      readonly ok: false;
      readonly reason: "pin-conflict";
      readonly paths: readonly string[];
      readonly message: string;
    }
  | {
      /** No complete build fits the budget, or none can be shown to. */
      readonly ok: false;
      readonly reason: "infeasible-budget";
      readonly message: string;
    }
  | {
      /** Under a budget, pinned parts whose price under the profile is not known. */
      readonly ok: false;
      readonly reason: "pinned-unpriced";
      readonly itemIds: readonly string[];
      readonly message: string;
    }
  | {
      /** Every complete build has parts that cannot be fitted together. */
      readonly ok: false;
      readonly reason: "no-valid-combinations";
      readonly message: string;
    };

export type OptimizationReason = Extract<OptimizationResult, { ok: false }>["reason"];
