import { useMemo, useReducer, useState } from "react";
import { weaponSpec, type BallisticWeapon, type WeaponSpec } from "@tarkov/ballistics";
import {
  adaptMod,
  partsById,
  resolveBuild,
  type AttachablePart,
  type BuildPrice,
  type BuildV6,
  type PriceGate,
  type PricedPreset,
  type WeaponListItem,
  type WeaponTree,
} from "@tarkov/data";
import type { OptimizationResult } from "@tarkov/optimizer";
import { coversOf, priceBuild } from "../build-price.js";
import { flattenProposalSlots, flattenVisibleSlots, type VisibleSlot } from "../slot-selection.js";
import { buildFromSelection } from "./build-from-selection.js";
import {
  constraintsReducer,
  initialConstraintsState,
  isBelow,
  toOptimizerInput,
  type ConstraintsAction,
  type ConstraintsState,
} from "./optimize-constraints-reducer.js";
import { slotDiff, weaponChangeOf, type ChangedRow, type WeaponChange } from "./slot-diff.js";
import { useOptimizer, type UseOptimizerReturn } from "./useOptimizer.js";

/** What a slot is pinned to in the tree: the solver's to choose, the build's part, or nothing. */
export type PinState = "free" | "lock" | "empty";

export function pinStateOf(pin: string | null | undefined): PinState {
  return pin === undefined ? "free" : pin === null ? "empty" : "lock";
}

export interface OptimizeSessionDeps {
  weapon: BallisticWeapon;
  /** The weapon's own record: the budget and the price cover the gun as well as its parts. */
  weaponItem: WeaponListItem;
  slotTree: WeaponTree;
  parts: readonly AttachablePart[];
  /** Whose gates the search and prices read: the profile, or `null` in theorycraft. */
  gate: PriceGate;
  presets: readonly PricedPreset[];
  /** Whether live prices have loaded: a budget and every price wait for them. */
  pricesReady: boolean;
  currentBuild: BuildV6;
  currentPrice: BuildPrice | null;
}

/** The ticked changes applied to the current build, and what that build is. */
export interface TickedBuild {
  readonly build: BuildV6;
  readonly spec: WeaponSpec;
  /** `null` until prices load. */
  readonly price: BuildPrice | null;
}

export interface OptimizeSession {
  readonly tree: WeaponTree;
  readonly constraints: ConstraintsState;
  readonly dispatch: (action: ConstraintsAction) => void;
  readonly optimizer: UseOptimizerReturn;
  /** The solver's build, when the last run found one. */
  readonly proposed: Extract<OptimizationResult, { ok: true }> | null;
  /** The last run's failure, when the solver found no build. */
  readonly failure: Extract<OptimizationResult, { ok: false }> | null;
  /** The tree's rows: every slot the current build or the proposal reaches. */
  readonly rows: readonly VisibleSlot[];
  /** Slot path → the proposal's change there. Empty without a proposal. */
  readonly changes: ReadonlyMap<string, ChangedRow>;
  readonly ticked: ReadonlySet<string>;
  readonly toggleTick: (path: string) => void;
  /** The weapon bought another way by the proposal, when it is. */
  readonly weaponChange: WeaponChange | null;
  /** What Apply would make the build; `null` without a proposal. */
  readonly tickedBuild: TickedBuild | null;
  /** The part on the current build at each path, on the weapon only. */
  readonly currentOn: Readonly<Record<string, string>>;
  /** The proposal's part at each path, on the weapon only; the current build's without one. */
  readonly proposedOn: Readonly<Record<string, string>>;
  /** A part's display name. */
  readonly nameOf: (id: string) => string;
  /**
   * Pin a slot. LOCK keeps the current build's part. EMPTY on a slot with pins below it asks
   * first ({@link confirming}), because it clears them.
   */
  readonly setPin: (path: string, state: PinState) => void;
  /**
   * Whether a pin state can be set on a slot: only on a slot the current build reaches, a lock
   * needs a part there, and a required slot can't be left empty.
   */
  readonly canPin: (path: string, state: PinState) => boolean;
  /** Whether the slot takes pins at all: the current build reaches it. */
  readonly isPinnable: (path: string) => boolean;
  /** The slot whose EMPTY is waiting to be confirmed, and how many pins it clears. */
  readonly confirming: { readonly path: string; readonly below: number } | null;
  readonly confirmEmpty: () => void;
  readonly cancelEmpty: () => void;
  /** Start a run on the current constraints. */
  readonly run: () => void;
  /** Change the constraints and run on the changed ones at once. */
  readonly changeAndRun: (action: ConstraintsAction) => void;
}

/**
 * Everything the workbench's optimize mode holds: the constraints, the run, which of the
 * proposal's changes are ticked, and the build those ticks make. One session per weapon: the
 * workbench mounts it keyed by the weapon, so pins never outlive the slots they name.
 *
 * Every change starts ticked when a result arrives. The ticked build is the one Apply gives,
 * and its stats and price are what the stat strip and the Proposal card show.
 */
export function useOptimizeSession(deps: OptimizeSessionDeps): OptimizeSession {
  const { weapon, weaponItem, slotTree, parts, gate, presets, pricesReady } = deps;
  const { currentBuild, currentPrice } = deps;
  const [constraints, dispatch] = useReducer(constraintsReducer, initialConstraintsState);
  const optimizer = useOptimizer();
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [confirmingPath, setConfirmingPath] = useState<string | null>(null);

  const result = optimizer.result;
  const proposed = result && result.ok ? result : null;
  const failure = result && !result.ok ? result : null;

  const byId = useMemo(() => partsById(parts), [parts]);
  const nameOf = (id: string) => byId.get(id)?.name ?? id;

  const currentOn = useMemo(
    () => resolveBuild(slotTree, currentBuild.attachments, byId).attachments,
    [slotTree, currentBuild.attachments, byId],
  );
  const proposedOn = useMemo(
    () =>
      proposed ? resolveBuild(slotTree, proposed.build.attachments, byId).attachments : currentOn,
    [proposed, slotTree, byId, currentOn],
  );

  const proposedPrice = useMemo(
    () =>
      proposed && pricesReady
        ? priceBuild(gate, weaponItem, slotTree, proposed.build.attachments, byId, presets)
        : null,
    [proposed, pricesReady, gate, weaponItem, slotTree, byId, presets],
  );

  const changedRows = useMemo(
    () =>
      proposed
        ? slotDiff(currentOn, proposedOn, slotTree, byId, gate, {
            current: coversOf(currentPrice, presets),
            proposed: coversOf(proposedPrice, presets),
          })
        : [],
    [proposed, currentOn, proposedOn, slotTree, byId, gate, currentPrice, proposedPrice, presets],
  );
  const changes = useMemo(
    () => new Map(changedRows.map((row) => [row.slotId, row])),
    [changedRows],
  );

  // Every change starts ticked, in the same render as the result: a tick made right after the
  // result shows must count.
  const [tickedFor, setTickedFor] = useState(proposed);
  if (proposed !== tickedFor) {
    setTickedFor(proposed);
    setTicked(new Set(changedRows.map((row) => row.slotId)));
  }

  const weaponChange = useMemo(
    () =>
      weaponChangeOf(currentPrice, proposedPrice, changedRows, (id) =>
        id === null ? weaponItem.shortName : (presets.find((p) => p.id === id)?.shortName ?? id),
      ),
    [currentPrice, proposedPrice, changedRows, presets, weaponItem],
  );

  const tickedBuild = useMemo((): TickedBuild | null => {
    if (!proposed) return null;
    const build = buildFromSelection(currentBuild, proposed.build, ticked, slotTree, byId);
    const placed = resolveBuild(slotTree, build.attachments, byId).placed;
    return {
      build,
      spec: weaponSpec(
        weapon,
        placed.map((p) => adaptMod(p.part)),
      ),
      price: pricesReady
        ? priceBuild(gate, weaponItem, slotTree, build.attachments, byId, presets)
        : null,
    };
  }, [
    proposed,
    currentBuild,
    ticked,
    slotTree,
    byId,
    weapon,
    pricesReady,
    gate,
    weaponItem,
    presets,
  ]);

  const pins = constraints.pinnedSlots;
  const rows = useMemo(() => {
    const emptied = [...pins].filter(([, id]) => id === null).map(([path]) => path);
    // A slot kept empty has nothing below it. A change below one still shows: it is ticked, and
    // nothing ticked may be out of sight.
    return flattenProposalSlots(slotTree, currentOn, proposedOn).filter(
      (row) =>
        changes.has(row.slot.path) || !emptied.some((parent) => isBelow(row.slot.path, parent)),
    );
  }, [pins, slotTree, currentOn, proposedOn, changes]);

  // Pins go only on slots the current build reaches. The build does not change within a session,
  // so a pin never names a slot the tree has stopped showing; a slot only the proposal has may
  // be gone after the next run.
  const pinnable = useMemo(
    () => new Map(flattenVisibleSlots(slotTree, currentOn).map((row) => [row.slot.path, row])),
    [slotTree, currentOn],
  );

  const pinsBelow = (path: string) => [...pins.keys()].filter((p) => isBelow(p, path));

  const canPin = (path: string, state: PinState): boolean => {
    const row = pinnable.get(path);
    if (row === undefined) return false;
    if (state === "lock")
      return currentOn[path] !== undefined || pinStateOf(pins.get(path)) === "lock";
    if (state === "empty") return !row.slot.required;
    return true;
  };

  const apply = (path: string, state: PinState) => {
    setConfirmingPath(null);
    dispatch({
      type: "SET_PIN",
      slotPath: path,
      pin: state === "lock" ? { itemId: pins.get(path) ?? currentOn[path]! } : state,
    });
  };

  const setPin = (path: string, state: PinState) => {
    if (!canPin(path, state)) return;
    if (state === pinStateOf(pins.get(path))) return;
    if (state === "empty" && pinsBelow(path).length > 0) setConfirmingPath(path);
    else apply(path, state);
  };

  const runWith = (next: ConstraintsState) =>
    optimizer.run(
      toOptimizerInput(next, {
        weapon,
        weaponItem,
        slotTree,
        parts,
        gate,
        presets,
        pricesReady,
      }),
    );

  return {
    tree: slotTree,
    constraints,
    dispatch,
    optimizer,
    proposed,
    failure,
    rows,
    changes,
    ticked,
    toggleTick: (path) => {
      if (!changes.has(path)) return;
      setTicked((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
    },
    weaponChange,
    tickedBuild,
    currentOn,
    proposedOn,
    nameOf,
    setPin,
    canPin,
    isPinnable: (path) => pinnable.has(path),
    confirming:
      confirmingPath === null
        ? null
        : { path: confirmingPath, below: pinsBelow(confirmingPath).length },
    confirmEmpty: () => {
      if (confirmingPath !== null) apply(confirmingPath, "empty");
    },
    cancelEmpty: () => setConfirmingPath(null),
    run: () => runWith(constraints),
    changeAndRun: (action) => {
      dispatch(action);
      runWith(constraintsReducer(constraints, action));
    },
  };
}
