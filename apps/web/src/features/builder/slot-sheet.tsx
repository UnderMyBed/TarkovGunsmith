import { Dialog, SheetPanel } from "@tarkov/ui";
import { SlotInspector, type SlotInspectorProps } from "./slot-inspector.js";

export interface SlotSheetProps extends Omit<
  SlotInspectorProps,
  "onClose" | "onEscape" | "className"
> {
  /** Closes the sheet: Close, Escape, a tap on the page behind it, or a part fitted or removed. */
  onClose: () => void;
}

/**
 * The slot inspector as a phone's bottom sheet: the same inspector the desktop shows beside the
 * tree (search, sort, Fit, Remove), in a modal named "<Slot> options".
 *
 * Fitting or removing a part closes it — the row it was opened from then shows the change. The
 * dialog owns Escape, so the inspector is given no Escape handler of its own here; focus going
 * back to the row is the owner's, after the sheet has unmounted (`builder-page.tsx`).
 */
export function SlotSheet({ onClose, onAttach, ...inspector }: SlotSheetProps) {
  return (
    <Dialog
      open
      onClose={onClose}
      placement="bottom"
      aria-label={`${inspector.slot.label} options`}
    >
      <SheetPanel>
        <SlotInspector
          {...inspector}
          // The sheet is the panel: no second border or radius inside it.
          className="rounded-none border-0"
          onAttach={(path, itemId) => {
            onAttach(path, itemId);
            onClose();
          }}
          onClose={onClose}
        />
      </SheetPanel>
    </Dialog>
  );
}
