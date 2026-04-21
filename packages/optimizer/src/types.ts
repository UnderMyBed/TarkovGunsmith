import type { BuildV4, PlayerProfile, WeaponTree, ModListItem } from "@tarkov/data";
import type { BallisticWeapon, WeaponSpec } from "@tarkov/ballistics";

/**
 * Objective the solver minimizes (uniformly — `score()` inverts
 * higher-is-better stats so the DFS can always minimize).
 */
export type Objective = "min-recoil" | "max-ergonomics" | "min-weight" | "max-accuracy";

export interface OptimizationConstraints {
  /** Hard cap in RUB. `undefined` → no budget constraint. */
  readonly budgetRub?: number;
  /** Determines availability via `@tarkov/data` `itemAvailability`. */
  readonly profile: PlayerProfile;
  /**
   * slotPath → itemId (force this item) | null (force empty).
   * Slots absent from the map are "unpinned" — solver chooses.
   */
  readonly pinnedSlots: ReadonlyMap<string, string | null>;
}

export interface OptimizationInput {
  /** Adapted weapon (output of `apps/web`'s `adaptWeapon`). */
  readonly weapon: BallisticWeapon;
  /** Resolved weapon slot tree (output of `useWeaponTree`). */
  readonly slotTree: WeaponTree;
  /** All candidate mods (output of `useModList`). */
  readonly modList: readonly ModListItem[];
  readonly constraints: OptimizationConstraints;
  readonly objective: Objective;
  /** Wall-clock timeout in milliseconds. Default 2000. */
  readonly timeoutMs?: number;
}

export type OptimizationReason = "no-valid-combinations" | "infeasible-budget" | "timeout";

export type OptimizationResult =
  | {
      readonly ok: true;
      readonly build: BuildV4;
      readonly stats: WeaponSpec;
      /** `true` when the timeout fired before the search completed. */
      readonly partial?: boolean;
    }
  | {
      readonly ok: false;
      readonly reason: OptimizationReason;
    };
