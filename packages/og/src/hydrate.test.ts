import { describe, expect, it } from "vitest";
import { hydrateBuildCard } from "./hydrate.js";
import { m4a1Build, m4a1Weapon, m4a1Mods } from "./__fixtures__/m4a1-build.js";

describe("hydrateBuildCard", () => {
  it("uses BuildV4.name as title and weapon shortName as subtitle", () => {
    const vm = hydrateBuildCard({ build: m4a1Build, weapon: m4a1Weapon, mods: m4a1Mods });
    expect(vm.title).toBe("RECOIL KING");
    expect(vm.subtitle).toBe("M4A1");
  });

  it("falls back to weapon shortName when BuildV4.name is empty", () => {
    const vm = hydrateBuildCard({
      build: { ...m4a1Build, name: "" },
      weapon: m4a1Weapon,
      mods: m4a1Mods,
    });
    expect(vm.title).toBe("M4A1");
    expect(vm.subtitle).toBeNull();
  });

  it("counts attachments", () => {
    const vm = hydrateBuildCard({ build: m4a1Build, weapon: m4a1Weapon, mods: m4a1Mods });
    expect(vm.modCount).toBe(4);
  });

  it("sums buyFor prices to priceRub", () => {
    const vm = hydrateBuildCard({ build: m4a1Build, weapon: m4a1Weapon, mods: m4a1Mods });
    expect(vm.priceRub).toBe(12_000 + 42_000 + 36_000 + 28_000);
  });

  it("returns null priceRub when any mod is missing buyFor", () => {
    const mods = m4a1Mods.map((m, i) => (i === 0 ? { ...m, buyFor: [] } : m));
    const vm = hydrateBuildCard({ build: m4a1Build, weapon: m4a1Weapon, mods });
    expect(vm.priceRub).toBeNull();
  });

  it("computes stats via weaponSpec aggregation", () => {
    const vm = hydrateBuildCard({ build: m4a1Build, weapon: m4a1Weapon, mods: m4a1Mods });
    expect(vm.stats.ergo).toBeGreaterThan(40);
    expect(vm.stats.ergo).toBeLessThan(100);
    expect(vm.stats.recoilV).toBeGreaterThan(0);
    expect(vm.stats.recoilV).toBeLessThan(120);
    expect(vm.stats.weight).toBeCloseTo(0.07 + 0.32 + 0.61 + 0.4, 2);
  });

  it("sets availability to FLEA by default (no profileSnapshot)", () => {
    const vm = hydrateBuildCard({ build: m4a1Build, weapon: m4a1Weapon, mods: m4a1Mods });
    expect(vm.availability).toBe("FLEA");
  });
});
