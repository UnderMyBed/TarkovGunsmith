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
  currentRecoil: -5,
  currentPrice: 10_000,
  proposedErgo: 3,
  proposedRecoil: -9,
  proposedPrice: 22_000,
  ergoDelta: 1,
  recoilDelta: -4,
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
    expect(screen.getByText(/RUN THE SOLVER/)).toBeInTheDocument();
  });

  it("renders rows and reflects ACCEPT SELECTED (N) count from selected set", () => {
    const rows = [row({ slotId: "muzzle" }), row({ slotId: "handguard", slotLabel: "HANDGUARD" })];
    render(
      <ModChangesTable
        rows={rows}
        selected={new Set(["muzzle"])}
        onToggle={vi.fn()}
        onAcceptAll={vi.fn()}
        onAcceptSelected={vi.fn()}
        onDiscard={vi.fn()}
        scoreDelta={-3.04}
        mode="result"
        unchangedCount={12}
      />,
    );
    expect(screen.getByRole("button", { name: /ACCEPT SELECTED \(1\)/ })).toBeEnabled();
    expect(screen.getByText(/2 SLOTS CHANGED/)).toBeInTheDocument();
    expect(screen.getByText(/12 SLOTS UNCHANGED/)).toBeInTheDocument();
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
        scoreDelta={0}
        mode="result"
        unchangedCount={0}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Accept MUZZLE/ }));
    expect(onToggle).toHaveBeenCalledWith("muzzle");
  });

  it("disables ACCEPT SELECTED when selected is empty", () => {
    render(
      <ModChangesTable
        rows={[row()]}
        selected={new Set()}
        onToggle={vi.fn()}
        onAcceptAll={vi.fn()}
        onAcceptSelected={vi.fn()}
        onDiscard={vi.fn()}
        scoreDelta={0}
        mode="result"
        unchangedCount={0}
      />,
    );
    expect(screen.getByRole("button", { name: /ACCEPT SELECTED \(0\)/ })).toBeDisabled();
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
        scoreDelta={0}
        mode="result"
        unchangedCount={14}
      />,
    );
    expect(screen.getByText(/NO IMPROVEMENTS FOUND/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ACCEPT ALL/ })).toBeDisabled();
  });
});
