import { Card, CardContent, focusRing } from "@tarkov/ui";

export interface OrphanedBannerProps {
  /**
   * Mod ids from the saved build that are not on the weapon: ones no slot of this weapon takes,
   * and ones the Builder's game data does not hold at all.
   */
  orphanedIds: readonly string[];
  /** Lookup: id → display name (from usePartCatalog). An id missing here is not a Builder part. */
  names: Readonly<Record<string, string>>;
  /** Fires when the user dismisses the banner — parent should clear orphaned from state. */
  onDismiss: () => void;
}

export function OrphanedBanner({ orphanedIds, names, onDismiss }: OrphanedBannerProps) {
  if (orphanedIds.length === 0) return null;
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 pt-6">
        <div className="flex-1">
          <p className="text-sm font-medium">
            {orphanedIds.length} mod{orphanedIds.length === 1 ? "" : "s"} from the saved build
            couldn't be placed on this weapon.
          </p>
          <ul className="mt-2 text-xs text-[var(--color-muted-foreground)]">
            {orphanedIds.map((id) => (
              <li key={id}>{names[id] ?? `${id} — not a part the Builder knows`}</li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className={`text-xs underline underline-offset-4 hover:opacity-80 ${focusRing}`}
        >
          Dismiss
        </button>
      </CardContent>
    </Card>
  );
}
