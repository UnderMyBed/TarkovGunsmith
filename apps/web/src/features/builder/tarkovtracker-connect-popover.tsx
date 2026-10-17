import { useId, useState, type ReactElement } from "react";
import { Button, Dialog, DialogBody, DialogPanel, DialogTitle, Input } from "@tarkov/ui";

export interface TarkovTrackerConnectPopoverProps {
  open: boolean;
  onClose: () => void;
  onConnect: (token: string) => void;
}

export function TarkovTrackerConnectPopover({
  open,
  onClose,
  onConnect,
}: TarkovTrackerConnectPopoverProps): ReactElement {
  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);
  const titleId = useId();

  // A token typed and then abandoned is not kept for the next open.
  const close = (): void => {
    setToken("");
    setShow(false);
    onClose();
  };

  const submit = (): void => {
    const trimmed = token.trim();
    if (trimmed.length === 0) return;
    onConnect(trimmed);
    setToken("");
  };

  // A Dialog of its own, stacked over the progression panel it opens from: the primitive's
  // dialog stack hands Escape and focus containment to the topmost one, so Escape here closes
  // this and leaves the panel open, with focus back on the button that opened it.
  return (
    <Dialog open={open} onClose={close} labelledBy={titleId}>
      <DialogPanel className="max-w-sm">
        <DialogTitle id={titleId}>Connect TarkovTracker</DialogTitle>
        <DialogBody>
          <label
            htmlFor="tarkovtracker-token"
            className="mb-1 block text-xs text-[var(--color-muted-foreground)]"
          >
            TarkovTracker token
          </label>
          <div className="mb-3 flex gap-2">
            <Input
              id="tarkovtracker-token"
              type={show ? "text" : "password"}
              value={token}
              placeholder="Paste token"
              autoComplete="off"
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
            <Button type="button" size="sm" variant="ghost" onClick={() => setShow((s) => !s)}>
              {show ? "Hide" : "Show"}
            </Button>
          </div>
          <ol className="mb-3 list-decimal pl-5 text-xs text-[var(--color-muted-foreground)]">
            <li>
              Open{" "}
              <a
                href="https://tarkovtracker.io/settings"
                target="_blank"
                rel="noreferrer noopener"
                className="text-[var(--color-primary-text)] underline"
              >
                tarkovtracker.io/settings →
              </a>
            </li>
            <li>Create a token with &ldquo;Get Progression&rdquo; scope</li>
            <li>Paste it above</li>
          </ol>
          <p className="mb-4 text-xs text-[var(--color-muted-foreground)]">
            Stored in your browser only. We never send it to the TarkovGunsmith servers.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit} disabled={token.trim().length === 0}>
              Connect
            </Button>
          </div>
        </DialogBody>
      </DialogPanel>
    </Dialog>
  );
}
