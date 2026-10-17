// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { weaponSpec } from "@tarkov/ballistics";
import type { BallisticMod, BallisticWeapon } from "@tarkov/ballistics";
import type { MountedMagazine } from "@tarkov/data";
import { SpecPanel, signedPercent } from "./spec-panel.js";

afterEach(() => cleanup());

// Live json.tarkov.dev values (2026-10-17) for the named ids.
const M4A1: BallisticWeapon = {
  id: "5447a9cd4bdc2dbd208b4567",
  name: "Colt M4A1 5.56x45 assault rifle",
  baseErgonomics: 48,
  baseVerticalRecoil: 119,
  baseHorizontalRecoil: 342,
  baseWeight: 0.75,
  centerOfImpact: 0.01,
  deviationCurve: 1.35,
  velocity: 0,
  fireRate: 800,
  effectiveDistance: 500,
  sightingRange: 100,
  defaultAmmo: { name: "M855", initialSpeed: 922 },
};

// AR-15 5.56x45 10.3 inch barrel (55d35ee94bdc2d61338b4568).
const BARREL_10_3: BallisticMod = {
  id: "55d35ee94bdc2d61338b4568",
  name: "AR-15 5.56x45 10.3 inch barrel",
  ergonomicsDelta: -2,
  recoilModifier: -0.052000000000000005,
  weight: 0.409,
  accuracyModifier: 0,
  centerOfImpact: 0.07,
  deviationMax: 22,
  velocity: -11,
  sightingRange: null,
};

// AR-15 Vendetta Precision VP-09 Interceptor muzzle brake (5a7c147ce899ef00150bd8b8).
const VP09: BallisticMod = {
  id: "5a7c147ce899ef00150bd8b8",
  name: "VP-09",
  ergonomicsDelta: -2,
  recoilModifier: -0.085,
  weight: 0.2,
  accuracyModifier: 0.04,
  centerOfImpact: 0,
  deviationMax: null,
  velocity: 0,
  sightingRange: null,
};

// Leupold Mark 4 HAMR 4x24 (544a3a774bdc2d3a388b4567).
const HAMR: BallisticMod = {
  id: "544a3a774bdc2d3a388b4567",
  name: "HAMR",
  ergonomicsDelta: -3.5,
  recoilModifier: 0,
  weight: 0.411,
  accuracyModifier: 0,
  centerOfImpact: 0,
  deviationMax: null,
  velocity: 0,
  sightingRange: 800,
};

// AR-15 5.56x45 Colt STANAG 30-round magazine (55d4887d4bdc2d962f8b4570).
const STANAG: MountedMagazine = {
  id: "55d4887d4bdc2d962f8b4570",
  name: "AR-15 5.56x45 Colt STANAG 30-round magazine",
  capacity: 30,
  loadModifier: 0,
  malfunctionChance: 0.08,
};

function stat(label: string): HTMLElement {
  const term = screen.getByText(label, { selector: "dt" });
  return term.parentElement!;
}

describe("SpecPanel", () => {
  it("shows MOA with its base and the accuracy modifier", () => {
    render(
      <SpecPanel
        weaponShortName="M4A1"
        spec={weaponSpec(M4A1, [BARREL_10_3, VP09])}
        magazine={STANAG}
      />,
    );
    // 2.750228 base × (1 − 0.04).
    expect(within(stat("Accuracy")).getByText("2.64 MOA")).toBeInTheDocument();
    expect(within(stat("Accuracy")).getByText("base 2.75 · accuracy +4%")).toBeInTheDocument();
  });

  it("names the default ammo the muzzle velocity is computed for", () => {
    render(
      <SpecPanel weaponShortName="M4A1" spec={weaponSpec(M4A1, [BARREL_10_3])} magazine={STANAG} />,
    );
    // 922 × (1 − 0.11) = 820.58.
    expect(within(stat("Muzzle velocity")).getByText("821 m/s")).toBeInTheDocument();
    expect(within(stat("Muzzle velocity")).getByText("M855 · −11%")).toBeInTheDocument();
  });

  it("shows only the velocity modifier when the weapon has no default ammo", () => {
    render(
      <SpecPanel
        weaponShortName="M4A1"
        spec={weaponSpec({ ...M4A1, defaultAmmo: null }, [BARREL_10_3])}
        magazine={STANAG}
      />,
    );
    expect(within(stat("Muzzle velocity")).getByText("−11%")).toBeInTheDocument();
  });

  it("labels ranges in metres and fire rate in rounds per minute", () => {
    render(<SpecPanel weaponShortName="M4A1" spec={weaponSpec(M4A1, [HAMR])} magazine={STANAG} />);
    expect(within(stat("Effective distance")).getByText("500 m")).toBeInTheDocument();
    expect(within(stat("Sighting range")).getByText("800 m")).toBeInTheDocument();
    expect(within(stat("Fire rate")).getByText("800 rpm")).toBeInTheDocument();
  });

  it("shows the mounted magazine's capacity, load modifier and malfunction chance", () => {
    render(<SpecPanel weaponShortName="M4A1" spec={weaponSpec(M4A1, [])} magazine={STANAG} />);
    expect(within(stat("Capacity")).getByText("30 rds")).toBeInTheDocument();
    expect(within(stat("Load/unload modifier")).getByText("0%")).toBeInTheDocument();
    expect(within(stat("Malfunction chance")).getByText("8%")).toBeInTheDocument();
  });

  it("says when no magazine is fitted", () => {
    render(<SpecPanel weaponShortName="M4A1" spec={weaponSpec(M4A1, [])} magazine={null} />);
    expect(screen.getByText("None fitted.")).toBeInTheDocument();
    expect(screen.queryByText("Capacity")).not.toBeInTheDocument();
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
