import { useState, type ReactElement } from "react";
import { visibleSlots, type SlotNode, type WeaponTree } from "@tarkov/data";
import { Button } from "@tarkov/ui";
import { isBelow, type ConstraintsAction, type PinChoice } from "./optimize-constraints-reducer.js";

interface Props {
  slotTree: WeaponTree;
  /** The current build: the tree follows it, and LOCK keeps its part. */
  attachments: Readonly<Record<string, string>>;
  pinnedSlots: ReadonlyMap<string, string | null>;
  /** A part's display name. */
  nameOf: (id: string) => string;
  dispatch: (action: ConstraintsAction) => void;
}

type RowState = "free" | "lock" | "empty";

const OPTIONS: readonly { value: RowState; label: string }[] = [
  { value: "free", label: "FREE" },
  { value: "lock", label: "LOCK" },
  { value: "empty", label: "EMPTY" },
];

function stateOf(pin: string | null | undefined): RowState {
  return pin === undefined ? "free" : pin === null ? "empty" : "lock";
}

/**
 * The pin editor: every slot the current build shows, nested under the part that owns it. Each
 * slot is FREE (the solver's to choose), LOCK (keep the part the build has there) or EMPTY
 * (leave it bare). Pinning a slot EMPTY clears the pins below it, and its nested slots leave the
 * list with them, so no lock goes away out of sight. When there are pins below, EMPTY asks
 * first: an arrow key passing over it must not wipe them.
 */
export function OptimizePinTree({
  slotTree,
  attachments,
  pinnedSlots,
  nameOf,
  dispatch,
}: Props): ReactElement {
  const emptied = [...pinnedSlots].filter(([, id]) => id === null).map(([path]) => path);
  const rows = visibleSlots(slotTree, attachments).filter(
    (slot) => !emptied.some((parent) => isBelow(slot.path, parent)),
  );
  const shown = new Set(rows.map((r) => r.path));
  // Pins at paths the current build does not show: kept from before, still sent, so listed.
  const elsewhere = [...pinnedSlots].filter(([path]) => !shown.has(path));
  const labelOf = new Map(rows.map((r) => [r.path, r.label || r.nameId]));
  const pathLabel = (path: string) =>
    path
      .split("/")
      .map((_, i, parts) => {
        const at = parts.slice(0, i + 1).join("/");
        return labelOf.get(at) ?? parts[i]!;
      })
      .join(" › ");

  const [confirming, setConfirming] = useState<string | null>(null);
  const set = (slotPath: string, pin: PinChoice) => {
    setConfirming(null);
    dispatch({ type: "SET_PIN", slotPath, pin });
  };
  const pinsBelow = (path: string) => [...pinnedSlots.keys()].filter((p) => isBelow(p, path));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-18 text-[var(--color-muted-foreground)]">
          {pinnedSlots.size === 0
            ? "Nothing pinned"
            : `${pinnedSlots.size} ${pinnedSlots.size === 1 ? "slot" : "slots"} pinned`}
        </span>
        {pinnedSlots.size > 0 && (
          <Button variant="ghost" size="sm" onClick={() => dispatch({ type: "CLEAR_PINS" })}>
            CLEAR ALL
          </Button>
        )}
      </div>
      <ul
        aria-label="Pinned slots"
        className="flex flex-col border border-dashed border-[var(--color-border)] p-2"
      >
        {rows.map((slot) => (
          <PinRow
            key={slot.path}
            slot={slot}
            current={attachments[slot.path]}
            pin={pinnedSlots.get(slot.path)}
            nameOf={nameOf}
            below={confirming === slot.path ? pinsBelow(slot.path).length : 0}
            onChange={(next) => {
              if (next === "empty" && pinsBelow(slot.path).length > 0) setConfirming(slot.path);
              else set(slot.path, next === "lock" ? { itemId: attachments[slot.path]! } : next);
            }}
            onConfirm={() => set(slot.path, "empty")}
            onCancel={() => setConfirming(null)}
          />
        ))}
        {elsewhere.map(([path, id]) => (
          <li
            key={path}
            className="flex items-center justify-between gap-2 py-1.5 font-mono text-xs"
          >
            <span className="min-w-0">
              <span className="uppercase tracking-wider">{pathLabel(path)}</span>{" "}
              <span className="text-[var(--color-muted-foreground)]">
                {id === null ? "empty" : nameOf(id)} · not on this build
              </span>
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => set(path, "free")}
              aria-label={`Free ${pathLabel(path)}`}
            >
              FREE
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface RowProps {
  slot: SlotNode;
  current: string | undefined;
  pin: string | null | undefined;
  nameOf: (id: string) => string;
  /** Pins below this slot that EMPTY, once confirmed, clears; 0 when nothing is being asked. */
  below: number;
  onChange: (state: RowState) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function PinRow({
  slot,
  current,
  pin,
  nameOf,
  below,
  onChange,
  onConfirm,
  onCancel,
}: RowProps): ReactElement {
  const depth = slot.path.split("/").length - 1;
  const state = stateOf(pin);
  const label = slot.label || slot.nameId;
  // A lock keeps the part it was set on; the build's part is what LOCK would keep now.
  const shownPart =
    state === "lock" ? nameOf(pin!) : current === undefined ? null : nameOf(current);
  const disabled = (value: RowState) =>
    (value === "lock" && current === undefined && state !== "lock") ||
    (value === "empty" && slot.required);
  return (
    <li
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5"
      style={{ paddingLeft: `${depth * 14}px` }}
      data-slot-path={slot.path}
    >
      <span className="min-w-0 flex-1 font-mono text-xs">
        <span className="uppercase tracking-wider">
          {depth > 0 && <span className="text-[var(--color-muted-foreground)]">└ </span>}
          {label}
          {slot.required && <span className="text-[var(--color-muted-foreground)]"> · req</span>}
        </span>{" "}
        <span className="text-[var(--color-muted-foreground)]">
          {state === "empty" ? "left empty" : (shownPart ?? "empty")}
        </span>
      </span>
      <span
        role="radiogroup"
        aria-label={`${label} pin`}
        className="flex border border-[var(--color-border)]"
      >
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className={`cursor-pointer px-2 py-0.5 font-mono text-10 uppercase tracking-14 has-[:checked]:bg-[var(--color-primary)] has-[:checked]:text-[var(--color-primary-foreground)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40 has-[:focus-visible]:outline has-[:focus-visible]:outline-[var(--color-primary)]`}
          >
            <input
              type="radio"
              className="sr-only"
              name={`pin:${slot.path}`}
              value={o.value}
              aria-label={o.label}
              checked={state === o.value}
              disabled={disabled(o.value)}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </span>
      {below > 0 && (
        <span
          role="group"
          aria-label={`Empty ${label}`}
          className="flex basis-full flex-wrap items-center justify-end gap-2 font-mono text-xs"
        >
          <span className="text-[var(--color-muted-foreground)]">
            Emptying {label} clears {below} {below === 1 ? "pin" : "pins"} below it.
          </span>
          <Button variant="destructive" size="sm" onClick={onConfirm}>
            EMPTY IT
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            KEEP PINS
          </Button>
        </span>
      )}
    </li>
  );
}
