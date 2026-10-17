import { withAttachment } from "../attached-parts.js";
import type { BuildV6, PlayerProfile } from "../build-schema.js";
import { CURRENT_BUILD_VERSION } from "../build-schema.js";
import { conflictsWith, type ConflictFields } from "../conflicts.js";
import { expandSlots, slotAtPath, type WeaponTree } from "../queries/slot-graph.js";
import { resolveBuild } from "./resolve.js";

/** The part of a build its editor changes: the weapon, what is on it, and what is not. */
export interface BuildState {
  readonly weaponId: string;
  /** Slot path → item id. Every entry is on the weapon once the build has been loaded. */
  readonly attachments: Record<string, string>;
  /** Item ids from the saved build that are not on the weapon, oldest first. Never capped here. */
  readonly orphaned: string[];
}

/** The weapon's slot tree and the parts it can hold: what the actions that read slots need. */
export interface BuildContext {
  readonly tree: WeaponTree;
  readonly parts: ReadonlyMap<string, ConflictFields>;
}

export type BuildAction =
  /** A saved build arriving: whatever is not on the weapon moves to `orphaned`. */
  | { readonly type: "load"; readonly build: BuildState }
  /** A new weapon, starting from `seed` (a placed preset, or `{}`). Orphans go with the old one. */
  | {
      readonly type: "changeWeapon";
      readonly weaponId: string;
      readonly seed: Readonly<Record<string, string>>;
    }
  /** Fit `itemId` at `path`, or empty it with `null`. */
  | { readonly type: "attach"; readonly path: string; readonly itemId: string | null }
  /** Replace every attachment with a preset's. */
  | { readonly type: "applyPreset"; readonly attachments: Readonly<Record<string, string>> }
  /** Replace every attachment with the ones accepted from the optimizer. */
  | { readonly type: "acceptOptimized"; readonly attachments: Readonly<Record<string, string>> }
  | { readonly type: "dismissOrphaned" };

/**
 * The one build reducer the Builder and each Compare side use.
 *
 * Every action that sets attachments ends with them resolved against `ctx.tree`: what is on the
 * weapon stays, and anything else is moved to `orphaned`, never dropped. For a saved build that
 * is where a part beneath an empty parent, or one the game data no longer holds, ends up. An
 * edit only ever produces attachments that are on the weapon, so for edits nothing moves.
 *
 * `ctx` is the current weapon's; `changeWeapon` and `dismissOrphaned` do not read it, so it may
 * be `null` while that tree is not available. Any other action without it, or with the tree of
 * another weapon, throws: there is nothing to check the attachments against.
 */
export function applyBuildAction(
  state: BuildState,
  action: BuildAction,
  ctx: BuildContext | null,
): BuildState {
  switch (action.type) {
    case "changeWeapon":
      return { weaponId: action.weaponId, attachments: { ...action.seed }, orphaned: [] };
    case "dismissOrphaned":
      return { ...state, orphaned: [] };
    case "load":
      return settle(action.build, action.build.attachments, need(ctx, action.build.weaponId));
    case "applyPreset":
    case "acceptOptimized":
      return settle(state, action.attachments, need(ctx, state.weaponId));
    case "attach": {
      const c = need(ctx, state.weaponId);
      return settle(state, attach(state.attachments, action.path, action.itemId, c), c);
    }
  }
}

function need(ctx: BuildContext | null, weaponId: string): BuildContext {
  if (ctx === null || ctx.tree.weaponId !== weaponId) {
    throw new Error(`No slot tree for weapon ${weaponId} to apply this build change against`);
  }
  return ctx;
}

/** `attachments` resolved: placed parts kept, every other id appended to `orphaned` once. */
function settle(
  state: BuildState,
  attachments: Readonly<Record<string, string>>,
  ctx: BuildContext,
): BuildState {
  const resolved = resolveBuild(ctx.tree, attachments, ctx.parts);
  const orphaned = [...state.orphaned];
  for (const { itemId } of resolved.orphaned) {
    if (!orphaned.includes(itemId)) orphaned.push(itemId);
  }
  return { weaponId: state.weaponId, attachments: { ...resolved.attachments }, orphaned };
}

/**
 * Fit `itemId` at `path` (or empty it), carrying over what still fits.
 *
 * The old part's subtree comes off with it. Then, parents first, each of its parts goes back
 * where the new part has a slot of the same name that takes it, and only if that clashes with
 * nothing already on the weapon. A part that does not go back is dropped: a same-named slot on
 * another part is another slot, with its own allowed items and conflicts, and keeping a part in
 * it unchecked once hid a clash (#240: a gas block carried under an A2 barrel that a fitted
 * AX-15 4" handguard blocks).
 */
function attach(
  attachments: Readonly<Record<string, string>>,
  path: string,
  itemId: string | null,
  ctx: BuildContext,
): Record<string, string> {
  const slot = slotAtPath(ctx.tree, attachments, path);
  if (slot === null) throw new Error(`No slot at ${path} in this build`);
  if (itemId !== null && !slot.allowedItemIds.has(itemId)) {
    throw new Error(`${slot.label} does not take ${itemId}`);
  }
  const next = withAttachment(attachments, path, itemId);
  if (itemId === null || attachments[path] === itemId) return next;

  const carry = (ownerId: string, ownerPath: string, ancestors: ReadonlySet<string>): void => {
    for (const child of expandSlots(ctx.tree.graph, ownerId, ownerPath)) {
      const oldId = attachments[child.path];
      if (oldId === undefined || !child.allowedItemIds.has(oldId) || ancestors.has(oldId)) continue;
      const build = { tree: ctx.tree, attachments: next, parts: ctx.parts };
      if (conflictsWith(build, { itemId: oldId, path: child.path }).length > 0) continue;
      next[child.path] = oldId;
      carry(oldId, child.path, new Set([...ancestors, oldId]));
    }
  };
  carry(itemId, path, new Set([ctx.tree.weaponId, itemId]));
  return next;
}

/** What a saved or shared build records besides its parts. */
export interface BuildMeta {
  readonly name?: string;
  readonly description?: string;
  /** Embedded when the author chose to share their progression. */
  readonly profile?: PlayerProfile;
  /** Defaults to now. */
  readonly createdAt?: string;
}

/**
 * The one way a build becomes a saved `BuildV6`: share, Compare handoff and the optimizer's
 * current build all go through here. A blank name or description is left out; both are
 * trimmed.
 */
export function toBuildPayload(state: BuildState, meta: BuildMeta = {}): BuildV6 {
  const name = meta.name?.trim() ?? "";
  const description = meta.description?.trim() ?? "";
  return {
    version: CURRENT_BUILD_VERSION,
    weaponId: state.weaponId,
    attachments: { ...state.attachments },
    orphaned: [...state.orphaned],
    createdAt: meta.createdAt ?? new Date().toISOString(),
    ...(name.length > 0 ? { name } : {}),
    ...(description.length > 0 ? { description } : {}),
    ...(meta.profile !== undefined ? { profileSnapshot: meta.profile } : {}),
  };
}
