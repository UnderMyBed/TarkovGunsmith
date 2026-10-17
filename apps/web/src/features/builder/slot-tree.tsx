import { useState, type KeyboardEvent } from "react";
import type { ItemAvailability, SlotDiffMap, SlotDiffStatus } from "@tarkov/data";
import { Pill, cn, focusRing } from "@tarkov/ui";
import { useQuestName, type QuestName } from "./quest-names.js";
import type { SlotSelection, VisibleSlot } from "./slot-selection.js";
import { availabilityLabel } from "./shown-availability.js";
import { traderLabel } from "./where-to-get.js";

// ---------- Types ----------

interface SlotTreeBaseProps {
  /** The rows, and which one is selected: `useSlotSelection`. */
  selection: SlotSelection;
  attachments: Readonly<Record<string, string>>;
  getAvailability?: (itemId: string) => ItemAvailability | null;
  /**
   * Why the part already fitted at `path` clashes with another part on the weapon, or `null`.
   * A saved build, a preset or an optimizer result can hold such a pair; it is shown, not removed.
   */
  getFittedConflict?: (path: string) => string | null;
  /** The tree's accessible name. */
  label?: string;
}

/** Which Compare side a tree shows: `slotDiff`'s left is build A, its right build B. */
export type SlotDiffSide = "left" | "right";

/**
 * Compare's per-slot statuses, and the side this tree shows. A row that differs from the other
 * build is marked; a one-side status reads differently on the filled side and the empty one, so
 * a diff never comes without its side.
 */
export type SlotTreeDiffProps =
  { diff?: undefined; side?: undefined } | { diff: SlotDiffMap | undefined; side: SlotDiffSide };

export type SlotTreeProps = SlotTreeBaseProps & SlotTreeDiffProps;

/**
 * The accessible note for a row's diff status, or `null` when it matches the other build.
 * `left-only` means build A has a part there and build B does not (`slotDiff`); the row name
 * already says "empty", so the empty side only says where the part is.
 */
function diffNote(status: SlotDiffStatus | undefined, side: SlotDiffSide): string | null {
  if (status === undefined || status === "equal") return null;
  if (status === "differs") return "differs from the other build";
  const filledHere = status === (side === "left" ? "left-only" : "right-only");
  return filledHere ? "filled only in this build" : "filled in the other build";
}

// ---------- SlotTree ----------

/**
 * The build's slots as a WAI-ARIA tree, always expanded to the fitted parts: one row per slot
 * with its label (required marked), the part fitted there or "empty", and that part's
 * availability. Activating a row selects the slot for the inspector beside it.
 *
 * The rows are flat `treeitem`s whose hierarchy is carried by `aria-level`, `aria-posinset`
 * and `aria-setsize`. Every row is rendered, so arrow-key traversal never lands on a hidden
 * one. One row is in the tab order at a time (roving tabindex):
 * - Up / Down / Home / End move between rows;
 * - Right moves to a row's first child, Left to its parent;
 * - Enter or Space selects the row and moves focus into the inspector.
 */
export function SlotTree({
  selection,
  attachments,
  getAvailability,
  diff,
  side,
  getFittedConflict,
  label = "Slots",
}: SlotTreeProps) {
  const { rows, selected } = selection;
  const keys = useTreeKeys(rows, selection.treeId, selected?.slot.path ?? null);
  if (rows.length === 0) {
    return (
      <p className="text-xs text-[var(--color-muted-foreground)]">This weapon has no mod slots.</p>
    );
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>, index: number) => {
    if (keys.navigate(e, index)) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    selection.activate(rows[index]!.slot.path);
    e.preventDefault();
  };

  return (
    <div id={selection.treeId} role="tree" aria-label={label} className="flex flex-col">
      {rows.map((row, index) => (
        <SlotRow
          key={row.slot.path}
          row={row}
          selected={row.slot.path === selected?.slot.path}
          tabbable={row.slot.path === keys.tabStop}
          attachments={attachments}
          getAvailability={getAvailability}
          diffNote={side === undefined ? null : diffNote(diff?.get(row.slot.path), side)}
          diffStatus={diff?.get(row.slot.path)}
          getFittedConflict={getFittedConflict}
          onSelect={() => selection.select(row.slot.path)}
          onFocus={() => keys.setFocusedPath(row.slot.path)}
          onKeyDown={(e) => onKeyDown(e, index)}
        />
      ))}
    </div>
  );
}

// ---------- useTreeKeys ----------

/** What the roving focus needs to know of a row: where it sits in the hierarchy. */
export interface TreeRowShape {
  readonly slot: { readonly path: string };
  readonly parentPath: string | null;
  readonly hasChildren: boolean;
}

/** Focus the row at `path` in the tree with id `treeId`. */
export function focusTreeRow(treeId: string, path: string): void {
  document
    .getElementById(treeId)
    ?.querySelector<HTMLElement>(`[role="treeitem"][data-slot-path="${CSS.escape(path)}"]`)
    ?.focus();
}

/**
 * The roving tab stop and arrow keys of a flat WAI-ARIA tree, shared by every tree of slot rows:
 * one row in the tab order at a time — the last one focused while it is still on the tree,
 * otherwise `preferred`, otherwise the first.
 * - Up / Down / Home / End move between rows;
 * - Right moves to a row's first child, Left to its parent.
 *
 * `navigate` handles those keys (and prevents their default) and returns whether it did, so a
 * tree adds its own keys after it.
 */
export function useTreeKeys(
  rows: readonly TreeRowShape[],
  treeId: string,
  preferred: string | null,
): {
  readonly tabStop: string | null;
  readonly setFocusedPath: (path: string) => void;
  readonly navigate: (e: KeyboardEvent<HTMLElement>, index: number) => boolean;
} {
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const tabStop =
    (focusedPath !== null && rows.some((r) => r.slot.path === focusedPath) ? focusedPath : null) ??
    (preferred !== null && rows.some((r) => r.slot.path === preferred) ? preferred : null) ??
    rows[0]?.slot.path ??
    null;

  const focusRow = (index: number) => {
    const row = rows[index];
    if (row) focusTreeRow(treeId, row.slot.path);
  };

  const navigate = (e: KeyboardEvent<HTMLElement>, index: number): boolean => {
    const row = rows[index]!;
    switch (e.key) {
      case "ArrowDown":
        focusRow(Math.min(index + 1, rows.length - 1));
        break;
      case "ArrowUp":
        focusRow(Math.max(index - 1, 0));
        break;
      case "Home":
        focusRow(0);
        break;
      case "End":
        focusRow(rows.length - 1);
        break;
      case "ArrowRight":
        if (row.hasChildren) focusRow(index + 1);
        break;
      case "ArrowLeft":
        if (row.parentPath !== null) {
          focusRow(rows.findIndex((r) => r.slot.path === row.parentPath));
        }
        break;
      default:
        return false;
    }
    e.preventDefault();
    return true;
  };

  return { tabStop, setFocusedPath, navigate };
}

// ---------- SlotRow ----------

function SlotRow({
  row,
  selected,
  tabbable,
  attachments,
  getAvailability,
  diffStatus,
  diffNote: note,
  getFittedConflict,
  onSelect,
  onFocus,
  onKeyDown,
}: {
  row: VisibleSlot;
  selected: boolean;
  tabbable: boolean;
  attachments: Readonly<Record<string, string>>;
  getAvailability?: ((itemId: string) => ItemAvailability | null) | undefined;
  diffStatus: SlotDiffStatus | undefined;
  diffNote: string | null;
  getFittedConflict?: ((path: string) => string | null) | undefined;
  onSelect: () => void;
  onFocus: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
}) {
  const { slot } = row;
  const fittedId = attachments[slot.path] ?? null;
  const fitted = fittedId ? slot.allowedItems.find((i) => i.id === fittedId) : undefined;
  const availability = fitted && getAvailability ? getAvailability(fitted.id) : null;
  const fittedConflict = fitted ? (getFittedConflict?.(slot.path) ?? null) : null;
  // Spelled out, because the cells' text would otherwise run together ("Muzzleempty").
  const name = [
    `${slot.label}${slot.required ? ", required" : ""}: ${fitted ? fitted.name : "empty"}`,
    availability ? availabilityLabel(availability) : null,
    fittedConflict,
    note,
  ]
    .filter((part): part is string => part !== null)
    .join(", ");

  return (
    <div
      role="treeitem"
      aria-label={name}
      aria-level={row.level}
      aria-posinset={row.posInSet}
      aria-setsize={row.setSize}
      aria-selected={selected}
      aria-expanded={row.hasChildren ? true : undefined}
      tabIndex={tabbable ? 0 : -1}
      data-slot-path={slot.path}
      data-diff={diffStatus}
      onClick={onSelect}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      className={cn(
        "grid min-h-11 cursor-pointer grid-cols-[minmax(84px,112px)_minmax(0,1fr)_auto] items-center gap-x-2.5 border-l-2 border-transparent py-1.5 pr-4 transition-colors sm:gap-x-3",
        "data-[diff=differs]:border-[var(--color-primary)] data-[diff=left-only]:border-[var(--color-primary)] data-[diff=right-only]:border-[var(--color-primary)]",
        selected ? "bg-[var(--color-selected)]" : "hover:bg-[var(--color-muted)]",
        focusRing,
        "focus-visible:ring-offset-0 focus-visible:ring-inset",
      )}
      style={{ paddingLeft: `${14 + (row.level - 1) * 18}px` }}
    >
      <span
        title={slot.label}
        className={cn(
          "truncate text-12",
          selected
            ? "font-bold text-[var(--color-primary-text)]"
            : "font-medium text-[var(--color-muted-foreground)]",
        )}
      >
        <span data-slot-label>{slot.label}</span>
        {slot.required && <span aria-hidden> *</span>}
      </span>
      <span className="min-w-0 text-13 leading-snug">
        {fitted ? (
          <>
            <span data-fitted-part className="text-[var(--color-foreground)]">
              {fitted.name}
            </span>
            {fittedConflict !== null && (
              <span className="block text-11 text-[var(--color-destructive)]">
                {fittedConflict}
              </span>
            )}
          </>
        ) : (
          <span className="text-[var(--color-faint)]">
            empty
            {slot.required && (
              <span className="ml-2 text-11 text-[var(--color-destructive)]">Required</span>
            )}
          </span>
        )}
      </span>
      <span className="justify-self-end">
        {fitted && <AvailabilityPill availability={availability} />}
      </span>
    </div>
  );
}

// ---------- AvailabilityPill ----------

export function AvailabilityPill({ availability }: { availability: ItemAvailability | null }) {
  const questName = useQuestName();
  if (!availability) return null;
  if (availability.available) {
    const assumed =
      availability.kind === "flea" || availability.assumedQuest === null
        ? null
        : (questName(availability.assumedQuest) ?? "a quest");
    return (
      <Pill tone="default" title={assumed === null ? undefined : `Assumes ${assumed} is complete`}>
        {availabilityLabel(availability)}
      </Pill>
    );
  }
  return <Pill tone="marginal">{availabilityLabel(availability)}</Pill>;
}

export function formatRequirement(a: ItemAvailability, questName: QuestName): string {
  if (a.available) return "";
  switch (a.reason) {
    case "trader-ll-required":
      return `${traderLabel(a.traderNormalizedName)} LL${a.minLevel}${a.payment === "barter" ? " barter" : ""}`;
    case "quest-required": {
      const name = questName(a.questNormalizedName);
      return name === undefined ? "Quest" : `Quest: ${name}`;
    }
    case "untracked-trader":
      return `${traderLabel(a.traderNormalizedName)} LL${a.minLevel} (not in profile)`;
    case "flea-level-required":
      return `Flea level ${a.minPlayerLevel}`;
    case "flea-unlisted":
      return "Not listed on flea";
    case "flea-locked":
      return "Flea only";
    case "no-sources":
      return "No sources";
  }
}
