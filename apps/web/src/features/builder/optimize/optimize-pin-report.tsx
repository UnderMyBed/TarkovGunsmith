import type { ReactElement } from "react";
import type { WeaponTree } from "@tarkov/data";
import type { DroppedPin, PinReport } from "@tarkov/optimizer";
import { Card, Pill } from "@tarkov/ui";
import { shownSlots } from "./slot-diff.js";

interface Props {
  pins: PinReport;
  slotTree: WeaponTree;
  /** The build the pins were checked against: the optimizer's result. */
  proposed: Readonly<Record<string, string>>;
  /** The build the pins were set on, for the names of slots the result does not have. */
  current: Readonly<Record<string, string>>;
  nameOf: (id: string) => string;
}

/**
 * Which pins the result keeps and why it drops the rest (`@tarkov/optimizer`'s `PinReport`),
 * by slot and part name. Nothing renders when the run had no pins.
 */
export function OptimizePinReport({
  pins,
  slotTree,
  proposed,
  current,
  nameOf,
}: Props): ReactElement | null {
  if (pins.honoured.length === 0 && pins.dropped.length === 0) return null;
  const labels = new Map(
    shownSlots(slotTree, proposed, current).map((s) => [s.path, s.label || s.nameId]),
  );
  const slotName = (path: string) =>
    path
      .split("/")
      .map((segment, i, parts) => labels.get(parts.slice(0, i + 1).join("/")) ?? segment)
      .join(" › ");
  const leaf = (path: string) => slotName(path).split(" › ").pop()!;
  const why = (d: DroppedPin): string => {
    switch (d.reason) {
      case "absent":
        return `This build has no ${leaf(d.path)} slot there.`;
      case "not-allowed":
        return `${leaf(d.path)} doesn't take ${nameOf(d.itemId!)}.`;
      case "unknown-item":
        return `${d.itemId} is not in the game data.`;
      case "required":
        return `${leaf(d.path)} is required, so it can't be left empty.`;
    }
  };
  return (
    <Card className="flex flex-col gap-3 p-5" role="region" aria-label="Pins">
      <div className="flex items-center gap-3">
        <span className="font-bold text-base">Pins</span>
        <Pill tone="reliable">{pins.honoured.length} kept</Pill>
        {pins.dropped.length > 0 && <Pill tone="marginal">{pins.dropped.length} dropped</Pill>}
      </div>
      <ul className="flex flex-col gap-1.5 text-13">
        {pins.honoured.map((path) => (
          <li key={path} className="flex flex-wrap gap-x-2">
            <span className="text-[var(--color-better)]">Kept</span>
            <span>{slotName(path)}</span>
            <span className="text-[var(--color-muted-foreground)]">
              {proposed[path] === undefined ? "empty" : nameOf(proposed[path])}
            </span>
          </li>
        ))}
        {pins.dropped.map((d) => (
          <li key={`${d.path}:${d.reason}`} className="flex flex-wrap gap-x-2">
            <span className="text-[var(--color-destructive)]">Dropped</span>
            <span>{slotName(d.path)}</span>
            <span className="text-[var(--color-muted-foreground)]">
              {d.itemId === null ? "empty" : nameOf(d.itemId)} · {why(d)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
