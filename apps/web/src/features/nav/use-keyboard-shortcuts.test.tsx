// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { router } from "../../router.js";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts.js";
import { ShortcutOverlay } from "./shortcut-overlay.js";

/* The shortcut layer is global: it listens on `document` and drives the app router directly.
 * These tests mount the same pairing `app.tsx` mounts — the hook plus the overlay it controls
 * — and drive it with real key presses, so what is asserted is what a user experiences: the
 * overlay appearing, a route being asked for, and shortcuts staying quiet while typing.
 *
 * `router.navigate` is spied rather than mocked away, so a rename of the destination paths
 * shows up here as a changed assertion rather than as silence. */

/** Mirrors `CHORD_TIMEOUT_MS` in the hook — the window a pressed `g` stays armed for. */
const CHORD_TIMEOUT_MS = 1000;

let navigate: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  navigate = vi.spyOn(router, "navigate").mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Mirrors `app.tsx`'s `InnerApp`, minus the router outlet. */
function Harness() {
  const { overlayOpen, setOverlayOpen } = useKeyboardShortcuts();
  return (
    <>
      <label>
        Weapon
        <select>
          <option value="">Select weapon…</option>
        </select>
      </label>
      <label>
        Notes
        <input type="text" />
      </label>
      <ShortcutOverlay open={overlayOpen} onClose={() => setOverlayOpen(false)} />
    </>
  );
}

function overlay() {
  return screen.queryByRole("dialog", { name: "Keyboard shortcuts" });
}

describe("useKeyboardShortcuts — overlay", () => {
  it("opens the shortcut overlay on ? and closes it on a second ?", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(overlay()).not.toBeInTheDocument();

    await user.keyboard("?");
    expect(overlay()).toBeInTheDocument();

    await user.keyboard("?");
    expect(overlay()).not.toBeInTheDocument();
  });

  it("closes the overlay on Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.keyboard("?");
    expect(overlay()).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(overlay()).not.toBeInTheDocument();
  });
});

describe("useKeyboardShortcuts — g chords", () => {
  it.each([
    ["b", "/builder"],
    ["c", "/calc"],
    ["d", "/data"],
  ])("sends g %s to %s", async (letter, path) => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.keyboard(`g${letter}`);

    expect(navigate).toHaveBeenCalledWith({ to: path });
  });

  it("goes nowhere when g is followed by an unmapped letter", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.keyboard("gz");

    expect(navigate).not.toHaveBeenCalled();
  });

  it("forgets a dangling g rather than firing a stale chord a minute later", async () => {
    // A real wait, not fake timers: the chord timer is armed inside a `document` listener
    // registered by an effect, and faking the clock around a React 19 render deadlocks the
    // act environment. 1.1s of real time is the cheaper trade for covering a branch a user
    // hits every time they press `g` and then change their mind.
    const user = userEvent.setup();
    render(<Harness />);

    await user.keyboard("g");
    await new Promise((resolve) => setTimeout(resolve, CHORD_TIMEOUT_MS + 100));
    await user.keyboard("b");

    expect(navigate).not.toHaveBeenCalled();
  });

  it("ignores a chord that carries a modifier, so browser shortcuts keep working", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.keyboard("{Control>}g{/Control}b");

    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("useKeyboardShortcuts — / focus", () => {
  it("puts the caret in the first picker on the page", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.keyboard("/");

    expect(screen.getByLabelText("Weapon")).toHaveFocus();
  });

  it("does nothing on a page with no picker to focus", async () => {
    const user = userEvent.setup();
    function Bare() {
      useKeyboardShortcuts();
      return <p>No pickers here</p>;
    }
    render(<Bare />);

    await user.keyboard("/");

    expect(document.body).toHaveFocus();
  });
});

describe("useKeyboardShortcuts — typing safety", () => {
  it("stays silent while the user is typing in a text field", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const notes = screen.getByLabelText("Notes");
    await user.click(notes);

    await user.keyboard("?gb/");

    expect(overlay()).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    // Every character the user typed landed in the field instead of being swallowed.
    expect(notes).toHaveValue("?gb/");
  });

  it("stays silent while a picker has focus", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByLabelText("Weapon").focus();

    await user.keyboard("?");

    expect(overlay()).not.toBeInTheDocument();
  });

  it("still closes the overlay on Escape even when focus has moved into a field", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.keyboard("?");
    expect(overlay()).toBeInTheDocument();

    screen.getByLabelText("Notes").focus();
    await user.keyboard("{Escape}");

    expect(overlay()).not.toBeInTheDocument();
  });
});
