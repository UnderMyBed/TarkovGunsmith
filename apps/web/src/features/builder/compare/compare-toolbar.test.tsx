// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompareToolbar } from "./compare-toolbar.js";

afterEach(() => cleanup());

describe("CompareToolbar", () => {
  it("disables Save and says why while a side holds more orphans than a saved build may carry", () => {
    const onSave = vi.fn();
    render(
      <CompareToolbar
        dirty
        pairId={undefined}
        canSwap
        canClone
        isSaving={false}
        saveError={null}
        saveBlocked="Dismiss orphaned parts to share this build"
        onEmbedProfilesChange={vi.fn()}
        onSave={onSave}
        onSaveAsNew={vi.fn()}
        onSwap={vi.fn()}
        onCloneLeftToRight={vi.fn()}
        onCloneRightToLeft={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Save comparison" })).toBeDisabled();
    expect(screen.getByText("Dismiss orphaned parts to share this build")).toBeInTheDocument();
  });

  it("offers the profile opt-in only when a side has a profile, and reports a change", async () => {
    const onEmbed = vi.fn();
    const props = {
      dirty: true,
      pairId: undefined,
      canSwap: true,
      canClone: true,
      isSaving: false,
      saveError: null,
      onEmbedProfilesChange: onEmbed,
      onSave: vi.fn(),
      onSaveAsNew: vi.fn(),
      onSwap: vi.fn(),
      onCloneLeftToRight: vi.fn(),
      onCloneRightToLeft: vi.fn(),
    };
    const label = "Embed the progression snapshots in the shared URL";
    const { rerender } = render(<CompareToolbar {...props} />);
    expect(screen.queryByLabelText(label)).not.toBeInTheDocument();

    rerender(<CompareToolbar {...props} embedProfiles={false} />);
    const box = screen.getByLabelText(label);
    expect(box).not.toBeChecked();
    await userEvent.setup().click(box);
    expect(onEmbed).toHaveBeenCalledWith(true);
  });
});
