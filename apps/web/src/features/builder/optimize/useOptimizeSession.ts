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
import { appliedSelection, toggleChange, type ChangeState } from "./applied-selection.js";
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

/**
 * How the ticked build buys the weapon, when not the way the current one does, with the cost
 * left over after the changes that land on it (`weaponChangeOf`). Measured against the ticked
 * build, never the full proposal: a change left out is not paid for.
 */
export function tickedWeaponChange(input: {
  tree: WeaponTree;
  parts: ReadonlyMap<string, AttachablePart>;
  gate: PriceGate;
  presets: readonly PricedPreset[];
  weaponItem: WeaponListItem;
  current: Readonly<Record<string, string>>;
  currentPrice: BuildPrice | null;
  ticked: Readonly<Record<string, string>>;
  tickedPrice: BuildPrice | null;
}): WeaponChange | null {
  const { tree, parts, gate, presets, weaponItem, currentPrice, tickedPrice } = input;
  const rows = slotDiff(input.current, input.ticked, tree, parts, gate, {
    current: coversOf(currentPrice, presets),
    proposed: coversOf(tickedPrice, presets),
  });
  return weaponChangeOf(currentPrice, tickedPrice, rows, (id) =>
    id === null ? weaponItem.shortName : (presets.find((p) => p.id === id)?.shortName ?? id),
  );
}

const NO_STATES: ReadonlyMap<string, ChangeState> = new Map();

/**
 * Rows with some left out (those below a slot kept empty): each row's place among its
 * siblings and whether it still has rows below it, worked out again from the rows left.
 */
export function reindex(rows: readonly VisibleSlot[]): VisibleSlot[] {
  const size = new Map<string | null, number>();
  for (const row of rows) size.set(row.parentPath, (size.get(row.parentPath) ?? 0) + 1);
  const parents = new Set(rows.map((row) => row.parentPath));
  const at = new Map<string | null, number>();
  return rows.map((row) => {
    const pos = (at.get(row.parentPath) ?? 0) + 1;
    at.set(row.parentPath, pos);
    return {
      ...row,
      posInSet: pos,
      setSize: size.get(row.parentPath)!,
      hasChildren: parents.has(row.slot.path),
    };
  });
}

/** What a slot is pinned to in the tree: the solver's to choose, the build's part, or nothing. */
export type PinState = "free" | "lock" | "empty";

export function pinStateOf(pin: string | null | undefined): PinState {
  return pin === undefined ? "free" : pin === null ? "empty" : "lock";
}

/**
 * A key that changes only when the gate gates differently. The profile is rebuilt on every
 * edit and sync, so its key order may change without its meaning changing; and its only array,
 * `completedQuests`, is a set. Object keys are sorted, and so is every array of strings.
 */
export function gateKeyOf(gate: PriceGate): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      const items = value.map(canonical);
      return items.every((v) => typeof v === "string") ? [...items].sort() : items;
    }
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, v]) => [k, canonical(v)]),
      );
    }
    return value;
  };
  return JSON.stringify(canonical(gate));
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
  /**
   * Slot path → how its change shows: ticked only when it lands on the build Apply makes
   * ({@link appliedSelection}). Empty without a proposal.
   */
  readonly changeStates: ReadonlyMap<string, ChangeState>;
  /** How many changes land on the build Apply makes. */
  readonly landed: number;
  /** Whether Apply would change the build at all. */
  readonly netChange: boolean;
  /** Tick or untick a change, with the changes it depends on or that depend on it. */
  readonly toggleTick: (path: string) => void;
  /**
   * Why an earlier proposal or run was dropped: the build or the progression changed under it,
   * so it was solved for something that no longer holds. `null` once a new run starts.
   */
  readonly staleNote: string | null;
  /** The weapon bought another way by the ticked build, when it is. */
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
 * workbench mounts it keyed by the weapon.
 *
 * A proposal holds only for the build and the progression it was solved for. When either
 * changes under it (prices arriving re-seed a new build's preset; the user switches mode or
 * edits the profile), the run is dropped — back to idle, with {@link OptimizeSession.staleNote}
 * saying why — and pins on slots the build no longer reaches, or locks on a part it no longer
 * has, are removed.
 *
 * Every change starts ticked when a result arrives. The ticked build is the one Apply gives,
 * and its stats and price are what the stat strip and the Proposal card show.
 */
export function useOptimizeSession(deps: OptimizeSessionDeps): OptimizeSession {
  const { weapon, weaponItem, slotTree, parts, gate, presets, pricesReady } = deps;
  const { currentBuild, currentPrice } = deps;
  const [constraints, dispatch] = useReducer(constraintsReducer, initialConstraintsState);
  const raw = useOptimizer();
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [confirmingPath, setConfirmingPath] = useState<string | null>(null);
  const [staleNote, setStaleNote] = useState<string | null>(null);

  const byId = useMemo(() => partsById(parts), [parts]);
  const nameOf = (id: string) => byId.get(id)?.name ?? id;

  const currentOn = useMemo(
    () => resolveBuild(slotTree, currentBuild.attachments, byId).attachments,
    [slotTree, currentBuild.attachments, byId],
  );
  // What a run is solved for. A run started for other keys is not shown: see `live` below.
  const buildKey = JSON.stringify(Object.entries(currentOn).sort(([a], [b]) => (a < b ? -1 : 1)));
  const gateKey = gateKeyOf(gate);
  const [ranFor, setRanFor] = useState<{ buildKey: string; gateKey: string } | null>(null);
  const [seen, setSeen] = useState({ buildKey, gateKey });
  if (seen.buildKey !== buildKey || seen.gateKey !== gateKey) {
    // Adjusted during render, so no frame shows a proposal for the old build or gate.
    setSeen({ buildKey, gateKey });
    setTicked(new Set());
    setConfirmingPath(null);
    if (ranFor !== null && raw.state !== "idle") {
      setStaleNote(
        seen.gateKey !== gateKey
          ? "Progression changed. Run again."
          : "The build changed. Run again.",
      );
    }
    // For good: going back to the old build or gate does not bring the old run back.
    setRanFor(null);
    if (seen.buildKey !== buildKey) {
      const reach = new Set(flattenVisibleSlots(slotTree, currentOn).map((r) => r.slot.path));
      // A lock keeps the build's part: one whose part the build no longer has (another part, or
      // none) would lock in a part the user took off, so it is freed with the rest.
      const gone = [...constraints.pinnedSlots]
        .filter(([path, id]) => !reach.has(path) || (id !== null && id !== currentOn[path]))
        .map(([path]) => path);
      if (gone.length > 0) dispatch({ type: "UNPIN", slotPaths: gone });
    }
  }
  // A run counts only for the build and gate it was solved for. One started for another (the
  // worker may still be finishing it) shows as idle, and its result is never applied.
  const live = ranFor !== null && ranFor.buildKey === buildKey && ranFor.gateKey === gateKey;
  const optimizer: UseOptimizerReturn = live
    ? raw
    : {
        ...raw,
        state: "idle",
        result: undefined,
        objective: undefined,
        pins: undefined,
        progress: undefined,
        error: undefined,
      };

  const result = optimizer.result;
  const proposed = result && result.ok ? result : null;
  const failure = result && !result.ok ? result : null;

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

  const applied = useMemo(
    () =>
      proposed ? appliedSelection(currentBuild, proposed.build, ticked, slotTree, byId) : null,
    [proposed, currentBuild, ticked, slotTree, byId],
  );

  const tickedBuild = useMemo((): TickedBuild | null => {
    if (!applied) return null;
    const { build } = applied;
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
  }, [applied, slotTree, byId, weapon, pricesReady, gate, weaponItem, presets]);

  // How the ticked build buys the weapon, against the changes that land on it: not the full
  // proposal's.
  const weaponChange = useMemo(
    () =>
      tickedBuild &&
      tickedWeaponChange({
        tree: slotTree,
        parts: byId,
        gate,
        presets,
        weaponItem,
        current: currentBuild.attachments,
        currentPrice,
        ticked: tickedBuild.build.attachments,
        tickedPrice: tickedBuild.price,
      }),
    [tickedBuild, slotTree, byId, gate, presets, weaponItem, currentBuild, currentPrice],
  );

  const pins = constraints.pinnedSlots;
  const rows = useMemo(() => {
    const emptied = [...pins].filter(([, id]) => id === null).map(([path]) => path);
    // A slot kept empty has nothing below it. A change below one still shows: it is ticked, and
    // nothing ticked may be out of sight.
    const all = flattenProposalSlots(slotTree, currentOn, proposedOn);
    const shown = all.filter(
      (row) =>
        !emptied.some((parent) => isBelow(row.slot.path, parent)) ||
        [...changes.keys()].some((c) => c === row.slot.path || isBelow(c, row.slot.path)),
    );
    return shown.length === all.length ? all : reindex(shown);
  }, [pins, slotTree, currentOn, proposedOn, changes]);

  // Pins go only on slots the current build reaches: a slot only the proposal has may be gone
  // after the next run. When the build itself changes, pins it no longer reaches are removed
  // (above), so no pin outlives its row.
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

  const runWith = (next: ConstraintsState) => {
    setRanFor({ buildKey, gateKey });
    setStaleNote(null);
    raw.run(
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
  };

  return {
    tree: slotTree,
    constraints,
    dispatch,
    optimizer,
    proposed,
    failure,
    rows,
    changes,
    changeStates: applied?.rows ?? NO_STATES,
    landed: applied?.landed ?? 0,
    netChange: applied?.changed ?? false,
    toggleTick: (path) => {
      if (!proposed) return;
      setTicked((prev) => toggleChange(path, currentBuild, proposed.build, prev, slotTree, byId));
    },
    staleNote,
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
