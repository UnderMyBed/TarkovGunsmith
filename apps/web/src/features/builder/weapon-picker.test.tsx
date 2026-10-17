// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BuilderMode } from "@tarkov/data";
import type { WeaponOption } from "./useBuilderState.js";
import { WeaponPicker } from "./weapon-picker.js";

afterEach(() => cleanup());

const weapon = (id: string, name: string, lockedBy: WeaponOption["lockedBy"] = null) =>
  ({ id, name, lockedBy }) as WeaponOption;

const OPTIONS: WeaponOption[] = [
  weapon("w-m4a1", "Colt M4A1 5.56x45 assault rifle"),
  weapon("w-ak74", "Kalashnikov AK-74N 5.45x39 assault rifle"),
  weapon("w-mdr", "Desert Tech MDR 7.62x51 assault rifle", {
    available: false,
    reason: "trader-ll-required",
    traderNormalizedName: "peacekeeper",
    minLevel: 4,
    payment: "cash",
  } as WeaponOption["lockedBy"]),
];

function renderPicker(
  mode: BuilderMode,
  over: Partial<{ isLoading: boolean; weaponOptions: WeaponOption[]; weaponId: string }> = {},
) {
  const onWeaponChange = vi.fn();
  render(
    <WeaponPicker
      isLoading={over.isLoading ?? false}
      weaponOptions={over.weaponOptions ?? OPTIONS}
      weaponId={over.weaponId ?? ""}
      onWeaponChange={onWeaponChange}
      mode={mode}
    />,
  );
  return onWeaponChange;
}

const input = () => screen.getByRole("combobox", { name: "Weapon" });

describe("WeaponPicker", () => {
  it("counts every weapon in theorycraft", async () => {
    renderPicker("theorycraft", { weaponOptions: OPTIONS.slice(0, 2) });
    await userEvent.setup().click(input());
    expect(screen.getByText("2 weapons")).toBeInTheDocument();
  });

  it("counts the weapons the profile can get in progression, and says what locks the rest", async () => {
    renderPicker("progression", { weaponId: "w-mdr" });
    await userEvent.setup().click(input());
    expect(screen.getByText("2 weapons available on your profile")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Desert Tech MDR/ })).toHaveTextContent(
      "Locked · Peacekeeper LL4",
    );
  });

  it("filters as the user types, and picks with the keyboard", async () => {
    const user = userEvent.setup();
    const onWeaponChange = renderPicker("theorycraft");
    await user.type(input(), "kalash");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onWeaponChange).toHaveBeenCalledWith("w-ak74");
  });

  it("shows the weapon on screen by name", () => {
    renderPicker("theorycraft", { weaponId: "w-m4a1" });
    expect(input()).toHaveValue("Colt M4A1 5.56x45 assault rifle");
  });

  it("waits, disabled, while the weapons load", () => {
    renderPicker("theorycraft", { isLoading: true, weaponOptions: [] });
    expect(input()).toBeDisabled();
    expect(input()).toHaveAttribute("placeholder", "Loading weapons…");
  });
});
