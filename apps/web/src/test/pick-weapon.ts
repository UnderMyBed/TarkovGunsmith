import "@testing-library/jest-dom/vitest";
import { expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";

/** The workbench's weapon picker: the combobox labelled "Weapon". */
export function weaponCombobox(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("combobox", { name: "Weapon" });
}

/**
 * Wait for the weapon picker to load, open it, and pick the option named `name` (the route
 * fixtures' one weapon, the M4A1, by default).
 */
export async function pickWeapon(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp = /M4A1/,
): Promise<void> {
  const input = await screen.findByRole("combobox", { name: "Weapon" });
  await waitFor(() => expect(input).not.toBeDisabled());
  await user.click(input);
  await user.click(screen.getByRole("option", { name }));
}
