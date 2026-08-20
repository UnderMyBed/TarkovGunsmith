// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShortcutOverlay } from "./shortcut-overlay.js";

afterEach(() => cleanup());

describe("ShortcutOverlay", () => {
  it("stays out of the way until it is opened", () => {
    render(<ShortcutOverlay open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("names itself and lists every shortcut with the key that triggers it", () => {
    render(<ShortcutOverlay open onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    for (const [key, action] of [
      ["?", "Toggle this overlay"],
      ["g b", "Go to /builder"],
      ["g c", "Go to /calc"],
      ["g d", "Go to /data"],
      ["/", "Focus the first picker on this page"],
      ["Esc", "Close this overlay"],
    ] as const) {
      expect(within(dialog).getByText(key)).toBeInTheDocument();
      expect(within(dialog).getByText(action)).toBeInTheDocument();
    }
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ShortcutOverlay open onClose={onClose} />);

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });
});
