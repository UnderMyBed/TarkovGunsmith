import type { BuildPrice } from "@tarkov/data";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tarkov/ui";
import { describeBuildPrice, type PricesStatus } from "./build-price.js";
import { PricesLine } from "./prices-line.js";
import { formatRequirement } from "./slot-tree.js";
import type { WeaponOption } from "./useBuilderState.js";

export interface WeaponPanelProps {
  isLoading: boolean;
  weaponOptions: readonly WeaponOption[];
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
  /** When the Builder's data was taken from upstream (ISO 8601), once it has loaded. */
  dataAsOf: string | null;
  /** Where live prices stand. */
  prices: PricesStatus;
  /** What the selected build costs, once it can be worked out. */
  buildPrice: BuildPrice | null;
  /** The preset the cost buys the weapon as, when it is one. */
  boughtAs: string | null;
  /** Names an item id in the cost line. */
  nameOf: (id: string) => string;
}

const DATA_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const META = "font-mono text-10 uppercase tracking-18 text-[var(--color-muted-foreground)]";

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
  dataAsOf,
  prices,
  buildPrice,
  boughtAs,
  nameOf,
}: WeaponPanelProps) {
  const availableCount = weaponOptions.filter((w) => w.lockedBy === null).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Weapon</CardTitle>
        <CardDescription>
          {isLoading
            ? "Loading…"
            : `${availableCount} weapons ${showAllWeapons ? "(all)" : "available on your profile"}`}
        </CardDescription>
        {dataAsOf !== null && (
          <p className={META}>
            Data as of <time dateTime={dataAsOf}>{DATA_DATE.format(new Date(dataAsOf))}</time>
          </p>
        )}
        <PricesLine prices={prices} />
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
              {w.lockedBy === null
                ? w.name
                : `${w.name} — LOCKED · ${formatRequirement(w.lockedBy)}`}
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
        {hasSelectedWeapon && buildPrice !== null && prices.state === "ready" && (
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm" data-testid="build-cost">
            <span className={META}>Build cost</span>
            <span className="font-mono tabular-nums">{describeBuildPrice(buildPrice, nameOf)}</span>
            {buildPrice.status !== "unobtainable" && boughtAs !== null && (
              <span className={META}>bought as {boughtAs}</span>
            )}
          </p>
        )}
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
