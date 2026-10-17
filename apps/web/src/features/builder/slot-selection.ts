import { useId, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { expandSlots, type SlotNode, type WeaponTree } from "@tarkov/data";

/** One row of the slot tree: a slot the build can currently reach, at its depth. */
export interface VisibleSlot {
  readonly slot: SlotNode;
  /** 1 for the weapon's own slots, one more for each part above. */
  readonly level: number;
  /** The path of the slot whose fitted part owns this one; `null` on the weapon's own slots. */
  readonly parentPath: string | null;
  /** Whether a part is fitted here that has slots of its own, shown as the rows after it. */
  readonly hasChildren: boolean;
  /** 1-based position among the slots of the same owner, and how many there are. */
  readonly posInSet: number;
  readonly setSize: number;
}

/**
 * Every slot the build reaches, depth first, in the order the tree shows them: each weapon slot,
 * then the slots of the part fitted in it, at any depth. A part fitted beneath itself is not
 * expanded again.
 */
export function flattenVisibleSlots(
  tree: WeaponTree,
  attachments: Readonly<Record<string, string>>,
): VisibleSlot[] {
  const rows: VisibleSlot[] = [];
  const walk = (
    slots: readonly SlotNode[],
    level: number,
    parentPath: string | null,
    ancestors: ReadonlySet<string>,
  ) => {
    slots.forEach((slot, i) => {
      const fittedId = attachments[slot.path];
      const fitted = fittedId ? slot.allowedItems.find((item) => item.id === fittedId) : undefined;
      const children =
        fitted && !ancestors.has(fitted.id) ? expandSlots(tree.graph, fitted.id, slot.path) : [];
      rows.push({
        slot,
        level,
        parentPath,
        hasChildren: children.length > 0,
        posInSet: i + 1,
        setSize: slots.length,
      });
      if (fitted && children.length > 0) {
        walk(children, level + 1, slot.path, new Set([...ancestors, fitted.id]));
      }
    });
  };
  walk(tree.slots, 1, null, new Set());
  return rows;
}

/**
 * The row to show selected: the one asked for while it is still on the tree; otherwise its
 * nearest ancestor still there (its parent was emptied or swapped); otherwise the first slot.
 */
export function resolveSelection(
  rows: readonly VisibleSlot[],
  requested: string | null,
): VisibleSlot | null {
  const byPath = new Map(rows.map((row) => [row.slot.path, row]));
  if (requested !== null) {
    const segments = requested.split("/");
    for (let n = segments.length; n >= 1; n--) {
      const row = byPath.get(segments.slice(0, n).join("/"));
      if (row) return row;
    }
  }
  return rows[0] ?? null;
}

export interface SlotSelection {
  /** The tree's rows, from {@link flattenVisibleSlots}. */
  readonly rows: readonly VisibleSlot[];
  /** The slot the inspector shows; `null` only when the weapon has no slots. */
  readonly selected: VisibleSlot | null;
  readonly select: (path: string) => void;
  /** Select `path` and move focus into the inspector, as Enter on a tree row does. */
  readonly activate: (path: string) => void;
  /** Put focus back on the selected tree row, as Escape in the inspector does. */
  readonly focusTreeRow: () => void;
  /** The `id` the tree's element takes, which the focus moves above find it by. */
  readonly treeId: string;
  /** The `id` the inspector's element takes. */
  readonly inspectorId: string;
}

/**
 * Which slot the tree has selected and the inspector shows. The path asked for is kept as
 * state; the slot shown is derived from it on every render ({@link resolveSelection}), so a
 * fit keeps the selection, an emptied parent falls back to the nearest slot still there, and a
 * new weapon starts on its first slot — the request is remembered per weapon.
 */
export function useSlotSelection(
  tree: WeaponTree | undefined,
  attachments: Readonly<Record<string, string>>,
): SlotSelection {
  const [requested, setRequested] = useState<{ weaponId: string; path: string } | null>(null);
  const rows = useMemo(
    () => (tree ? flattenVisibleSlots(tree, attachments) : []),
    [tree, attachments],
  );
  const current =
    requested !== null && requested.weaponId === tree?.weaponId ? requested.path : null;
  const selected = resolveSelection(rows, current);
  // A fallback becomes the request: the slot asked for went away (its parent was emptied or
  // swapped), and the inspector now shows another one. Fitting a part there must not jump the
  // selection back to the old path because the new part happens to have a slot of that name.
  if (current !== null && selected !== null && selected.slot.path !== current) {
    setRequested({ weaponId: tree?.weaponId ?? "", path: selected.slot.path });
  }
  const treeId = useId();
  const inspectorId = useId();
  const weaponId = tree?.weaponId ?? "";

  const select = (path: string) => setRequested({ weaponId, path });
  return {
    rows,
    selected,
    select,
    activate: (path) => {
      // Rendered now, so the inspector focused below is the one for `path`.
      flushSync(() => select(path));
      const inspector = document.getElementById(inspectorId);
      const target =
        inspector?.querySelector<HTMLElement>('input[type="search"]') ??
        inspector?.querySelector<HTMLElement>("button:not(:disabled)") ??
        inspector;
      target?.focus();
    },
    focusTreeRow: () => {
      const path = selected?.slot.path;
      if (path === undefined) return;
      document
        .getElementById(treeId)
        ?.querySelector<HTMLElement>(`[role="treeitem"][data-slot-path="${CSS.escape(path)}"]`)
        ?.focus();
    },
    treeId,
    inspectorId,
  };
}
