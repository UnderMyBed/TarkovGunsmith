// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderRoute } from "../test/render-route.js";

afterEach(() => cleanup());

describe("/builder/compare", () => {
  it("mounts CompareWorkspace with a blank draft (both sides empty)", async () => {
    await renderRoute("/builder/compare");

    // CompareToolbar for a pairId-less draft: "Save comparison" (not "Save changes"),
    // and no "Save as new" button (that only appears once a pairId exists).
    expect(await screen.findByRole("button", { name: "Save comparison" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save as new" })).not.toBeInTheDocument();

    // Both CompareSide columns render for an empty draft.
    expect(await screen.findByText(/Build A/)).toBeInTheDocument();
    expect(screen.getByText(/Build B/)).toBeInTheDocument();
    expect(screen.getAllByText("No build selected.")).toHaveLength(2);
  });
});
