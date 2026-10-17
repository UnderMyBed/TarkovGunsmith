// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { WeaponListItem } from "@tarkov/data";
import { WeaponPanel, type WeaponPanelProps } from "./weapon-panel.js";
import type { WeaponOption } from "./useBuilderState.js";

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
});
