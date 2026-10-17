import {
  resolveBuild,
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
  /** The changed paths in tree order, each with its slot. */
  readonly changes: ReadonlyMap<string, SlotNode>;
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
  return { currentOn, proposedOn, changes };
}

const labelOf = (slot: SlotNode | undefined, path: string) => slot?.label || slot?.nameId || path;

/**
 * What a tick set does to the build, row by row. A change shows ticked only when it lands on
 * the build Apply would make (`buildFromSelection`), so the tree never shows a change Apply
 * would drop:
 * - a change under an unticked change of its parent part does not land: it shows unticked,
 *   with the part it needs named ("needs the new Barrel");
 * - a change to a required slot under a ticked change of its parent part must land with it,
 *   or the build would have an empty required slot: it cannot be unticked alone;
 * - a change that lands without its own tick (a part the new parent part has no slot for is
 *   gone with it) cannot be unticked either.
 */
export function appliedSelection(
  current: BuildV6,
  proposed: BuildV6,
  ticked: ReadonlySet<string>,
  tree: WeaponTree,
  parts: ReadonlyMap<string, ConflictFields>,
): AppliedSelection {
  const { currentOn, proposedOn, changes } = diffOf(current, proposed, tree, parts);
  const build = buildFromSelection(current, proposed, ticked, tree, parts);
  const on = resolveBuild(tree, build.attachments, parts).attachments;
  const lands = (path: string) => on[path] === proposedOn[path];
  const changedAncestors = (path: string) => ancestors(path).filter((p) => changes.has(p));

  const rows = new Map<string, ChangeState>();
  for (const [path, slot] of changes) {
    const landed = lands(path);
    let state: ChangeState = { landed, disabled: false, note: null };
    if (!landed) {
      const blocker = changedAncestors(path).find((p) => !lands(p));
      if (blocker !== undefined) {
        state = { ...state, note: `needs the new ${labelOf(changes.get(blocker), blocker)}` };
      }
    } else {
      const parent = parentOf(path);
      if (slot.required && parent !== null && changes.has(parent) && lands(parent)) {
        state = {
          landed,
          disabled: true,
          note: `required by the new ${labelOf(changes.get(parent), parent)}`,
        };
      } else if (!ticked.has(path)) {
        const owner = changedAncestors(path).find(lands);
        state = {
          landed,
          disabled: true,
          note:
            owner === undefined ? null : `goes with the new ${labelOf(changes.get(owner), owner)}`,
        };
      }
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
 * - a change that does not land is ticked, with every change above it that it needs;
 * - either way, a ticked change brings the required changes below it.
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
  const next = new Set(ticked);
  if (row.landed) {
    next.delete(path);
    for (const p of changes.keys()) if (p.startsWith(`${path}/`)) next.delete(p);
    return next;
  }
  next.add(path);
  for (const p of ancestors(path)) if (changes.has(p)) next.add(p);
  return withRequired(next, changes);
}

/** `ticked` with every required change whose parent change is ticked, at any depth. */
export function withRequired(
  ticked: ReadonlySet<string>,
  changes: ReadonlyMap<string, SlotNode>,
): Set<string> {
  const next = new Set(ticked);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [p, slot] of changes) {
      const parent = parentOf(p);
      if (!next.has(p) && slot.required && parent !== null && next.has(parent)) {
        next.add(p);
        grew = true;
      }
    }
  }
  return next;
}
