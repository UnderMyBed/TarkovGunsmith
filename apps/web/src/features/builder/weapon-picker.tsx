import { useMemo } from "react";
import type { BuilderMode } from "@tarkov/data";
import { Combobox, type ComboboxOption } from "@tarkov/ui";
import { formatRequirement } from "./slot-tree.js";
import { useQuestName } from "./quest-names.js";
import type { WeaponOption } from "./useBuilderState.js";

export interface WeaponPickerProps {
  isLoading: boolean;
  weaponOptions: readonly WeaponOption[];
  weaponId: string;
  onWeaponChange: (weaponId: string) => void;
  /** Theorycraft lists every weapon; progression, those the profile can get. */
  mode: BuilderMode;
  className?: string;
}

/**
 * The workbench's weapon picker: a searchable combobox over every weapon in theorycraft, and
 * those the profile can get in progression. A weapon the profile cannot get is listed only while
 * it is the one on screen, with what locks it.
 *
 * `/` focuses it: the global shortcut (`use-keyboard-shortcuts.ts`) focuses the page's first
 * picker, and this combobox is the first on the Builder.
 */
export function WeaponPicker({
  isLoading,
  weaponOptions,
  weaponId,
  onWeaponChange,
  mode,
  className,
}: WeaponPickerProps) {
  const questName = useQuestName();

  const options = useMemo(
    (): ComboboxOption[] =>
      weaponOptions.map((w) =>
        w.lockedBy === null
          ? { value: w.id, label: w.name }
          : {
              value: w.id,
              label: w.name,
              description: `Locked · ${formatRequirement(w.lockedBy, questName)}`,
            },
      ),
    [weaponOptions, questName],
  );

  const available = weaponOptions.filter((w) => w.lockedBy === null).length;
  const count =
    mode === "theorycraft"
      ? `${available} weapons`
      : `${available} weapons available on your profile`;

  return (
    <Combobox
      className={className}
      label="Weapon"
      options={options}
      value={weaponId}
      onChange={onWeaponChange}
      disabled={isLoading || weaponOptions.length === 0}
      placeholder={isLoading ? "Loading weapons…" : "Search weapons"}
      shortcut="/"
      listHeader={count}
      emptyText="No weapon matches"
    />
  );
}
