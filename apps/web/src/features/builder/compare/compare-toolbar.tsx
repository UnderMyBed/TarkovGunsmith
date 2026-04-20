import type { ReactElement } from "react";
import { Button } from "@tarkov/ui";

interface CompareToolbarProps {
  dirty: boolean;
  pairId: string | undefined;
  canSwap: boolean;
  canClone: boolean;
  onSave: () => void;
  onSaveAsNew: () => void;
  onSwap: () => void;
  onCloneLeftToRight: () => void;
  onCloneRightToLeft: () => void;
}

export function CompareToolbar({
  dirty,
  pairId,
  canSwap,
  canClone,
  onSave,
  onSaveAsNew,
  onSwap,
  onCloneLeftToRight,
  onCloneRightToLeft,
}: CompareToolbarProps): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] pb-3">
      <Button onClick={onSave} disabled={!dirty && pairId !== undefined}>
        {pairId ? "Save changes" : "Save comparison"}
      </Button>
      {pairId && (
        <Button variant="secondary" onClick={onSaveAsNew}>
          Save as new
        </Button>
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
