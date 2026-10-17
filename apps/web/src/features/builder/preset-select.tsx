import { useId, useState } from "react";
import {
  resolveBuild,
  type BuilderMode,
  type ConflictFields,
  type ItemAvailability,
  type WeaponPreset,
  type WeaponTree,
} from "@tarkov/data";
import { Button } from "@tarkov/ui";
import { formatRequirement } from "./slot-tree.js";
import { useQuestName } from "./quest-names.js";
import { availabilityLabel, shownAvailability } from "./shown-availability.js";

export interface PresetSelectProps {
  /** One weapon's presets, the default first (`selectWeaponPresets` order). */
  presets: readonly WeaponPreset[];
  /** The weapon's slot tree, to compare builds by the parts actually on the weapon. */
  tree: WeaponTree;
  /** The part catalog by id: what a build is resolved against. */
  known: ReadonlyMap<string, ConflictFields>;
  /** The build's current attachments. */
  attachments: Readonly<Record<string, string>>;
  /** How the Builder's gate can buy each preset; in theorycraft, every gate open. */
  getAvailability?: (presetId: string) => ItemAvailability | null;
  /**
   * The Builder's mode. In theorycraft a preset nothing sells is shown as neither locked nor
   * sold anywhere (`shownAvailability`); progression shows what blocks it. Defaults to
   * progression.
   */
  mode?: BuilderMode;
  /** Replaces the build's attachments wholesale. */
  onApply: (attachments: Readonly<Record<string, string>>) => void;
}

interface Option {
  readonly id: string;
  readonly label: string;
  readonly isDefault: boolean;
  readonly attachments: Readonly<Record<string, string>>;
}

/** The option value of an empty build, and of the build's own parts when no preset matches. */
const EMPTY = "empty";
const CUSTOM = "custom";

const EMPTY_OPTION: Option = { id: EMPTY, label: "Empty", isDefault: false, attachments: {} };

function sameAttachments(
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>,
): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/**
 * The weapon's upstream presets, plus an empty build, as one labelled dropdown of starting
 * points.
 *
 * The option whose parts match the build is the selected one, comparing only the parts actually
 * on the weapon (`resolveBuild`), so a stale key under a removed part changes nothing; a build
 * that matches none reads "Custom parts". Each option says how the gate can buy it, and a locked
 * preset says what locks it but can still be chosen: its parts are what the player is exploring.
 * Applying replaces every part, so when the build holds parts that match no preset (the
 * player's own work) the dropdown asks before replacing them, and stays on "Custom parts" until
 * the player says Replace.
 */
export function PresetSelect({
  presets,
  tree,
  known,
  attachments,
  getAvailability,
  mode = "progression",
  onApply,
}: PresetSelectProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const questName = useQuestName();
  const id = useId();
  if (presets.length === 0) return null;

  const options: Option[] = [
    ...presets.map((p) => ({
      id: p.id,
      label: p.shortName,
      isDefault: p.isDefault,
      attachments: p.attachments,
    })),
    EMPTY_OPTION,
  ];
  const onWeapon = (a: Readonly<Record<string, string>>) =>
    resolveBuild(tree, a, known).attachments;
  const mounted = onWeapon(attachments);
  const current = options.find((o) => sameAttachments(onWeapon(o.attachments), mounted));
  const pending = options.find((o) => o.id === pendingId);

  /** The option's text: its name, whether it is the default, and how it can be bought. */
  function text(option: Option): string {
    const name = option.isDefault ? `${option.label} (default)` : option.label;
    if (option === EMPTY_OPTION) return name;
    const availability = shownAvailability(mode, getAvailability?.(option.id) ?? null);
    if (availability === null) return name;
    if (!availability.available) {
      return `${name} · Locked · ${formatRequirement(availability, questName)}`;
    }
    return `${name} · ${availabilityLabel(availability)}`;
  }

  function choose(optionId: string) {
    const option = options.find((o) => o.id === optionId);
    if (option === undefined) return;
    if (current === undefined) {
      setPendingId(option.id);
      return;
    }
    onApply(option.attachments);
  }

  function confirm(option: Option) {
    onApply(option.attachments);
    setPendingId(null);
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <label htmlFor={id} className="text-12 text-[var(--color-muted-foreground)]">
          Preset
        </label>
        <select
          id={id}
          value={current?.id ?? CUSTOM}
          onChange={(e) => choose(e.target.value)}
          className="h-9 min-w-0 max-w-full flex-1 rounded-[var(--radius)] border border-[var(--color-border-strong)] bg-[var(--color-input)] px-2 text-13 text-[var(--color-foreground)]"
        >
          {current === undefined && (
            <option value={CUSTOM} disabled>
              Custom parts
            </option>
          )}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {text(option)}
            </option>
          ))}
        </select>
      </div>
      {pending !== undefined && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          <span>Replace your current parts with {pending.label}?</span>
          <Button size="sm" variant="destructive" onClick={() => confirm(pending)}>
            Replace
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPendingId(null)}>
            Keep current parts
          </Button>
        </div>
      )}
    </div>
  );
}
