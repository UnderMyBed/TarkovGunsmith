// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ModChangesTable } from "./mod-changes-table.js";
import type { ChangedRow } from "./slot-diff.js";

afterEach(() => cleanup());

const row = (overrides: Partial<ChangedRow> = {}): ChangedRow => ({
  slotId: "muzzle",
  slotLabel: "MUZZLE",
  currentName: "Old Muzzle",
  proposedName: "New Muzzle",
  currentErgo: 2,
  // Recoil values are upstream's fractions, not percents.
  currentRecoil: -0.05,
  currentPrice: 10_000,
  proposedErgo: 3,
  proposedRecoil: -0.09,
  proposedPrice: 22_000,
  ergoDelta: 1,
  recoilDelta: -0.04,
  priceDelta: 12_000,
  ...overrides,
});

describe("ModChangesTable", () => {
  it("renders idle empty state when rows is empty and running=false", () => {
    render(
      <ModChangesTable
        rows={[]}
        selected={new Set()}
        onToggle={vi.fn()}
        onAcceptAll={vi.fn()}
        onAcceptSelected={vi.fn()}
        onDiscard={vi.fn()}
        scoreDelta={null}
        mode="idle"
        unchangedCount={0}
      />,
    );
    expect(screen.getByText(/Run the solver/)).toBeInTheDocument();
  });

  it("renders rows and reflects Accept selected (N) count from selected set", () => {
    const rows = [row({ slotId: "muzzle" }), row({ slotId: "handguard", slotLabel: "HANDGUARD" })];
    render(
      <ModChangesTable
        rows={rows}
        selected={new Set(["muzzle"])}
        onToggle={vi.fn()}
        onAcceptAll={vi.fn()}
        onAcceptSelected={vi.fn()}
        onDiscard={vi.fn()}
        scoreDelta={{ label: "MOA", value: -3.04, digits: 2 }}
        mode="result"
        unchangedCount={12}
      />,
    );
    expect(screen.getByRole("button", { name: /Accept selected \(1\)/ })).toBeEnabled();
    expect(screen.getByText(/2 slots changed/)).toBeInTheDocument();
    expect(screen.getByText(/12 slots unchanged/)).toBeInTheDocument();
  });

  it("toggles a row via the per-row checkbox", () => {
    const onToggle = vi.fn();
    render(
      <ModChangesTable
        rows={[row()]}
        selected={new Set(["muzzle"])}
        onToggle={onToggle}
        onAcceptAll={vi.fn()}
        onAcceptSelected={vi.fn()}
        onDiscard={vi.fn()}
        scoreDelta={{ label: "Ergo", value: 0, digits: 0 }}
        mode="result"
        unchangedCount={0}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Accept MUZZLE/ }));
    expect(onToggle).toHaveBeenCalledWith("muzzle");
  });

  it("disables Accept selected when selected is empty", () => {
    render(
      <ModChangesTable
        rows={[row()]}
        selected={new Set()}
        onToggle={vi.fn()}
        onAcceptAll={vi.fn()}
        onAcceptSelected={vi.fn()}
        onDiscard={vi.fn()}
        scoreDelta={{ label: "Ergo", value: 0, digits: 0 }}
        mode="result"
        unchangedCount={0}
      />,
    );
    expect(screen.getByRole("button", { name: /Accept selected \(0\)/ })).toBeDisabled();
  });

  it("renders zero-change state when mode='result' and rows is empty", () => {
    render(
      <ModChangesTable
        rows={[]}
        selected={new Set()}
        onToggle={vi.fn()}
        onAcceptAll={vi.fn()}
        onAcceptSelected={vi.fn()}
        onDiscard={vi.fn()}
        scoreDelta={{ label: "Ergo", value: 0, digits: 0 }}
        mode="result"
        unchangedCount={14}
      />,
    );
    expect(screen.getByText(/No improvements found/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Accept all/ })).toBeDisabled();
  });

  it("renders the recoil delta as a percentage, not a rounded-to-zero fraction", () => {
    // Regression: recoilDelta is a fraction, and rendering it through a
    // 0-decimal formatter turned every changed row into "−0" — the column was
    // dead on every real build.
    render(
      <ModChangesTable
        rows={[row({ recoilDelta: -0.225 })]}
        selected={new Set()}
        onToggle={vi.fn()}
        onAcceptAll={vi.fn()}
        onAcceptSelected={vi.fn()}
        onDiscard={vi.fn()}
        scoreDelta={{ label: "Recoil V+H", value: -30, digits: 0 }}
        mode="result"
        unchangedCount={0}
      />,
    );
    expect(screen.getByText("−22.5")).toBeInTheDocument();
    expect(screen.queryByText("−0")).not.toBeInTheDocument();
  });

  it("labels the score delta with the stat the run optimised", () => {
    render(
      <ModChangesTable
        rows={[row({})]}
        selected={new Set()}
        onToggle={vi.fn()}
        onAcceptAll={vi.fn()}
        onAcceptSelected={vi.fn()}
        onDiscard={vi.fn()}
        scoreDelta={{ label: "Weight kg", value: 0.125, digits: 2 }}
        mode="result"
        unchangedCount={0}
      />,
    );
    expect(screen.getByText(/Weight kg Δ/)).toHaveTextContent("Weight kg Δ · +0.13");
  });
});
