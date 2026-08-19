import { describe, expect, it } from "vitest";
import { hydrateBuildCard } from "./hydrate.js";
import { m4a1Build, m4a1Weapon, m4a1Mods } from "./__fixtures__/m4a1-build.js";

describe("hydrateBuildCard", () => {
  it("uses BuildV5.name as title and weapon shortName as subtitle", () => {
    const vm = hydrateBuildCard({ build: m4a1Build, weapon: m4a1Weapon, mods: m4a1Mods });
    expect(vm.title).toBe("RECOIL KING");
    expect(vm.subtitle).toBe("M4A1");
  });

  it("falls back to weapon shortName when BuildV5.name is empty", () => {
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
    expect(vm.modCount).toBe(3);
  });

  it("sums buyFor prices to priceRub", () => {
    const vm = hydrateBuildCard({ build: m4a1Build, weapon: m4a1Weapon, mods: m4a1Mods });
    expect(vm.priceRub).toBe(12_000 + 42_000 + 36_000);
  });

  it("returns null priceRub when any mod is missing buyFor", () => {
    const mods = m4a1Mods.map((m, i) => (i === 0 ? { ...m, buyFor: [] } : m));
    const vm = hydrateBuildCard({ build: m4a1Build, weapon: m4a1Weapon, mods });
    expect(vm.priceRub).toBeNull();
  });

  it("computes stats via weaponSpec aggregation", () => {
    const vm = hydrateBuildCard({ build: m4a1Build, weapon: m4a1Weapon, mods: m4a1Mods });
    // 48 + 15 + 8 + 7 = 78
    expect(vm.stats.ergo).toBe(78);
    // Recoil sum is -0.23 + -0.225 + -0.04 = -0.495, so 119 * 0.505 = 60.095.
    // Pinned exactly rather than range-checked: the loose `< 120` bound here
    // passed happily while the card was rendering 118.4 for a -49.5% build.
    expect(vm.stats.recoilV).toBeCloseTo(60.095, 3);
    expect(vm.stats.recoilH).toBeCloseTo(342 * 0.505, 3);
    expect(vm.stats.weight).toBeCloseTo(0.499 + 0.61 + 0.246, 5);
    // No mod here carries a non-zero accuracyModifier, so the card shows the
    // Builder's fabricated baseline unchanged rather than a dead 0.
    expect(vm.stats.accuracy).toBeCloseTo(3.5, 5);
  });

  it("sets availability to FLEA by default (no profileSnapshot)", () => {
    const vm = hydrateBuildCard({ build: m4a1Build, weapon: m4a1Weapon, mods: m4a1Mods });
    expect(vm.availability).toBe("FLEA");
  });
});
