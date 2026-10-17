import { useState } from "react";
import {
  resolveBuild,
  type ConflictFields,
  type ItemAvailability,
  type WeaponPreset,
  type WeaponTree,
} from "@tarkov/data";
import { Button, Card, CardContent, Pill } from "@tarkov/ui";
import { AvailabilityPill, formatRequirement } from "./slot-tree.js";
import { useQuestName } from "./quest-names.js";

export interface PresetPickerProps {
  /** One weapon's presets, the default first (`selectWeaponPresets` order). */
  presets: readonly WeaponPreset[];
  /** The weapon's slot tree, to compare builds by the parts actually on the weapon. */
  tree: WeaponTree;
  /** The part catalog by id: what a build is resolved against. */
  known: ReadonlyMap<string, ConflictFields>;
  /** The build's current attachments. */
  attachments: Readonly<Record<string, string>>;
  /** Whether the profile can buy each preset. Omitted in theorycraft mode. */
  getAvailability?: (presetId: string) => ItemAvailability | null;
  /** Replaces the build's attachments wholesale. */
  onApply: (attachments: Readonly<Record<string, string>>) => void;
}

interface Option {
  readonly id: string;
  readonly label: string;
  readonly isDefault: boolean;
  readonly attachments: Readonly<Record<string, string>>;
}

const EMPTY_OPTION: Option = { id: "", label: "Empty", isDefault: false, attachments: {} };

function sameAttachments(
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>,
): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/**
 * The weapon's upstream presets, plus an empty build, as one-click starting points.
 *
 * The chip whose parts match the build is marked current, comparing only the parts actually on
 * the weapon (`resolveBuild`), so a stale key under a removed part changes nothing.
 * Applying replaces every part, so
 * when the build holds parts that match no preset (the player's own work) the picker asks
 * before replacing them.
 */
export function PresetPicker({
  presets,
  tree,
  known,
  attachments,
  getAvailability,
  onApply,
}: PresetPickerProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const questName = useQuestName();
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

  function choose(option: Option) {
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
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Presets">
          <span className="mr-2 text-sm text-[var(--color-muted-foreground)]">Presets:</span>
          {options.map((option) => {
            const availability =
              option === EMPTY_OPTION ? null : (getAvailability?.(option.id) ?? null);
            const isCurrent = option === current;
            return (
              <Button
                key={option.id || "empty"}
                size="sm"
                variant={isCurrent ? "default" : "secondary"}
                aria-pressed={isCurrent}
                className={availability?.available === false ? "opacity-60" : undefined}
                onClick={() => choose(option)}
              >
                {option.label}
                {option.isDefault && <Pill tone="muted">Default</Pill>}
                {availability?.available === false && (
                  <span className="text-10 normal-case text-[var(--color-paper-dim)]">
                    {formatRequirement(availability, questName)}
                  </span>
                )}
                <AvailabilityPill availability={availability} />
              </Button>
            );
          })}
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
      </CardContent>
    </Card>
  );
}
