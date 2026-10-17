import { describe, expect, it } from "vitest";
import { hydrateBuildCard, hydratePairCard } from "./hydrate.js";
import type { HydrateBuildArgs, HydrateSideArgs } from "./hydrate.js";
import { m4a1Build, m4a1Weapon, m4a1Mods } from "./__fixtures__/m4a1-build.js";

const args: HydrateBuildArgs = {
  build: m4a1Build,
  weapon: m4a1Weapon,
  mods: m4a1Mods,
  priceRub: null,
};

describe("hydrateBuildCard", () => {
  it("uses BuildV6.name as title and weapon shortName as subtitle", () => {
    const vm = hydrateBuildCard(args);
    expect(vm.title).toBe("RECOIL KING");
    expect(vm.subtitle).toBe("M4A1");
  });

  it("falls back to weapon shortName when BuildV6.name is empty", () => {
    const vm = hydrateBuildCard({
      build: { ...m4a1Build, name: "" },
      weapon: m4a1Weapon,
      mods: m4a1Mods,
      priceRub: null,
    });
    expect(vm.title).toBe("M4A1");
    expect(vm.subtitle).toBeNull();
  });

  it("counts attachments", () => {
    const vm = hydrateBuildCard(args);
    expect(vm.modCount).toBe(3);
  });

  it("prints the total the caller priced, and no total when it is not known", () => {
    const priced = hydrateBuildCard({ ...args, priceRub: 187_240 });
    expect(priced.priceRub).toBe(187_240);
    expect(hydrateBuildCard({ ...args, priceRub: null }).priceRub).toBeNull();
  });

  it("computes stats via weaponSpec aggregation", () => {
    const vm = hydrateBuildCard(args);
    // 48 + 15 + 8 + 7 = 78
    expect(vm.stats.ergo).toBe(78);
    // Recoil sum is -0.23 + -0.225 + -0.04 = -0.495, so 119 * 0.505 = 60.095.
    // Pinned exactly rather than range-checked: the loose `< 120` bound here
    // passed happily while the card was rendering 118.4 for a -49.5% build.
    expect(vm.stats.recoilV).toBeCloseTo(60.095, 3);
    expect(vm.stats.recoilH).toBeCloseTo(342 * 0.505, 3);
    expect(vm.stats.weight).toBeCloseTo(0.499 + 0.61 + 0.246, 5);
    // No barrel on this build (the M4A1's sits under its upper receiver), so the MOA is the
    // receiver's own 0.01 cm: 0.01 × 100 / 2.9089 × the 1.35-curve deviation factor.
    expect(vm.stats.accuracy).toBeCloseTo(0.343779, 5);
  });

  it("sets availability to FLEA by default (no profileSnapshot)", () => {
    const vm = hydrateBuildCard(args);
    expect(vm.availability).toBe("FLEA");
  });

  it("returns null stats (except weight) when weapon.properties is null", () => {
    // `properties: null` on a weapon row happens for entries the JSON API returns
    // without an `ItemPropertiesWeapon` payload — hydrateBuildCard skips the
    // `weaponSpec` call entirely rather than passing zeros through it.
    const vm = hydrateBuildCard({
      build: m4a1Build,
      weapon: { ...m4a1Weapon, properties: null },
      mods: m4a1Mods,
      priceRub: null,
    });
    expect(vm.stats.ergo).toBeNull();
    expect(vm.stats.recoilV).toBeNull();
    expect(vm.stats.recoilH).toBeNull();
    expect(vm.stats.accuracy).toBeNull();
    // Weight is summed straight from the attached mods, not derived from
    // `weaponSpec` — it stays populated even with no weapon spec to compute from.
    expect(vm.stats.weight).toBeCloseTo(0.499 + 0.61 + 0.246, 5);
  });

  it("zeroes a mod's ergonomics/recoil/accuracy deltas when its properties are null", () => {
    // A mod row with no `ItemPropertiesWeaponMod` payload — the `?? 0` fallbacks on
    // each of ergonomicsDelta/recoilModifier/accuracyModifier, not the weapon-level
    // null-properties case above.
    const mods = m4a1Mods.map((m, i) => (i === 0 ? { ...m, properties: null } : m));
    const vm = hydrateBuildCard({ ...args, mods });
    // The first mod's ergo(+15)/recoilV(-0.23)/recoilH(-0.23) contribution drops to
    // zero; its weight (0.499) still counts since `weight` lives outside `properties`.
    expect(vm.stats.ergo).toBe(48 + 8 + 7);
    expect(vm.stats.recoilV).toBeCloseTo(119 * (1 - 0.265), 3);
    expect(vm.stats.recoilH).toBeCloseTo(342 * (1 - 0.265), 3);
    expect(vm.stats.weight).toBeCloseTo(0.499 + 0.61 + 0.246, 5);
  });
});

describe("hydratePairCard", () => {
  const leftArgs: HydrateSideArgs = { build: m4a1Build, weapon: m4a1Weapon, mods: m4a1Mods };
  // A second, distinct HydrateBuildArgs so "both sides populated" isn't the same
  // object hydrated twice — falls back to weapon.shortName since name is empty.
  const rightArgs: HydrateSideArgs = {
    build: { ...m4a1Build, name: "" },
    weapon: m4a1Weapon,
    mods: m4a1Mods,
  };

  it("hydrates both sides via hydrateBuildCard, dropping the card-only `accuracy`/`title` fields", () => {
    const vm = hydratePairCard({ left: leftArgs, right: rightArgs });
    for (const side of [vm.left, vm.right]) {
      expect(side?.weapon).toBe("M4A1");
      expect(side?.modCount).toBe(3);
      expect(side?.availability).toBe("FLEA");
      expect(side?.stats.ergo).toBe(78);
      expect(side?.stats.recoilV).toBeCloseTo(60.095, 3);
      expect(side?.stats.recoilH).toBeCloseTo(342 * 0.505, 3);
      expect(side?.stats.weight).toBeCloseTo(0.499 + 0.61 + 0.246, 5);
      // SideViewModel has no `accuracy` field — only BuildCardViewModel does.
      expect(side).not.toHaveProperty("stats.accuracy");
    }
  });

  it("leaves the left side null when its args are null", () => {
    const vm = hydratePairCard({ left: null, right: rightArgs });
    expect(vm.left).toBeNull();
    expect(vm.right?.weapon).toBe("M4A1");
  });

  it("leaves the right side null when its args are null", () => {
    const vm = hydratePairCard({ left: leftArgs, right: null });
    expect(vm.left?.weapon).toBe("M4A1");
    expect(vm.right).toBeNull();
  });
});
