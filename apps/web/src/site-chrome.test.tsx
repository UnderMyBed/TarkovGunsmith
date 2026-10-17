// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SiteChromeProvider, useWorkbenchChrome, useWorkbenchMounted } from "./site-chrome.js";

afterEach(() => cleanup());

function Flag() {
  return <p>{useWorkbenchMounted() ? "workbench" : "masthead"}</p>;
}

function Workbench() {
  useWorkbenchChrome();
  return null;
}

function Shell({ benches }: { benches: readonly string[] }) {
  return (
    <SiteChromeProvider>
      <Flag />
      {benches.map((key) => (
        <Workbench key={key} />
      ))}
    </SiteChromeProvider>
  );
}

describe("site chrome", () => {
  it("shows the masthead with no workbench mounted", () => {
    render(<Shell benches={[]} />);
    expect(screen.getByText("masthead")).toBeInTheDocument();
  });

  it("drops the masthead while a workbench is mounted and restores it once it unmounts", () => {
    const { rerender } = render(<Shell benches={["a"]} />);
    expect(screen.getByText("workbench")).toBeInTheDocument();
    rerender(<Shell benches={[]} />);
    expect(screen.getByText("masthead")).toBeInTheDocument();
  });

  it("stays a workbench when one workbench replaces another, and counts both away", () => {
    const { rerender } = render(<Shell benches={["a"]} />);
    // A remount keyed on a new build: the old one unmounts as the new one mounts.
    rerender(<Shell benches={["b"]} />);
    expect(screen.getByText("workbench")).toBeInTheDocument();
    rerender(<Shell benches={["b", "c"]} />);
    rerender(<Shell benches={["c"]} />);
    expect(screen.getByText("workbench")).toBeInTheDocument();
    rerender(<Shell benches={[]} />);
    expect(screen.getByText("masthead")).toBeInTheDocument();
  });

  it("reads as no workbench, and mounts nothing, outside a provider", () => {
    render(
      <>
        <Flag />
        <Workbench />
      </>,
    );
    expect(screen.getByText("masthead")).toBeInTheDocument();
  });
});
