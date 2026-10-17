import {
  resolveBuild,
  visibleSlots,
  type BuildV6,
  type ConflictFields,
  type SlotNode,
  type WeaponTree,
} from "@tarkov/data";
import { buildFromSelection } from "./build-from-selection.js";
import { shownSlots } from "./slot-diff.js";

/** How one changed row shows: by what Apply would do, not by the raw tick. */
export interface ChangeState {
  /** Whether the proposal's part (or its emptying) is on the build Apply would make. */
  readonly landed: boolean;
  /** Whether the row cannot be ticked or unticked on its own. */
  readonly disabled: boolean;
  /** Why the row shows as it does when that is not its own tick, or `null`. */
  readonly note: string | null;
}

export interface AppliedSelection {
  /** The current build with the ticked changes applied: what Apply gives. */
  readonly build: BuildV6;
  /** Slot path → how its change shows, for every path the proposal changes. */
  readonly rows: ReadonlyMap<string, ChangeState>;
  /** How many changes land on {@link build}. */
  readonly landed: number;
  /** Whether {@link build} differs from the current build at all. */
  readonly changed: boolean;
}

const parentOf = (path: string): string | null => {
  const cut = path.lastIndexOf("/");
  return cut < 0 ? null : path.slice(0, cut);
};

/** Every proper ancestor of `path`, nearest first. */
function ancestors(path: string): string[] {
  const out: string[] = [];
  for (let p = parentOf(path); p !== null; p = parentOf(p)) out.push(p);
  return out;
}

interface Diff {
  readonly currentOn: Readonly<Record<string, string>>;
  readonly proposedOn: Readonly<Record<string, string>>;
  /** The changed paths in tree order, each with its slot (for its label). */
  readonly changes: ReadonlyMap<string, SlotNode>;
  /**
   * Each path's slot under the part the current build, or the proposal, has above it. The same
   * path can be a different slot under each: the new part's may be required where the old
   * part's was not, and takes different parts.
   */
  readonly currentSlots: ReadonlyMap<string, SlotNode>;
  readonly proposedSlots: ReadonlyMap<string, SlotNode>;
}

function diffOf(
  current: BuildV6,
  proposed: BuildV6,
  tree: WeaponTree,
  parts: ReadonlyMap<string, ConflictFields>,
): Diff {
  const currentOn = resolveBuild(tree, current.attachments, parts).attachments;
  const proposedOn = resolveBuild(tree, proposed.attachments, parts).attachments;
  const changes = new Map(
    shownSlots(tree, currentOn, proposedOn)
      .filter((slot) => currentOn[slot.path] !== proposedOn[slot.path])
      .map((slot) => [slot.path, slot]),
  );
  const byPath = (on: Readonly<Record<string, string>>) =>
    new Map(visibleSlots(tree, on).map((slot) => [slot.path, slot]));
  return {
    currentOn,
    proposedOn,
    changes,
    currentSlots: byPath(currentOn),
    proposedSlots: byPath(proposedOn),
  };
}

const labelOf = (slot: SlotNode | undefined, path: string) => slot?.label || slot?.nameId || path;

/**
 * What a tick set does to the build, row by row. A change shows ticked only when it lands on
 * the build Apply would make (`buildFromSelection`), so the tree never shows a change Apply
 * would drop:
 * - a change under an unticked change of its parent part does not land: it shows unticked,
 *   with the part it needs named ("needs the new Barrel");
 * - a change to a slot the new parent part requires must land with that part, or the build
 *   would have an empty required slot: it cannot be unticked alone. "Required" is the new
 *   part's slot's, not the old part's at the same path;
 * - a change unticked under a new parent part that does not take the old part leaves the slot
 *   empty, and says so;
 * - a removal under a landed new parent part lands whatever its own tick (the old part comes
 *   off with the old parent part), so it cannot be unticked either.
 */
export function appliedSelection(
  current: BuildV6,
  proposed: BuildV6,
  ticked: ReadonlySet<string>,
  tree: WeaponTree,
  parts: ReadonlyMap<string, ConflictFields>,
): AppliedSelection {
  const { currentOn, proposedOn, changes, currentSlots, proposedSlots } = diffOf(
    current,
    proposed,
    tree,
    parts,
  );
  const build = buildFromSelection(current, proposed, ticked, tree, parts);
  const on = resolveBuild(tree, build.attachments, parts).attachments;
  const lands = (path: string) => on[path] === proposedOn[path];
  const changedAncestors = (path: string) => ancestors(path).filter((p) => changes.has(p));
  const label = (path: string) => labelOf(changes.get(path), path);

  const rows = new Map<string, ChangeState>();
  for (const path of changes.keys()) {
    const landed = lands(path);
    const parent = parentOf(path);
    const parentLanded = parent !== null && changes.has(parent) && lands(parent);
    let state: ChangeState = { landed, disabled: false, note: null };
    if (!landed) {
      const blocker = changedAncestors(path).find((p) => !lands(p));
      const old = currentOn[path];
      if (blocker !== undefined) {
        state = { ...state, note: `needs the new ${label(blocker)}` };
      } else if (parentLanded && old !== undefined && on[path] !== old) {
        // Unticked under the new part: the old part was the old parent's, so the slot is left
        // empty (`buildFromSelection`), whether or not the new part's slot would take it.
        const oldName = currentSlots.get(path)?.allowedItems.find((i) => i.id === old)?.name ?? old;
        const fits = proposedSlots.get(path)?.allowedItems.some((i) => i.id === old) === true;
        state = {
          ...state,
          note: fits
            ? `left empty: ${oldName} stays with the old ${label(parent)}`
            : `left empty: ${oldName} doesn't fit the new ${label(parent)}`,
        };
      }
    } else if (parentLanded && proposedOn[path] === undefined) {
      // A removal under the new part: the old part belonged to the old one, so it comes off
      // with it whatever this row's tick (`buildFromSelection`).
      state = { landed, disabled: true, note: `comes off with the old ${label(parent)}` };
    } else if (parentLanded && proposedSlots.get(path)?.required === true) {
      // Required under the new part, which is the one on the build.
      state = { landed, disabled: true, note: `required by the new ${label(parent)}` };
    } else if (!ticked.has(path)) {
      const owner = changedAncestors(path).find(lands);
      state = {
        landed,
        disabled: true,
        note: owner === undefined ? null : `goes with the new ${label(owner)}`,
      };
    }
    rows.set(path, state);
  }

  const paths = new Set([...Object.keys(currentOn), ...Object.keys(on)]);
  return {
    build,
    rows,
    landed: [...rows.values()].filter((r) => r.landed).length,
    changed: [...paths].some((p) => currentOn[p] !== on[p]),
  };
}

/**
 * The tick set after the user toggles the change at `path`, by how the row shows
 * ({@link appliedSelection}):
 * - a landed change is unticked, and every change below it with it;
 * - a change that does not land is ticked, with every change above it that it needs, and
 *   every change below each change it ticks: a new part comes with what the proposal fits to it.
 *
 * A row that cannot change on its own leaves the set as it is.
 */
export function toggleChange(
  path: string,
  current: BuildV6,
  proposed: BuildV6,
  ticked: ReadonlySet<string>,
  tree: WeaponTree,
  parts: ReadonlyMap<string, ConflictFields>,
): ReadonlySet<string> {
  const view = appliedSelection(current, proposed, ticked, tree, parts);
  const row = view.rows.get(path);
  if (row === undefined || row.disabled) return ticked;
  const { changes } = diffOf(current, proposed, tree, parts);
  const below = (p: string) => [...changes.keys()].filter((c) => c.startsWith(`${p}/`));
  const next = new Set(ticked);
  if (row.landed) {
    next.delete(path);
    for (const p of below(path)) next.delete(p);
    return next;
  }
  const added = [
    path,
    ...ancestors(path).filter((p) => changes.has(p) && !view.rows.get(p)!.landed),
  ];
  for (const p of added) {
    next.add(p);
    for (const c of below(p)) next.add(c);
  }
  return next;
}
