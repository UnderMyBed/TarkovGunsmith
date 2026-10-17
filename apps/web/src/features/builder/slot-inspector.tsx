import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { AttachablePart, BuilderMode, ItemAvailability, SlotNode } from "@tarkov/data";
import { Button, Input, cn } from "@tarkov/ui";
import { formatRub } from "./build-price.js";
import { signedPercent } from "./details-panel.js";
import { Delta, type Direction } from "./delta.js";
import { useQuestName } from "./quest-names.js";
import { shownAvailability } from "./shown-availability.js";
import { AvailabilityPill, formatRequirement } from "./slot-tree.js";
import { direction, formatDelta } from "./stat-strip.js";
import { priceOf, sellerOf } from "./where-to-get.js";

export type InspectorSort = "ergonomics" | "recoil" | "weight" | "price";

const SORT_LABELS: Record<InspectorSort, string> = {
  ergonomics: "Ergonomics",
  recoil: "Recoil",
  weight: "Weight",
  price: "Price",
};

export interface SlotInspectorProps {
  /** The weapon the slot is on: a search typed for one weapon's slot is not kept for another's. */
  weaponId: string;
  /** The selected slot. */
  slot: SlotNode;
  /** The part fitted in it, by id, or `null` when it is empty. */
  fittedId: string | null;
  /** Stats for each part, by id. A part missing here shows its name with no figures. */
  parts: ReadonlyMap<string, AttachablePart>;
  onAttach: (path: string, itemId: string | null) => void;
  /** Each part's availability under the page's gate, before {@link mode} is applied. */
  getAvailability: (itemId: string) => ItemAvailability | null;
  /** Why `itemId` cannot go at `path` given the rest of the build, or `null` when it can. */
  getConflict?: ((path: string, itemId: string) => string | null) | undefined;
  /**
   * Theorycraft shows no part locked or dimmed for availability (`shownAvailability`).
   * Progression dims what the profile cannot get, and offers "Show all items" to undim it.
   */
  mode: BuilderMode;
  /** Whether live prices are in: only then is sorting by price offered. */
  pricesReady: boolean;
  /** Escape anywhere in the inspector: the owner puts focus back on the slot's tree row. */
  onEscape?: (() => void) | undefined;
  /** The element's `id`: `useSlotSelection`'s `inspectorId`, which Enter in the tree focuses. */
  id?: string | undefined;
  /** Given, a Close button heads the inspector: the phone's bottom sheet (`slot-sheet.tsx`). */
  onClose?: (() => void) | undefined;
  /** Merged over the inspector's own panel classes. */
  className?: string | undefined;
}

interface OptionRow {
  readonly id: string;
  readonly name: string;
  readonly part: AttachablePart | undefined;
  readonly availability: ItemAvailability | null;
  readonly conflict: string | null;
}

function modifiers(part: AttachablePart | undefined) {
  return part !== undefined && part.properties.propertiesType !== "ItemPropertiesAmmo"
    ? part.properties
    : null;
}

/** Stable sort by `key`, ascending; a part with no figure sorts last. */
function sortRows(rows: readonly OptionRow[], key: (row: OptionRow) => number | null): OptionRow[] {
  return rows
    .map((row, i) => ({ row, i, k: key(row) }))
    .sort((a, b) => {
      if (a.k === null || b.k === null) return a.k === b.k ? a.i - b.i : a.k === null ? 1 : -1;
      return a.k - b.k || a.i - b.i;
    })
    .map(({ row }) => row);
}

/**
 * The parts that fit the selected slot, to compare and fit one: ergonomics against the part
 * fitted now, the part's own recoil modifier, its weight, and where to get it. Search narrows the
 * list by name; sort orders it best first. It takes the one slot it shows, and the Builder and
 * each side of Compare mount it under their own slot tree's selection.
 *
 * A part that clashes with the build is disabled with the reason; one the profile cannot get is
 * dimmed and marked Locked with what unlocks it, and can still be fitted.
 */
export function SlotInspector({
  weaponId,
  slot,
  fittedId,
  parts,
  onAttach,
  getAvailability,
  getConflict,
  mode,
  pricesReady,
  onEscape,
  id,
  onClose,
  className,
}: SlotInspectorProps) {
  const questName = useQuestName();
  const searchId = useId();
  const sortId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // The search belongs to the slot it was typed in, on its weapon; another slot starts with none.
  const searchKey = `${weaponId}\n${slot.path}`;
  const [search, setSearch] = useState({ key: searchKey, text: "" });
  const query = search.key === searchKey ? search.text : "";
  const [sortChoice, setSort] = useState<InspectorSort>("ergonomics");
  const sort = sortChoice === "price" && !pricesReady ? "ergonomics" : sortChoice;
  const [showAll, setShowAll] = useState(false);
  const progression = mode === "progression";

  const fitted = fittedId ? slot.allowedItems.find((i) => i.id === fittedId) : undefined;
  // What ergonomics are measured against: 0 for an empty slot; unknown (no deltas shown) when the
  // fitted part has no figures.
  const fittedErgo = fitted ? (modifiers(parts.get(fitted.id))?.ergonomics ?? null) : 0;

  const all: OptionRow[] = slot.allowedItems.map((item) => ({
    id: item.id,
    name: item.name,
    part: parts.get(item.id),
    availability: shownAvailability(mode, getAvailability(item.id)),
    conflict: item.id === fittedId ? null : (getConflict?.(slot.path, item.id) ?? null),
  }));
  const needle = query.trim().toLowerCase();
  const matching = needle === "" ? all : all.filter((r) => r.name.toLowerCase().includes(needle));
  const shown =
    sort === "ergonomics"
      ? sortRows(matching, (r) => {
          const m = modifiers(r.part);
          return m === null ? null : -m.ergonomics;
        })
      : sort === "recoil"
        ? sortRows(matching, (r) => modifiers(r.part)?.recoilModifier ?? null)
        : sort === "weight"
          ? sortRows(matching, (r) => r.part?.weight ?? null)
          : sortRows(matching, (r) => priceOf(r.availability));

  const count = slot.allowedItems.length;

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape" && onEscape) {
      e.preventDefault();
      onEscape();
      return;
    }
    // Up / Down move between the parts' actions, skipping the disabled ones.
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const target = e.target as HTMLElement;
    if (!target.matches("[data-part-action]")) return;
    const actions = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>("[data-part-action]:not(:disabled)"),
    );
    const at = actions.indexOf(target as HTMLButtonElement);
    const next = actions[e.key === "ArrowDown" ? at + 1 : at - 1];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  return (
    // The handler only adds Escape and arrow shortcuts over native, keyboard-operable controls.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      ref={sectionRef}
      id={id}
      // In the phone's sheet the dialog carries this name; the section inside it takes none.
      aria-label={onClose ? undefined : `${slot.label} options`}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className={cn(
        "@container min-w-0 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-card)] outline-none",
        className,
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <div className={cn("flex min-w-0 gap-3", onClose && "w-full items-start justify-between")}>
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-20 font-bold leading-tight">
              {slot.label}{" "}
              <span className="text-12 font-medium text-[var(--color-muted-foreground)]">
                {slot.required ? "required · " : ""}
                <span className="font-mono tabular-nums">{count}</span>{" "}
                {count === 1 ? "option" : "options"}
              </span>
            </h2>
            <p className="text-13 text-[var(--color-muted-foreground)]">
              {fitted ? `Fitted: ${fitted.name}` : "Nothing fitted"}
            </p>
          </div>
          {onClose && (
            <Button
              variant="secondary"
              size="icon"
              className="h-11 w-11 shrink-0"
              aria-label="Close"
              onClick={onClose}
              // The sheet opens with focus here; the repeats of the key held to open it must not
              // click it shut.
              onKeyDown={(e) => {
                if (e.repeat) e.preventDefault();
              }}
            >
              <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {count > 0 && (
            <>
              <div className="flex flex-col gap-0.5">
                <label htmlFor={searchId} className="text-11 text-[var(--color-muted-foreground)]">
                  Search
                </label>
                <Input
                  ref={searchRef}
                  id={searchId}
                  type="search"
                  placeholder="Name"
                  value={query}
                  onChange={(e) => setSearch({ key: searchKey, text: e.target.value })}
                  className="w-44 max-sm:h-11"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label htmlFor={sortId} className="text-11 text-[var(--color-muted-foreground)]">
                  Sort by
                </label>
                <select
                  id={sortId}
                  value={sort}
                  onChange={(e) => setSort(e.target.value as InspectorSort)}
                  className="h-9 max-sm:h-11 rounded-[var(--radius)] border border-[var(--color-border-strong)] bg-[var(--color-input)] px-2 text-13 text-[var(--color-foreground)]"
                >
                  {(Object.keys(SORT_LABELS) as InspectorSort[])
                    .filter((key) => key !== "price" || pricesReady)
                    .map((key) => (
                      <option key={key} value={key}>
                        {SORT_LABELS[key]}
                      </option>
                    ))}
                </select>
              </div>
            </>
          )}
          {fitted && !slot.required && (
            <Button
              variant="secondary"
              size="md"
              className="max-sm:h-11"
              onClick={() => {
                onAttach(slot.path, null);
                // The button goes with the part; keep the focus in the inspector.
                (searchRef.current ?? sectionRef.current)?.focus();
              }}
            >
              Remove
            </Button>
          )}
        </div>
        {progression && count > 0 && (
          <label className="flex basis-full items-center gap-2 text-12">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
            <span>Show all items</span>
          </label>
        )}
      </div>

      {count === 0 ? (
        <p className="px-4 py-3 text-12 text-[var(--color-muted-foreground)]">
          {slot.allowedCategories.length > 0
            ? `Accepts · ${slot.allowedCategories.map((c) => c.name).join(" · ")}`
            : "No explicit allowed items or categories."}
        </p>
      ) : (
        <>
          <div
            aria-hidden
            className={cn(
              "hidden gap-x-3 border-b border-[var(--color-border)] px-4 py-2 text-11 text-[var(--color-muted-foreground)] @2xl:grid",
              GRID_WIDE,
            )}
          >
            <span>Part</span>
            <span className="text-right">Ergo</span>
            <span className="text-right">Recoil</span>
            <span className="text-right">kg</span>
            <span>Where to get it</span>
            <span />
          </div>
          {shown.length === 0 ? (
            <p className="px-4 py-3 text-13 text-[var(--color-muted-foreground)]">
              No part matches “{query.trim()}”.
            </p>
          ) : (
            <ul aria-label="Parts" className="flex flex-col">
              {shown.map((row) => (
                <PartRow
                  key={row.id}
                  row={row}
                  isFitted={row.id === fittedId}
                  fittedErgo={fittedErgo}
                  dim={
                    row.conflict !== null ||
                    (progression && !showAll && row.availability?.available === false)
                  }
                  requirement={
                    row.availability && !row.availability.available
                      ? formatRequirement(row.availability, questName)
                      : null
                  }
                  onFit={() => onAttach(slot.path, row.id)}
                />
              ))}
            </ul>
          )}
          <p className="px-4 py-2.5 text-12 text-[var(--color-muted-foreground)]">
            Showing <span className="font-mono tabular-nums">{shown.length}</span> of{" "}
            <span className="font-mono tabular-nums">{count}</span> · Recoil is the part&apos;s own
            modifier · Ergo is against {fitted ? "the fitted part" : "an empty slot"}
          </p>
        </>
      )}
    </section>
  );
}

/** The six columns of a part row once the inspector is wide enough to set them side by side. */
const GRID_WIDE =
  "@2xl:grid-cols-[minmax(0,1fr)_52px_64px_48px_minmax(0,232px)_80px] @2xl:[grid-template-areas:'name_ergo_recoil_kg_where_action']";

function PartRow({
  row,
  isFitted,
  fittedErgo,
  dim,
  requirement,
  onFit,
}: {
  row: OptionRow;
  isFitted: boolean;
  fittedErgo: number | null;
  dim: boolean;
  requirement: string | null;
  onFit: () => void;
}) {
  const m = modifiers(row.part);
  const ergoDelta = m === null || fittedErgo === null ? null : m.ergonomics - fittedErgo;
  const recoil = m === null ? null : m.recoilModifier * 100;
  const price = priceOf(row.availability);
  return (
    <li
      className={cn(
        "grid gap-x-3 gap-y-1 border-b border-[var(--color-divider)] px-4 py-2",
        "grid-cols-[auto_auto_auto_minmax(0,1fr)_auto] [grid-template-areas:'name_name_name_name_action''where_where_where_where_action''ergo_recoil_kg_._action']",
        "@2xl:min-h-11 @2xl:items-center @2xl:gap-y-0 @2xl:py-1.5",
        GRID_WIDE,
        isFitted && "bg-[var(--color-selected)]",
      )}
    >
      <div className={cn("min-w-0 [grid-area:name]", dim && "opacity-40")}>
        <span className="text-13 leading-snug">{row.name}</span>
        {[row.conflict, requirement].map(
          (reason) =>
            reason !== null && (
              <span key={reason} className="block text-11 text-[var(--color-muted-foreground)]">
                {reason}
              </span>
            ),
        )}
      </div>
      <Figure area="[grid-area:ergo]" dim={dim} suffix="ergo">
        {ergoDelta === null ? (
          "—"
        ) : formatDelta(ergoDelta, 1, true) === "" ? (
          "0"
        ) : (
          <Delta text={formatDelta(ergoDelta, 1, true)} dir={direction(ergoDelta, false)} />
        )}
      </Figure>
      <Figure area="[grid-area:recoil]" dim={dim} suffix="recoil">
        {recoil === null ? (
          "—"
        ) : (
          <Delta text={signedPercent(recoil)} dir={recoilDirection(recoil)} />
        )}
      </Figure>
      <Figure area="[grid-area:kg]" dim={dim} suffix="kg">
        {row.part === undefined ? "—" : row.part.weight.toFixed(2)}
      </Figure>
      <div
        className={cn(
          "flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-12 text-[var(--color-foreground-2)] [grid-area:where]",
          dim && "opacity-40",
        )}
      >
        <WhereToGet availability={row.availability} />
        {price !== null && (
          <span className="font-mono tabular-nums text-[var(--color-muted-foreground)]">
            {formatRub(price)}
          </span>
        )}
      </div>
      <div className="self-center justify-self-end [grid-area:action]">
        {/* One element for both states, so focus stays on it after a keyboard fit. */}
        <Button
          data-part-action
          variant={isFitted ? "ghost" : "secondary"}
          size="sm"
          aria-label={isFitted ? `Fitted: ${row.name}` : `Fit ${row.name}`}
          aria-disabled={isFitted || undefined}
          disabled={row.conflict !== null}
          onClick={isFitted ? undefined : onFit}
          className={cn(
            "min-w-16 max-sm:h-11",
            isFitted &&
              "font-bold text-[var(--color-primary-text)] hover:text-[var(--color-primary-text)]",
          )}
        >
          {isFitted ? "Fitted" : "Fit"}
        </Button>
      </div>
    </li>
  );
}

function recoilDirection(percent: number): Direction {
  return Number(percent.toFixed(1)) === 0 ? null : direction(percent, true);
}

/** One figure of a part row: right-aligned in the wide layout, with its unit word on a phone. */
function Figure({
  area,
  dim,
  suffix,
  children,
}: {
  area: string;
  dim: boolean;
  suffix: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "whitespace-nowrap font-mono text-13 tabular-nums text-[var(--color-foreground-2)] @2xl:text-right",
        area,
        dim && "opacity-40",
      )}
    >
      {children}
      <span className="text-11 text-[var(--color-muted-foreground)] @2xl:sr-only"> {suffix}</span>
    </span>
  );
}

/** "Peacekeeper LL1", "Flea", or "Locked" — the pill the tree shows, after the trader's name. */
function WhereToGet({ availability }: { availability: ItemAvailability | null }) {
  if (availability === null) return <span className="text-[var(--color-faint)]">—</span>;
  const seller = sellerOf(availability);
  return (
    <>
      {seller !== null && <span>{seller}</span>}
      <AvailabilityPill availability={availability} />
    </>
  );
}
