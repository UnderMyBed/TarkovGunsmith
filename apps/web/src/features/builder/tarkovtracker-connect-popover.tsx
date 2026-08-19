import { useState, type ReactElement } from "react";
import { Button, Input } from "@tarkov/ui";

export interface TarkovTrackerConnectPopoverProps {
  open: boolean;
  onClose: () => void;
  onConnect: (token: string) => void;
}

export function TarkovTrackerConnectPopover({
  open,
  onClose,
  onConnect,
}: TarkovTrackerConnectPopoverProps): ReactElement | null {
  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);

  if (!open) return null;

  const submit = (): void => {
    const trimmed = token.trim();
    if (trimmed.length === 0) return;
    onConnect(trimmed);
    setToken("");
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={(e) => {
        // Only close on a click that lands directly on the backdrop, not one that bubbles
        // up from inside the panel — matches the pattern in packages/ui/src/components
        // /dialog.tsx, so the panel itself needs no click handler of its own (nothing left
        // for jsx-a11y's click-events-have-key-events / no-static-element-interactions to
        // flag on either div).
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm border bg-[var(--color-card)] p-6">
        <h3 className="font-display mb-2 text-base uppercase tracking-wider">
          Connect TarkovTracker
        </h3>
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
              className="text-[var(--color-primary)] underline"
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
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={token.trim().length === 0}>
            Connect
          </Button>
        </div>
      </div>
    </div>
  );
}
