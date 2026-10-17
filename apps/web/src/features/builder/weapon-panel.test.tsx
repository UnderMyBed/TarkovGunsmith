// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { WeaponListItem } from "@tarkov/data";
import { WeaponPanel, type WeaponPanelProps } from "./weapon-panel.js";
import type { WeaponOption } from "./useBuilderState.js";
import { shareBlockedReason } from "./useShareBuild.js";

afterEach(() => cleanup());

const M4A1 = "5447a9cd4bdc2dbd208b4567";

function option(id: string, name: string, lockedBy: WeaponOption["lockedBy"]): WeaponOption {
  return { ...({ id, name } as unknown as WeaponListItem), lockedBy };
}

function props(overrides: Partial<WeaponPanelProps> = {}): WeaponPanelProps {
  return {
    isLoading: false,
    weaponOptions: [],
    weaponId: "",
    onWeaponChange: () => {},
    showAllWeapons: false,
    onShowAllWeaponsChange: () => {},
    hasSelectedWeapon: false,
    onShare: () => {},
    isSaving: false,
    saveFailed: false,
    embedProfileOnSave: false,
    onEmbedProfileOnSaveChange: () => {},
    dataAsOf: null,
    prices: { state: "loading" },
    buildPrice: null,
    boughtAs: null,
    nameOf: (id) => id,
    ...overrides,
  };
}

describe("WeaponPanel", () => {
  it("shows a locked current weapon as selected, with what unlocks it", () => {
    render(
      <WeaponPanel
        {...props({
          weaponId: M4A1,
          hasSelectedWeapon: true,
          weaponOptions: [
            option("ak", "AK-74N", null),
            option(M4A1, "Colt M4A1 5.56x45 assault rifle", {
              available: false,
              reason: "trader-ll-required",
              traderNormalizedName: "peacekeeper",
              minLevel: 2,
              payment: "cash",
              preset: null,
            }),
          ],
        })}
      />,
    );
    const select = screen.getByRole("combobox");
    expect(select).toHaveValue(M4A1);
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent(
      "Colt M4A1 5.56x45 assault rifle — LOCKED · peacekeeper LL2",
    );
    // The count is of weapons the profile can obtain; the locked current one is not among them.
    expect(screen.getByText("1 weapons available on your profile")).toBeInTheDocument();
  });

  it("says where prices stand, and shows a cost only once they are in", () => {
    const priced = {
      hasSelectedWeapon: true,
      buildPrice: { status: "priced" as const, totalRUB: 52_999, presetId: "p" },
      boughtAs: "AKM Default",
    };
    const { rerender } = render(<WeaponPanel {...props(priced)} />);
    expect(screen.getByText("Prices loading…")).toBeInTheDocument();
    expect(screen.queryByTestId("build-cost")).not.toBeInTheDocument();

    rerender(
      <WeaponPanel
        {...props({
          ...priced,
          prices: { state: "error", message: "json.tarkov.dev answered 503" },
        })}
      />,
    );
    expect(
      screen.getByText("Prices unavailable: json.tarkov.dev answered 503"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("build-cost")).not.toBeInTheDocument();

    const asOf = "2026-10-17T01:50:29.000Z";
    rerender(<WeaponPanel {...props({ ...priced, prices: { state: "ready", asOf } })} />);
    expect(screen.getByText(/^Prices as of/).querySelector("time")).toHaveAttribute(
      "datetime",
      asOf,
    );
    expect(screen.getByTestId("build-cost")).toHaveTextContent(
      "Build cost₽52,999bought as AKM Default",
    );
  });

  it("names what keeps a build from a total", () => {
    const ready = {
      hasSelectedWeapon: true,
      prices: { state: "ready" as const, asOf: "2026-10-17T01:50:29.000Z" },
    };
    const names: Record<string, string> = { stock: "Phase5 Mini Stock", gun: "AKM" };
    const nameOf = (id: string) => names[id] ?? id;
    const { rerender } = render(
      <WeaponPanel
        {...props({
          ...ready,
          nameOf,
          boughtAs: "AKM Default",
          buildPrice: { status: "unknown", knownRUB: 763_842, unpriced: ["stock"], presetId: "p" },
        })}
      />,
    );
    expect(screen.getByTestId("build-cost")).toHaveTextContent(
      "Build cost₽763,842 known; no price for Phase5 Mini Stockbought as AKM Default",
    );
    rerender(
      <WeaponPanel
        {...props({
          ...ready,
          nameOf,
          boughtAs: null,
          buildPrice: { status: "unobtainable", missing: ["gun"] },
        })}
      />,
    );
    expect(screen.getByTestId("build-cost")).toHaveTextContent("Build costCan't be bought: AKM");
  });

  it("refuses to share a build holding more orphans than a saved build may carry, saying why", () => {
    const orphans = (n: number) => Array.from({ length: n }, (_, i) => `gone-${i}`);
    expect(shareBlockedReason({ orphaned: orphans(64) })).toBeNull();
    const reason = shareBlockedReason({ orphaned: orphans(65) });
    expect(reason).toBe("Dismiss orphaned parts to share this build");

    render(<WeaponPanel {...props({ hasSelectedWeapon: true, shareBlocked: reason })} />);
    expect(screen.getByRole("button", { name: "Share build" })).toBeDisabled();
    expect(screen.getByText("Dismiss orphaned parts to share this build")).toBeInTheDocument();
  });
});
