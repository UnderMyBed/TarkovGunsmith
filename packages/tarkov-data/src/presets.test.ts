import { describe, expect, it } from "vitest";
import { WEAPON_PRESETS, presetsForWeapon, type WeaponPreset } from "./presets.js";

describe("presetsForWeapon", () => {
  it("returns an empty array for an unknown weapon", () => {
    expect(presetsForWeapon("does-not-exist")).toEqual([]);
  });

  it("is a stable reference (same array identity across calls)", () => {
    const a = presetsForWeapon("x");
    const b = presetsForWeapon("x");
    expect(a).toBe(b);
  });
});

describe("WEAPON_PRESETS invariants", () => {
  it("every preset has a non-empty name", () => {
    const all: WeaponPreset[] = Object.values(WEAPON_PRESETS).flat();
    for (const preset of all) {
      expect(preset.name.length).toBeGreaterThan(0);
    }
  });

  it("every preset's attachment values are non-empty strings", () => {
    const all: WeaponPreset[] = Object.values(WEAPON_PRESETS).flat();
    for (const preset of all) {
      for (const value of Object.values(preset.attachments)) {
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });
});
