import type { ReactElement } from "react";
import { Button } from "@tarkov/ui";
import { SavePairError } from "@tarkov/data";

interface CompareToolbarProps {
  dirty: boolean;
  pairId: string | undefined;
  canSwap: boolean;
  canClone: boolean;
  /** True while a save or fork request is in flight — both are non-idempotent POSTs. */
  isSaving: boolean;
  /** The last save/fork failure, or null. Cleared by the next attempt. */
  saveError: Error | null;
  /** Why the comparison cannot be saved as it stands, or `null`. */
  saveBlocked?: string | null;
  /**
   * Whether a save publishes the sides' profiles; `undefined` hides the choice, as when
   * neither side has a profile to publish.
   */
  embedProfiles?: boolean;
  onEmbedProfilesChange: (embed: boolean) => void;
  /** Saves the draft as a new pair: the action while the comparison has no pairId. */
  onSave: () => void;
  /** Writes a new pair from a saved one: the action once the comparison has a pairId. */
  onSaveAsNew: () => void;
  onSwap: () => void;
  onCloneLeftToRight: () => void;
  onCloneRightToLeft: () => void;
}

/**
 * Copy for a failed save, keyed off the HTTP status the builds-api actually returns for
 * `POST /api/pairs` (`apps/builds-api/src/pairs.ts`): 400 for an empty / non-JSON /
 * schema-invalid body, 413 over `MAX_BODY_BYTES`, 429 once an IP is past
 * `PER_IP_DAILY_WRITE_LIMIT` for the UTC day. `status` is null when the request never got
 * a response at all (offline, DNS, CORS), which is the only case where retrying now is
 * likely to help on its own.
 */
function saveFailureCopy(error: Error): string {
  const status = error instanceof SavePairError ? error.status : null;
  switch (status) {
    case 429:
      return "Save limit reached for today. Your comparison is still here — try again after 00:00 UTC.";
    case 413:
      return "This comparison is too big to store. Drop some attachments, then save again.";
    case 400:
      return "Comparison storage rejected this comparison. Reload the page and rebuild it.";
    case null:
      return "Can't reach comparison storage. Check your connection, then save again.";
    default:
      return `Comparison storage returned HTTP ${status}. Your comparison is still here — save again.`;
  }
}

export function CompareToolbar({
  dirty,
  pairId,
  canSwap,
  canClone,
  isSaving,
  saveError,
  saveBlocked = null,
  embedProfiles,
  onEmbedProfilesChange,
  onSave,
  onSaveAsNew,
  onSwap,
  onCloneLeftToRight,
  onCloneRightToLeft,
}: CompareToolbarProps): ReactElement {
  // Stored pairs are immutable — a share link keeps showing what it showed when it was made —
  // so a saved pair is never updated in place. Its one save action writes a new pair: a fork
  // of the stored one when nothing has changed, otherwise a save of the draft.
  const saved = pairId !== undefined;
  const blocked = saveBlocked !== null && (!saved || dirty);
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] pb-3">
      <Button onClick={saved ? onSaveAsNew : onSave} disabled={isSaving || blocked}>
        {isSaving ? "Saving…" : saved ? "Save as new link" : "Save comparison"}
      </Button>
      {blocked && <span className="text-sm text-[var(--color-destructive)]">{saveBlocked}</span>}
      {saveError && (
        <span role="alert" className="text-sm text-[var(--color-destructive)]">
          {saveFailureCopy(saveError)}
        </span>
      )}
      {embedProfiles !== undefined && (
        <label className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
          <input
            type="checkbox"
            checked={embedProfiles}
            onChange={(e) => onEmbedProfilesChange(e.target.checked)}
          />
          <span>Embed the progression snapshots in the shared URL</span>
        </label>
      )}
      <span className="flex-1" />
      <Button variant="ghost" onClick={onSwap} disabled={!canSwap}>
        Swap L↔R
      </Button>
      <Button variant="ghost" onClick={onCloneLeftToRight} disabled={!canClone}>
        Clone L→R
      </Button>
      <Button variant="ghost" onClick={onCloneRightToLeft} disabled={!canClone}>
        Clone R→L
      </Button>
    </div>
  );
}
