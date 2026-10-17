import type {
  AttachablePart,
  AvailabilityInput,
  BuildV6,
  PresetContents,
  PriceGate,
  WeaponTree,
} from "@tarkov/data";
import type { BallisticWeapon, WeaponSpec } from "@tarkov/ballistics";

/**
 * Objective the solver minimizes (uniformly — `score()` inverts
 * higher-is-better stats so the DFS can always minimize).
 */
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
   * slotPath → itemId (force this item) | null (force empty).
   * Slots absent from the map are "unpinned" — solver chooses.
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
  /** Wall-clock timeout in milliseconds. Default 2000. */
  readonly timeoutMs?: number;
}

export type OptimizationReason =
  "no-valid-combinations" | "infeasible-budget" | "pinned-unpriced" | "timeout";

export type OptimizationResult =
  | {
      readonly ok: true;
      readonly build: BuildV6;
      readonly stats: WeaponSpec;
      /** `true` when the timeout fired before the search completed. */
      readonly partial?: boolean;
    }
  | {
      readonly ok: false;
      readonly reason: "no-valid-combinations" | "timeout";
    }
  | {
      /** The weapon alone is over budget, or has no price the profile can pay. */
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
    };
