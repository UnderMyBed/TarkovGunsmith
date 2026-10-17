import {
  resolveBuild,
  visibleSlots,
  type BuildConflict,
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

const conflictKey = (c: BuildConflict) =>
  [c.kind, c.a.path, c.a.itemId, c.b.path, c.b.itemId, c.slotId ?? ""].join("|");

const atOrBelow = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

/** A diff, and how to read any tick set against it. */
interface Selection extends Diff {
  /** The changed paths below `path`, in tree order. */
  readonly below: (path: string) => string[];
  /** Apply's build for `ticked`, what is on the weapon, and its conflicts that are new. */
  readonly evaluate: (ticked: ReadonlySet<string>) => Evaluated;
}

interface Evaluated {
  readonly build: BuildV6;
  readonly on: Readonly<Record<string, string>>;
  /**
   * The build's conflicts that neither the current build nor the proposal has. One the current
   * build has stays when nothing is ticked, so it cannot count against a tick; one the proposal
   * has is the solver's.
   */
  readonly fresh: readonly BuildConflict[];
}

function selectionOf(
  current: BuildV6,
  proposed: BuildV6,
  tree: WeaponTree,
  parts: ReadonlyMap<string, ConflictFields>,
): Selection {
  const diff = diffOf(current, proposed, tree, parts);
  const known = new Set(
    [current, proposed].flatMap((b) =>
      resolveBuild(tree, b.attachments, parts).conflicts.map(conflictKey),
    ),
  );
  const changed = [...diff.changes.keys()];
  return {
    ...diff,
    below: (path) => changed.filter((c) => c.startsWith(`${path}/`)),
    evaluate: (ticked) => {
      const build = buildFromSelection(current, proposed, ticked, tree, parts);
      const resolved = resolveBuild(tree, build.attachments, parts);
      return {
        build,
        on: resolved.attachments,
        fresh: resolved.conflicts.filter((c) => !known.has(conflictKey(c))),
      };
    },
  };
}

/**
 * `ticked` with the change at `path` ticked, as a click on a row that does not land ticks it:
 * with every change above it that it needs, and every change below each one it ticks.
 */
function withTicked(
  sel: Selection,
  ticked: ReadonlySet<string>,
  on: Readonly<Record<string, string>>,
  path: string,
): Set<string> {
  const lands = (p: string) => on[p] === sel.proposedOn[p];
  const next = new Set(ticked);
  for (const p of [path, ...ancestors(path).filter((a) => sel.changes.has(a) && !lands(a))]) {
    next.add(p);
    for (const c of sel.below(p)) next.add(c);
  }
  return next;
}

/** `ticked` without the change at `path` and every change below it. */
function withoutTicked(sel: Selection, ticked: ReadonlySet<string>, path: string): Set<string> {
  const next = new Set(ticked);
  next.delete(path);
  for (const c of sel.below(path)) next.delete(c);
  return next;
}

/** The changes at `path` and above it, nearest first. */
const changesAtOrAbove = (sel: Selection, path: string) =>
  [path, ...ancestors(path)].filter((p) => sel.changes.has(p));

/** A part's name, read from the slot that holds it on `on`. */
function nameOn(
  tree: WeaponTree,
  on: Readonly<Record<string, string>>,
  side: BuildConflict["a"],
): string {
  const slot = visibleSlots(tree, on).find((s) => s.path === side.path);
  return slot?.allowedItems.find((i) => i.id === side.itemId)?.name ?? side.itemId;
}

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
 *   off with the old parent part), so it cannot be unticked either;
 * - a row whose toggle moves other rows to keep a conflict off the build ({@link toggleChange})
 *   says why, when nothing above does: a change that does not land names the part it clashes
 *   with ("conflicts with M4A1 front sight with gas block"), and a landed change names the
 *   change that needs its old part gone ("makes room for the new Handguard").
 */
export function appliedSelection(
  current: BuildV6,
  proposed: BuildV6,
  ticked: ReadonlySet<string>,
  tree: WeaponTree,
  parts: ReadonlyMap<string, ConflictFields>,
): AppliedSelection {
  const sel = selectionOf(current, proposed, tree, parts);
  const { currentOn, proposedOn, changes, currentSlots, proposedSlots } = sel;
  const { build, on } = sel.evaluate(ticked);
  const lands = (path: string) => on[path] === proposedOn[path];
  const changedAncestors = (path: string) => ancestors(path).filter((p) => changes.has(p));
  const label = (path: string) => labelOf(changes.get(path), path);

  // Why toggling this row moves other rows too: the parts it would bring clash with a part the
  // build keeps, or unticking it brings back a part that clashes with one the build has.
  const conflictNote = (path: string, landed: boolean): string | null => {
    if (!landed) {
      const added = [path, ...changedAncestors(path).filter((p) => !lands(p))];
      const inside = (p: string) => added.some((a) => atOrBelow(p, a));
      const t = sel.evaluate(withTicked(sel, ticked, on, path));
      for (const c of t.fresh) {
        const kept = inside(c.a.path) ? c.b : inside(c.b.path) ? c.a : null;
        if (kept !== null && !inside(kept.path))
          return `conflicts with ${nameOn(tree, t.on, kept)}`;
      }
      return null;
    }
    const u = sel.evaluate(withoutTicked(sel, ticked, path));
    for (const c of u.fresh) {
      for (const side of [c.a, c.b]) {
        if (atOrBelow(side.path, path)) continue;
        const owner = changesAtOrAbove(sel, side.path).find(
          (p) => u.on[p] === proposedOn[p] && ticked.has(p),
        );
        if (owner !== undefined) return `makes room for the new ${label(owner)}`;
      }
    }
    return null;
  };

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
    if (state.note === null && !state.disabled) {
      state = { ...state, note: conflictNote(path, landed) };
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
 * Then no tick may leave the build with a conflict it did not have (`resolveBuild`'s, the same
 * the Builder flags). Ticking keeps ticking: for each new conflict, the change nearest above
 * either part that does not land and is not ticked, with what it needs and brings, until
 * none is left. Unticking keeps unticking: for each new conflict, the ticked change nearest
 * above a part the proposal brought, until none is left. A change the new parent part requires
 * goes only with that parent, so the parent is unticked in its place. Each step only adds (or
 * only removes), so chains and cycles settle: a barrel and a handguard that each clash with the
 * other's old part are ticked and unticked together.
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
  const sel = selectionOf(current, proposed, tree, parts);
  const { on } = sel.evaluate(ticked);
  return row.landed ? untickSettled(sel, ticked, path) : tickSettled(sel, ticked, on, path);
}

// Both settle one new conflict per pass and then look again, so a change is ticked (or
// unticked) only while a conflict still calls for it.

function tickSettled(
  sel: Selection,
  ticked: ReadonlySet<string>,
  on: Readonly<Record<string, string>>,
  path: string,
): Set<string> {
  let next = withTicked(sel, ticked, on, path);
  for (;;) {
    const now = sel.evaluate(next);
    if (now.fresh.length === 0) return next;
    // The change nearest above either part of a new conflict that does not land and is not
    // ticked: ticking it takes that part off.
    const clear = now.fresh
      .flatMap((c) => [c.a, c.b])
      .map((side) =>
        changesAtOrAbove(sel, side.path).find(
          (p) => now.on[p] !== sel.proposedOn[p] && !next.has(p),
        ),
      )
      .find((p) => p !== undefined);
    if (clear === undefined) {
      throw new Error(`Ticking ${path} leaves a conflict no other change clears.`);
    }
    next = withTicked(sel, next, now.on, clear);
  }
}

function untickSettled(sel: Selection, ticked: ReadonlySet<string>, path: string): Set<string> {
  let next = withoutTicked(sel, ticked, path);
  for (;;) {
    const now = sel.evaluate(next);
    if (now.fresh.length === 0) return next;
    // The ticked change nearest above a part the proposal brought to a new conflict.
    let drop = now.fresh
      .flatMap((c) => [c.a, c.b])
      .map((side) =>
        changesAtOrAbove(sel, side.path).find(
          (p) => now.on[p] === sel.proposedOn[p] && next.has(p),
        ),
      )
      .find((p) => p !== undefined);
    if (drop === undefined) {
      throw new Error(`Unticking ${path} leaves a conflict no ticked change clears.`);
    }
    // A change its landed new parent part requires goes with that parent, or the slot is left
    // empty.
    for (let up = parentOf(drop); up !== null; up = parentOf(up)) {
      const required = sel.proposedSlots.get(drop)?.required === true;
      if (!(required && sel.changes.has(up) && now.on[up] === sel.proposedOn[up])) break;
      drop = up;
    }
    next = withoutTicked(sel, next, drop);
  }
}
