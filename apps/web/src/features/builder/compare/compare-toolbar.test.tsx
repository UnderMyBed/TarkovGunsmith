// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
});
