import { useState, type ReactElement } from "react";
import { Button, Card, CardContent, Input } from "@tarkov/ui";

const BUILD_ID_REGEX = /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/;

type Mode = "clone-both" | "paste-url" | "empty-right";

export type CompareFromBuildConfirm =
  | { mode: "clone-both" }
  | { mode: "paste-url"; rightBuildId: string }
  | { mode: "empty-right" };

interface CompareFromBuildDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (result: CompareFromBuildConfirm) => void;
}

function extractBuildId(input: string): string | null {
  const trimmed = input.trim();
  if (BUILD_ID_REGEX.test(trimmed)) return trimmed;
  const match = /\/builder\/([a-z2-9]{8})(?:[/?#]|$)/.exec(trimmed);
  return match ? (match[1] ?? null) : null;
}

export function CompareFromBuildDialog({
  open,
  onClose,
  onConfirm,
}: CompareFromBuildDialogProps): ReactElement | null {
  const [mode, setMode] = useState<Mode>("clone-both");
  const [pasteValue, setPasteValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = () => {
    setError(null);
    if (mode === "clone-both") {
      onConfirm({ mode: "clone-both" });
      onClose();
      return;
    }
    if (mode === "paste-url") {
      const id = extractBuildId(pasteValue);
      if (!id) {
        setError("Invalid share URL or id.");
        return;
      }
      onConfirm({ mode: "paste-url", rightBuildId: id });
      onClose();
      return;
    }
    onConfirm({ mode: "empty-right" });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <Card className="w-full max-w-md" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="text-lg font-bold uppercase tracking-wider">Compare this build</h2>

          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="compare-mode"
              checked={mode === "clone-both"}
              onChange={() => setMode("clone-both")}
            />
            <span>Clone current build into both sides</span>
          </label>

          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="compare-mode"
              checked={mode === "paste-url"}
              onChange={() => setMode("paste-url")}
            />
            <span>Paste another share URL for the right side</span>
          </label>

          {mode === "paste-url" && (
            <div className="flex flex-col gap-1 pl-6">
              <label
                htmlFor="compare-paste-url"
                className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]"
              >
                Share URL or id
              </label>
              <Input
                id="compare-paste-url"
                value={pasteValue}
                onChange={(e) => setPasteValue(e.target.value)}
                placeholder="abc23456 or https://…/builder/abc23456"
              />
            </div>
          )}

          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="compare-mode"
              checked={mode === "empty-right"}
              onChange={() => setMode("empty-right")}
            />
            <span>Start right side empty</span>
          </label>

          {error && <p className="text-sm text-[var(--color-destructive)]">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>Compare</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
