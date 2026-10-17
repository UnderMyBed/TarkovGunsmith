// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { OptimizationResult } from "@tarkov/optimizer";
import { OptimizeOutcome, type OptimizationFailure } from "./optimize-outcome.js";

afterEach(() => cleanup());

const NAMES: Record<string, string> = { "h-old": "Part h-old", "m-old": "Part m-old" };

function renderOutcome(
  failure: OptimizationFailure | null,
  options: {
    error?: Error;
    theorycraft?: boolean;
    pinnedSlots?: ReadonlyMap<string, string | null>;
  } = {},
) {
  const handlers = {
    onRunWithoutBudget: vi.fn(),
    onUnpin: vi.fn(),
    onEditProfile: vi.fn(),
    onBack: vi.fn(),
    onRunAgain: vi.fn(),
  };
  render(
    <OptimizeOutcome
      failure={failure}
      error={options.error}
      theorycraft={options.theorycraft ?? false}
      pinnedSlots={options.pinnedSlots ?? new Map()}
      nameOf={(id) => NAMES[id] ?? id}
      timeoutMs={2000}
      {...handlers}
    />,
  );
  return { alert: screen.getByRole("alert"), ...handlers };
}

describe("OptimizeOutcome", () => {
  it("shows what the solver threw, and runs again", () => {
    const { alert, onRunAgain } = renderOutcome(null, {
      error: new Error("the slot graph has a cycle through loop"),
    });
    expect(alert).toHaveTextContent("Optimizer stopped");
    expect(alert).toHaveTextContent("the slot graph has a cycle through loop");
    fireEvent.click(within(alert).getByRole("button", { name: "Run again" }));
    expect(onRunAgain).toHaveBeenCalledTimes(1);
  });

  it("dismisses a timeout back to the form", () => {
    const { alert, onBack } = renderOutcome({ ok: false, reason: "timeout" });
    fireEvent.click(within(alert).getByRole("button", { name: "Dismiss" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("unpins every pin a build needs gone, together", () => {
    const { alert, onUnpin } = renderOutcome(
      {
        ok: false,
        reason: "pin-conflict",
        paths: ["handguard", "muzzle"],
        message:
          "No complete build keeps every pin. Unpin Part h-old, Part m-old and run it again.",
      },
      {
        pinnedSlots: new Map([
          ["muzzle", "m-old"],
          ["handguard", "h-old"],
        ]),
      },
    );
    expect(alert).toHaveTextContent("Pins clash");
    expect(alert).toHaveTextContent("Unpin all of them.");
    fireEvent.click(within(alert).getByRole("button", { name: "Unpin Part h-old, Part m-old" }));
    expect(onUnpin).toHaveBeenCalledWith(["handguard", "muzzle"]);
  });

  for (const [reason, heading, hint] of [
    [
      "weapon-unavailable",
      "Weapon out of reach",
      "Raise trader levels or turn on the flea in your profile, or switch to theorycraft.",
    ],
    [
      "required-slot",
      "Required slot empty",
      "Raise trader levels or turn on the flea to reach a part for it, or switch to theorycraft.",
    ],
    [
      "no-valid-combinations",
      "No build fits together",
      "Change the profile to reach other parts, or pick another weapon.",
    ],
  ] as const) {
    const message = `The solver's own words for ${reason}.`;
    const failure = (reason === "required-slot"
      ? { ok: false, reason, slotPath: "handguard", message }
      : { ok: false, reason, message }) as OptimizationResult as OptimizationFailure;

    it(`${reason}: shows the solver's reason and opens the progression`, () => {
      const { alert, onEditProfile } = renderOutcome(failure);
      expect(alert).toHaveTextContent(heading);
      expect(alert).toHaveTextContent(message);
      expect(alert).toHaveTextContent(hint);
      fireEvent.click(within(alert).getByRole("button", { name: "Edit progression" }));
      expect(onEditProfile).toHaveBeenCalledTimes(1);
    });

    it(`${reason} in theorycraft: points past the profile`, () => {
      const { alert } = renderOutcome(failure, { theorycraft: true });
      expect(alert).toHaveTextContent("Pick another weapon.");
      expect(within(alert).queryByRole("button", { name: "Edit progression" })).toBeNull();
    });
  }
});
