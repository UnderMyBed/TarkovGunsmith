import { Card, CardContent } from "@tarkov/ui";

export interface OrphanedBannerProps {
  /** Mod ids that couldn't be placed in the current slot tree. */
  orphanedIds: readonly string[];
  /** Lookup: id → display name (from useModList). Unknown ids render as the raw id. */
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
            couldn't be placed in this weapon's slots.
          </p>
          <ul className="mt-2 text-xs text-[var(--color-muted-foreground)]">
            {orphanedIds.map((id) => (
              <li key={id}>{names[id] ?? id}</li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs underline underline-offset-4 hover:opacity-80"
        >
          Dismiss
        </button>
      </CardContent>
    </Card>
  );
}
