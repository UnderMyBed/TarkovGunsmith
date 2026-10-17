import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import { Button, cn, focusRing } from "@tarkov/ui";
import { Delta } from "../delta.js";
import type { VisibleSlot } from "../slot-selection.js";
import { focusTreeRow, useTreeKeys } from "../slot-tree.js";
import { direction, formatDelta } from "../stat-strip.js";
import type { ChangedRow } from "./slot-diff.js";
import { pinStateOf, type OptimizeSession, type PinState } from "./useOptimizeSession.js";

/** The letter that sets each pin on the focused row. */
const PIN_KEYS: Readonly<Record<string, PinState>> = { f: "free", l: "lock", e: "empty" };

const PINS: readonly { state: PinState; label: string; title: string }[] = [
  { state: "free", label: "Free", title: "Free: the solver chooses (F)" },
  { state: "lock", label: "Lock", title: "Lock: keep this part (L)" },
  { state: "empty", label: "Keep empty", title: "Keep empty (E)" },
];

const PIN_NOTE: Readonly<Record<PinState, string | null>> = {
  free: null,
  lock: "locked",
  empty: "kept empty",
};

/** A row's recoil effect: the change in its part's recoil modifier, in percentage points. */
function recoilEffect(change: ChangedRow): string {
  const text = formatDelta(change.recoilDelta * 100, 1);
  return text === "" ? "" : `${text}%`;
}

/**
 * The workbench's Build panel in optimize mode: the slot tree with the proposal in it. A changed
 * row shows the old part struck through, the new one, the recoil effect and a tick box; every
 * row the current build reaches carries its pin. The Builder's tree contract holds: a flat
 * `tree` of `treeitem`s, one tab stop, arrow keys as in the editor, each row's name spelled out.
 *
 * On the focused row:
 * - Space ticks or unticks a change (the row is a checkable `treeitem`, `aria-checked`);
 * - F frees the slot for the solver, L locks its part, E keeps it empty. A key with Ctrl, Meta
 *   or Alt held is left to the browser.
 *
 * The tick box and the pin buttons are there for a pointer: out of the tab order, each click
 * puts focus back on its row.
 */
export function ProposalBuildPanel({ session }: { session: OptimizeSession }): ReactElement {
  const treeId = useId();
  const { rows, changes, ticked, constraints, proposed, confirming } = session;
  const pins = constraints.pinnedSlots;
  const locked = [...pins.values()].filter((id) => id !== null).length;
  const keptEmpty = pins.size - locked;
  const summary = [
    proposed ? `${changes.size} ${changes.size === 1 ? "change" : "changes"} proposed` : null,
    locked > 0 ? `${locked} locked` : null,
    keptEmpty > 0 ? `${keptEmpty} kept empty` : null,
  ].filter((part): part is string => part !== null);

  const labelOf = (path: string) => {
    const row = rows.find((r) => r.slot.path === path);
    return row ? row.slot.label || row.slot.nameId : path;
  };

  return (
    <section
      aria-label="Build with proposed changes"
      className="min-w-0 flex-[1_1_520px] rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-card)]"
    >
      <div className="flex flex-col gap-2 border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h2 className="text-base font-bold">Build</h2>
            <span className="font-mono text-12 tabular-nums text-[var(--color-muted-foreground)]">
              {summary.length === 0 ? "Nothing pinned" : summary.join(" · ")}
            </span>
          </div>
          {pins.size > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => session.dispatch({ type: "CLEAR_PINS" })}
            >
              Free all
            </Button>
          )}
        </div>
        <p className="text-12 text-[var(--color-muted-foreground)]">
          Lock a part to keep it; the rest are the solver&apos;s. On a row, Space ticks a change, F
          frees the slot, L locks it, E keeps it empty.
        </p>
        {confirming !== null && (
          <EmptyPrompt
            label={labelOf(confirming.path)}
            below={confirming.below}
            onConfirm={() => {
              session.confirmEmpty();
              focusTreeRow(treeId, confirming.path);
            }}
            onCancel={() => {
              session.cancelEmpty();
              focusTreeRow(treeId, confirming.path);
            }}
          />
        )}
      </div>
      <div className="py-1.5">
        <ProposalTree
          treeId={treeId}
          rows={rows}
          session={session}
          changes={changes}
          ticked={ticked}
        />
      </div>
    </section>
  );
}

/** Asks before EMPTY clears the pins below a slot. Focus starts on "Empty it". */
function EmptyPrompt({
  label,
  below,
  onConfirm,
  onCancel,
}: {
  label: string;
  below: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => confirm.current?.focus(), []);
  return (
    <div
      role="group"
      aria-label={`Empty ${label}`}
      className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-[var(--color-border-strong)] px-3 py-2 text-13"
    >
      <span className="mr-auto">
        Emptying {label} clears {below} {below === 1 ? "pin" : "pins"} below it.
      </span>
      <Button ref={confirm} variant="destructive" size="sm" onClick={onConfirm}>
        Empty it
      </Button>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Keep pins
      </Button>
    </div>
  );
}

function ProposalTree({
  treeId,
  rows,
  session,
  changes,
  ticked,
}: {
  treeId: string;
  rows: readonly VisibleSlot[];
  session: OptimizeSession;
  changes: ReadonlyMap<string, ChangedRow>;
  ticked: ReadonlySet<string>;
}) {
  const keys = useTreeKeys(rows, treeId, null);
  if (rows.length === 0) {
    return (
      <p className="px-4 text-xs text-[var(--color-muted-foreground)]">
        This weapon has no mod slots.
      </p>
    );
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>, index: number) => {
    if (keys.navigate(e, index)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const path = rows[index]!.slot.path;
    if (e.key === " ") {
      session.toggleTick(path);
      e.preventDefault();
      return;
    }
    const pin = PIN_KEYS[e.key.toLowerCase()];
    if (pin === undefined) return;
    session.setPin(path, pin);
    e.preventDefault();
  };

  return (
    <div id={treeId} role="tree" aria-label="Slots" className="flex flex-col">
      {rows.map((row, index) => (
        <ProposalRow
          key={row.slot.path}
          row={row}
          session={session}
          change={changes.get(row.slot.path)}
          checked={ticked.has(row.slot.path)}
          tabbable={row.slot.path === keys.tabStop}
          onFocus={() => keys.setFocusedPath(row.slot.path)}
          onKeyDown={(e) => onKeyDown(e, index)}
          refocus={() => focusTreeRow(treeId, row.slot.path)}
        />
      ))}
    </div>
  );
}

function ProposalRow({
  row,
  session,
  change,
  checked,
  tabbable,
  onFocus,
  onKeyDown,
  refocus,
}: {
  row: VisibleSlot;
  session: OptimizeSession;
  change: ChangedRow | undefined;
  checked: boolean;
  tabbable: boolean;
  onFocus: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  refocus: () => void;
}) {
  const { slot } = row;
  const label = slot.label || slot.nameId;
  const pin = pinStateOf(session.constraints.pinnedSlots.get(slot.path));
  const pinnable = session.isPinnable(slot.path);
  const currentId = session.currentOn[slot.path];
  const part =
    change !== undefined
      ? (change.proposedName ?? "removed")
      : pin === "empty"
        ? "kept empty"
        : currentId !== undefined
          ? session.nameOf(currentId)
          : "empty";
  const effect = change === undefined ? "" : recoilEffect(change);
  const effectDir = change === undefined ? null : direction(change.recoilDelta, true);
  // Spelled out, because the cells' text would otherwise run together.
  const name = [
    `${label}${slot.required ? ", required" : ""}: ${part}`,
    change !== undefined ? `was ${change.currentName ?? "empty"}` : null,
    effect !== "" ? `recoil ${effect}${effectDir === null ? "" : ` ${effectDir}`}` : null,
    // A slot kept empty already says so as its part.
    part === "kept empty" ? null : PIN_NOTE[pin],
  ]
    .filter((s): s is string => s !== null)
    .join(", ");

  return (
    <div
      role="treeitem"
      aria-label={name}
      aria-level={row.level}
      aria-posinset={row.posInSet}
      aria-setsize={row.setSize}
      aria-expanded={row.hasChildren ? true : undefined}
      // Nothing is selected here: a row is ticked (`aria-checked`), never selected.
      aria-selected={false}
      aria-checked={change !== undefined ? checked : undefined}
      aria-keyshortcuts={pinnable ? "F L E" : undefined}
      tabIndex={tabbable ? 0 : -1}
      data-slot-path={slot.path}
      data-changed={change !== undefined ? "" : undefined}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      className={cn(
        "grid min-h-11 grid-cols-[24px_minmax(56px,88px)_minmax(0,1fr)] items-center gap-x-2 gap-y-1 py-1.5 pl-[calc(12px+var(--depth)*8px)] pr-3 sm:gap-x-2.5 sm:pl-[calc(12px+var(--depth)*18px)] sm:grid-cols-[24px_minmax(84px,104px)_minmax(0,1fr)_auto]",
        change !== undefined && "bg-[var(--color-proposed)]",
        focusRing,
        "focus-visible:ring-offset-0 focus-visible:ring-inset",
      )}
      // Indented by depth: less on a phone, where the part name needs the width.
      style={{ "--depth": row.level - 1 } as CSSProperties}
    >
      {change !== undefined ? (
        <input
          type="checkbox"
          tabIndex={-1}
          aria-label={`Accept the ${label} change`}
          checked={checked}
          onChange={() => {
            session.toggleTick(slot.path);
            refocus();
          }}
          className="size-[18px] accent-[var(--color-primary-text)]"
        />
      ) : (
        <span />
      )}
      <span
        title={label}
        className="truncate text-12 font-medium text-[var(--color-muted-foreground)]"
      >
        {label}
        {slot.required && <span aria-hidden> *</span>}
      </span>
      <span className="flex min-w-0 flex-col gap-px">
        {change !== undefined && (
          <span className="text-12 text-[var(--color-muted-foreground)] line-through">
            {change.currentName ?? "empty"}
          </span>
        )}
        <span
          data-part
          className={cn(
            "text-13 leading-snug",
            change !== undefined
              ? "text-[var(--color-foreground)]"
              : part === "empty" || part === "kept empty"
                ? "text-[var(--color-faint)]"
                : "text-[var(--color-foreground-2)]",
          )}
        >
          {part}
        </span>
      </span>
      <span className="col-span-full flex items-center justify-end gap-2 sm:col-span-1">
        {effect !== "" && (
          <span data-effect className="whitespace-nowrap font-mono text-12 tabular-nums">
            <Delta text={effect} dir={effectDir} />
          </span>
        )}
        {pinnable ? (
          <PinControl
            label={label}
            pin={pin}
            can={(state) => session.canPin(slot.path, state)}
            onPin={(state) => {
              session.setPin(slot.path, state);
              refocus();
            }}
          />
        ) : (
          // Same width as the control, so the effects line up down the tree.
          <span aria-hidden className="w-[98px]" />
        )}
      </span>
    </div>
  );
}

function PinControl({
  label,
  pin,
  can,
  onPin,
}: {
  label: string;
  pin: PinState;
  can: (state: PinState) => boolean;
  onPin: (state: PinState) => void;
}) {
  return (
    <span
      role="group"
      aria-label={`Pin ${label}`}
      className="flex overflow-hidden rounded-[var(--radius)] border border-[var(--color-border-strong)]"
    >
      {PINS.map(({ state, label: name, title }, i) => {
        const on = pin === state;
        return (
          <button
            key={state}
            type="button"
            tabIndex={-1}
            aria-label={name}
            aria-pressed={on}
            title={title}
            disabled={!on && !can(state)}
            data-pin={state}
            // Keep focus on the row: the click sets the pin, the row stays the tab stop.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPin(state)}
            className={cn(
              "grid size-8 place-items-center disabled:opacity-30",
              i > 0 && "border-l border-[var(--color-border-strong)]",
              on
                ? state === "free"
                  ? "bg-[var(--color-selected)] text-[var(--color-primary)]"
                  : "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                : "text-[var(--color-faint)] hover:text-[var(--color-foreground)]",
            )}
          >
            <PinIcon state={state} />
          </button>
        );
      })}
    </span>
  );
}

function PinIcon({ state }: { state: PinState }) {
  switch (state) {
    case "free":
      return (
        <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 1l5 5-5 5-5-5z" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "lock":
      return (
        <svg aria-hidden width="12" height="13" viewBox="0 0 12 13" fill="none">
          <rect x="1.5" y="6" width="9" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3.5 6V4a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "empty":
      return (
        <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3 9l6-6" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
  }
}
