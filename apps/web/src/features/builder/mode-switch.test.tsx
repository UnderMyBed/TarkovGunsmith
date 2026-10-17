// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BuilderMode } from "@tarkov/data";
import { ModeSwitch } from "./mode-switch.js";

afterEach(() => cleanup());

function renderSwitch(mode: BuilderMode, hasProfile: boolean, busyId?: string) {
  const setMode = vi.fn();
  const onOpenPanel = vi.fn();
  render(
    <>
      <ModeSwitch
        progression={{ mode, hasProfile, setMode }}
        onOpenPanel={onOpenPanel}
        busyId={busyId}
      />
      {busyId !== undefined && <p id={busyId}>Importing</p>}
    </>,
  );
  return { setMode, onOpenPanel };
}

const theorycraft = () => screen.getByRole("button", { name: "Theorycraft" });
const progression = () => screen.getByRole("button", { name: "My progression…" });

describe("ModeSwitch", () => {
  it("marks the current mode pressed", () => {
    renderSwitch("theorycraft", false);
    expect(theorycraft()).toHaveAttribute("aria-pressed", "true");
    expect(progression()).toHaveAttribute("aria-pressed", "false");
  });

  it("opens the panel when there is no profile to switch to", async () => {
    const { setMode, onOpenPanel } = renderSwitch("theorycraft", false);
    await userEvent.setup().click(progression());
    expect(onOpenPanel).toHaveBeenCalledOnce();
    expect(setMode).not.toHaveBeenCalled();
  });

  it("switches straight back to a profile already set", async () => {
    const { setMode, onOpenPanel } = renderSwitch("theorycraft", true);
    await userEvent.setup().click(progression());
    expect(setMode).toHaveBeenCalledWith("progression");
    expect(onOpenPanel).not.toHaveBeenCalled();
  });

  it("opens the panel to edit the profile when already in progression, and switches to theorycraft", async () => {
    const user = userEvent.setup();
    const { setMode, onOpenPanel } = renderSwitch("progression", true);
    await user.click(progression());
    expect(onOpenPanel).toHaveBeenCalledOnce();
    await user.click(theorycraft());
    expect(setMode).toHaveBeenCalledWith("theorycraft");
  });

  it("disables both halves while a sync is in flight, pointing at the note", () => {
    renderSwitch("theorycraft", false, "busy");
    for (const half of [theorycraft(), progression()]) {
      expect(half).toBeDisabled();
      expect(half).toHaveAccessibleDescription("Importing");
    }
  });
});
