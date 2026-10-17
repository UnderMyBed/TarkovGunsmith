// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { weaponSpec, type WeaponSpec } from "@tarkov/ballistics";
import type { MountedMagazine } from "@tarkov/data";
import { BARREL_10_3, HAMR, M4A1, STANAG } from "../../test/weapon-fixtures.js";
import { DetailsPanel, signedPercent, type DetailsPanelProps } from "./details-panel.js";

afterEach(() => cleanup());

function renderPanel(
  spec: WeaponSpec | null,
  magazine: MountedMagazine | null,
  extra: Partial<DetailsPanelProps> = {},
) {
  const props: DetailsPanelProps = {
    name: "",
    description: "",
    onNameChange: vi.fn(),
    onDescriptionChange: vi.fn(),
    spec,
    magazine,
    dataAsOf: null,
    prices: { state: "loading" },
    ...extra,
  };
  render(<DetailsPanel {...props} />);
  return props;
}

/** A stat's value: the `<dd>` after its `<dt>`. */
const stat = (label: string) =>
  screen.getByText(label, { selector: "dt" }).nextElementSibling as HTMLElement;

describe("DetailsPanel", () => {
  it("names the default ammo the muzzle velocity is computed for", () => {
    renderPanel(weaponSpec(M4A1, [BARREL_10_3]), STANAG);
    expect(stat("Muzzle velocity")).toHaveTextContent("821 m/s");
    expect(stat("Muzzle velocity").nextElementSibling).toHaveTextContent("M855 · −11%");
  });

  it("shows only the velocity modifier when the weapon has no default ammo", () => {
    renderPanel(weaponSpec({ ...M4A1, defaultAmmo: null }, [BARREL_10_3]), STANAG);
    expect(stat("Muzzle velocity")).toHaveTextContent(/^−11%$/);
  });

  it("labels ranges in metres, fire rate in rounds per minute, and counts the mods", () => {
    renderPanel(weaponSpec(M4A1, [HAMR]), STANAG);
    expect(stat("Effective distance")).toHaveTextContent("500 m");
    expect(stat("Sighting range")).toHaveTextContent("800 m");
    expect(stat("Fire rate")).toHaveTextContent("800 rpm");
    expect(stat("Mods attached")).toHaveTextContent(/^1$/);
  });

  it("shows the mounted magazine's capacity, load modifier and malfunction chance", () => {
    renderPanel(weaponSpec(M4A1, []), STANAG);
    expect(stat("Capacity")).toHaveTextContent("30 rds");
    expect(stat("Load/unload modifier")).toHaveTextContent("0%");
    expect(stat("Malfunction chance")).toHaveTextContent("8%");
  });

  it("says when no magazine is fitted", () => {
    renderPanel(weaponSpec(M4A1, []), null);
    expect(stat("Magazine")).toHaveTextContent("None fitted");
    expect(screen.queryByText("Capacity")).not.toBeInTheDocument();
  });

  it("shows no stats before a weapon is picked, but keeps the name and notes", () => {
    renderPanel(null, null);
    expect(screen.queryByText("Fire rate")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Build name")).toBeInTheDocument();
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
  });

  it("keeps the name to 60 characters and the notes to 280, reporting each edit", async () => {
    const user = userEvent.setup();
    const props = renderPanel(null, null);
    expect(screen.getByLabelText("Build name")).toHaveAttribute("maxLength", "60");
    expect(screen.getByLabelText("Notes")).toHaveAttribute("maxLength", "280");
    await user.type(screen.getByLabelText("Build name"), "A");
    expect(props.onNameChange).toHaveBeenCalledWith("A");
    await user.type(screen.getByLabelText("Notes"), "B");
    expect(props.onDescriptionChange).toHaveBeenCalledWith("B");
  });

  it("offers the progression snapshot only when asked to", async () => {
    const onChange = vi.fn();
    renderPanel(null, null, { embedProfile: { checked: false, onChange } });
    await userEvent.setup().click(screen.getByLabelText(/Embed my progression snapshot/));
    expect(onChange).toHaveBeenCalledWith(true);
    cleanup();
    renderPanel(null, null);
    expect(screen.queryByLabelText(/Embed my progression snapshot/)).not.toBeInTheDocument();
  });

  it("asks before New build discards the build", async () => {
    const user = userEvent.setup();
    const onNewBuild = vi.fn();
    renderPanel(null, null, { onNewBuild });
    await user.click(screen.getByRole("button", { name: "New build" }));
    await user.click(screen.getByRole("button", { name: "Keep this build" }));
    expect(onNewBuild).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New build" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Discard this build and start a new one?");
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onNewBuild).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("dates the game data once it has loaded", () => {
    renderPanel(null, null, { dataAsOf: "2026-10-16T12:00:00Z" });
    expect(screen.getByText(/Data as of/)).toHaveTextContent("Data as of 16 Oct 2026");
  });
});

describe("signedPercent", () => {
  it("signs with a true minus and drops a trailing .0", () => {
    expect(signedPercent(16)).toBe("+16%");
    expect(signedPercent(-10.3)).toBe("−10.3%");
    expect(signedPercent(-0.04)).toBe("0%");
    expect(signedPercent(0)).toBe("0%");
  });
});
