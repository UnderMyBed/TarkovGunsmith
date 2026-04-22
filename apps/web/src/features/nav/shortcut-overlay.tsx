import { Dialog, DialogPanel, DialogTitle, DialogBody } from "@tarkov/ui";

interface Shortcut {
  readonly key: string;
  readonly action: string;
}

const SHORTCUTS: readonly Shortcut[] = [
  { key: "?", action: "Toggle this overlay" },
  { key: "g b", action: "Go to /builder" },
  { key: "g c", action: "Go to /calc" },
  { key: "g d", action: "Go to /data" },
  { key: "/", action: "Focus the first picker on this page" },
  { key: "Esc", action: "Close this overlay" },
];

export interface ShortcutOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutOverlay({ open, onClose }: ShortcutOverlayProps) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="shortcut-overlay-title">
      <DialogPanel className="max-w-md">
        <DialogTitle id="shortcut-overlay-title">Keyboard shortcuts</DialogTitle>
        <DialogBody>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 font-mono text-sm">
            {SHORTCUTS.map((s) => (
              <div key={s.key} className="contents">
                <dt className="text-[var(--color-primary)] tracking-[0.15em] uppercase text-xs">
                  {s.key}
                </dt>
                <dd className="text-[var(--color-foreground)]">{s.action}</dd>
              </div>
            ))}
          </dl>
        </DialogBody>
      </DialogPanel>
    </Dialog>
  );
}
