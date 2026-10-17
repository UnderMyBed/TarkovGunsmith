// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPage } from "../../test/render-page.js";
import { WorkbenchBar, type WorkbenchBarProps } from "./workbench-bar.js";

afterEach(() => cleanup());

const SHARE: NonNullable<WorkbenchBarProps["share"]> = {
  onShare: vi.fn(),
  isSaving: false,
  saveFailed: false,
  blocked: null,
  sharedId: null,
};

async function renderBar(props: Partial<WorkbenchBarProps> = {}) {
  await renderPage(<WorkbenchBar picker={<p>picker</p>} {...props} />);
}

describe("WorkbenchBar", () => {
  it("leads with the wordmark, home, then the picker and mode switch", async () => {
    await renderBar({ modeSwitch: <p>mode</p> });
    expect(screen.getByRole("link", { name: "TarkovGunsmith" })).toHaveAttribute("href", "/");
    expect(screen.getByText("picker")).toBeInTheDocument();
    expect(screen.getByText("mode")).toBeInTheDocument();
  });

  it("links to Compare with no build, and offers no Share", async () => {
    await renderBar();
    expect(screen.getByRole("link", { name: "Compare" })).toHaveAttribute(
      "href",
      "/builder/compare",
    );
    expect(screen.queryByRole("button", { name: "Share build" })).not.toBeInTheDocument();
  });

  it("hands the build to Compare, and shares it", async () => {
    const user = userEvent.setup();
    const onCompare = vi.fn();
    const onShare = vi.fn();
    await renderBar({ onCompare, share: { ...SHARE, onShare } });
    await user.click(screen.getByRole("button", { name: "Compare" }));
    await user.click(screen.getByRole("button", { name: "Share build" }));
    expect(onCompare).toHaveBeenCalledOnce();
    expect(onShare).toHaveBeenCalledOnce();
  });

  it("holds Share while saving, and stamps the build once shared", async () => {
    await renderBar({ share: { ...SHARE, isSaving: true, sharedId: "abcdefgh" } });
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByText("Shared")).toBeInTheDocument();
  });

  it("says why a build cannot be shared, and when a save failed", async () => {
    await renderBar({ share: { ...SHARE, blocked: "Remove the clashing parts first." } });
    expect(screen.getByRole("button", { name: "Share build" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Remove the clashing parts first.");
    cleanup();
    await renderBar({ share: { ...SHARE, saveFailed: true } });
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save the build. Share it again.");
  });
});
