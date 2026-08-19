import type { WeaponListItem } from "@tarkov/data";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tarkov/ui";

export interface WeaponPanelProps {
  isLoading: boolean;
  weaponOptions: readonly WeaponListItem[];
  weaponId: string;
  onWeaponChange: (weaponId: string) => void;
  showAllWeapons: boolean;
  onShowAllWeaponsChange: (showAll: boolean) => void;
  /** True once a weapon is selected — gates the share controls. */
  hasSelectedWeapon: boolean;
  onShare: () => void;
  isSaving: boolean;
  saveFailed: boolean;
  embedProfileOnSave: boolean;
  onEmbedProfileOnSaveChange: (embed: boolean) => void;
}

/**
 * The "Weapon" card: picker + profile-filtered availability toggle, plus (once a weapon is
 * selected) the share-build action and its progression-embed option.
 */
export function WeaponPanel({
  isLoading,
  weaponOptions,
  weaponId,
  onWeaponChange,
  showAllWeapons,
  onShowAllWeaponsChange,
  hasSelectedWeapon,
  onShare,
  isSaving,
  saveFailed,
  embedProfileOnSave,
  onEmbedProfileOnSaveChange,
}: WeaponPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Weapon</CardTitle>
        <CardDescription>
          {isLoading
            ? "Loading…"
            : `${weaponOptions.length} weapons ${showAllWeapons ? "(all)" : "available on your profile"}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <select
          className="h-9 w-full rounded-[var(--radius)] border bg-[var(--color-input)] px-3 text-sm"
          value={weaponId}
          onChange={(e) => onWeaponChange(e.target.value)}
          disabled={isLoading || weaponOptions.length === 0}
        >
          <option value="">{isLoading ? "Loading…" : "Select weapon…"}</option>
          {weaponOptions.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
          <input
            type="checkbox"
            checked={showAllWeapons}
            onChange={(e) => onShowAllWeaponsChange(e.target.checked)}
          />
          <span>Show all weapons (including locked by profile)</span>
        </label>
        {hasSelectedWeapon && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <Button onClick={onShare} disabled={isSaving} size="sm">
                {isSaving ? "Saving…" : "Share build"}
              </Button>
              {saveFailed && (
                <span className="text-sm text-[var(--color-destructive)]">
                  Couldn&apos;t save — try again
                </span>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
              <input
                type="checkbox"
                checked={embedProfileOnSave}
                onChange={(e) => onEmbedProfileOnSaveChange(e.target.checked)}
              />
              <span>Embed my progression snapshot in the shared URL</span>
            </label>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
