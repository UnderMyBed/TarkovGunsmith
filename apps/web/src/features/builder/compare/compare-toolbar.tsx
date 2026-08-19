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
  onSave: () => void;
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
  onSave,
  onSaveAsNew,
  onSwap,
  onCloneLeftToRight,
  onCloneRightToLeft,
}: CompareToolbarProps): ReactElement {
  const saveLabel = pairId ? "Save changes" : "Save comparison";
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] pb-3">
      <Button onClick={onSave} disabled={isSaving || (!dirty && pairId !== undefined)}>
        {isSaving ? "Saving…" : saveLabel}
      </Button>
      {pairId && (
        <Button variant="secondary" onClick={onSaveAsNew} disabled={isSaving}>
          Save as new
        </Button>
      )}
      {saveError && (
        <span role="alert" className="text-sm text-[var(--color-destructive)]">
          {saveFailureCopy(saveError)}
        </span>
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
