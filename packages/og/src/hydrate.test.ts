import { describe, expect, it } from "vitest";
import { hydrateBuildCard, hydratePairCard } from "./hydrate.js";
import type { HydrateBuildArgs, HydrateSideArgs } from "./hydrate.js";
import { m4a1Build, m4a1Weapon, m4a1Mods } from "./__fixtures__/m4a1-build.js";

const args: HydrateBuildArgs = {
  name: m4a1Build.name,
  weapon: m4a1Weapon,
  mods: m4a1Mods,
  priceRub: null,
  availability: "LL3",
};

/** The receiver's own 0.75 kg plus the three parts. */
const WEIGHT = 0.75 + 0.499 + 0.61 + 0.246;

describe("hydrateBuildCard", () => {
  it("uses the build's name as title and weapon shortName as subtitle", () => {
    const vm = hydrateBuildCard(args);
    expect(vm.title).toBe("RECOIL KING");
    expect(vm.subtitle).toBe("M4A1");
  });

  it("falls back to weapon shortName when the build has no name", () => {
    for (const name of ["", undefined]) {
      const vm = hydrateBuildCard({ ...args, name });
      expect(vm.title).toBe("M4A1");
      expect(vm.subtitle).toBeNull();
    }
  });

  it("counts one part per filled slot", () => {
    expect(hydrateBuildCard(args).modCount).toBe(3);
    expect(hydrateBuildCard({ ...args, mods: [...m4a1Mods, m4a1Mods[0]!] }).modCount).toBe(4);
  });

  it("prints the total the caller priced, and no total when it is not known", () => {
    const priced = hydrateBuildCard({ ...args, priceRub: 187_240 });
    expect(priced.priceRub).toBe(187_240);
    expect(hydrateBuildCard({ ...args, priceRub: null }).priceRub).toBeNull();
  });

  it("shows ergonomics summing below 0 as the game's 0", () => {
    // 48 base + 30 from the fixture parts − 101 sums to −23.
    const heavy = [...m4a1Mods, { ...m4a1Mods[0]!, ergonomicsDelta: -101 }];
    expect(hydrateBuildCard({ ...args, mods: heavy }).stats.ergo).toBe(0);
    const side: HydrateSideArgs = {
      name: undefined,
      weapon: m4a1Weapon,
      mods: heavy,
      availability: null,
    };
    expect(hydratePairCard({ left: side, right: null }).left?.stats.ergo).toBe(0);
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
    expect(vm.stats.weight).toBeCloseTo(WEIGHT, 10);
    // No barrel on this build (the M4A1's sits under its upper receiver), so the MOA is the
    // receiver's own 0.01 cm: 0.01 × 100 / 2.9089 × the 1.35-curve deviation factor.
    expect(vm.stats.accuracy).toBeCloseTo(0.343779, 5);
  });

  it("weighs a bare weapon at its own weight, not 0", () => {
    // Production drew WEIGHT 0 for a bare M4A1 (#228): the card summed the parts only.
    expect(hydrateBuildCard({ ...args, mods: [] }).stats.weight).toBe(0.75);
  });

  it("counts a part fitted twice twice, weight included", () => {
    const twice = hydrateBuildCard({ ...args, mods: [...m4a1Mods, m4a1Mods[0]!] });
    expect(twice.stats.ergo).toBe(78 + 15);
    expect(twice.stats.weight).toBeCloseTo(WEIGHT + 0.499, 10);
  });

  it("prints the pill the caller worked out, and none when there is none", () => {
    expect(hydrateBuildCard(args).availability).toBe("LL3");
    expect(hydrateBuildCard({ ...args, availability: null }).availability).toBeNull();
  });
});

describe("hydratePairCard", () => {
  const leftArgs: HydrateSideArgs = {
    name: m4a1Build.name,
    weapon: m4a1Weapon,
    mods: m4a1Mods,
    availability: "LL3",
  };
  // A second, distinct side so "both sides populated" isn't the same object hydrated twice.
  const rightArgs: HydrateSideArgs = {
    name: "",
    weapon: m4a1Weapon,
    mods: m4a1Mods,
    availability: "LL3",
  };

  it("hydrates both sides via hydrateBuildCard, dropping the card-only `accuracy`/`title` fields", () => {
    const vm = hydratePairCard({ left: leftArgs, right: rightArgs });
    for (const side of [vm.left, vm.right]) {
      expect(side?.weapon).toBe("M4A1");
      expect(side?.modCount).toBe(3);
      expect(side?.availability).toBe("LL3");
      expect(side?.stats.ergo).toBe(78);
      expect(side?.stats.recoilV).toBeCloseTo(60.095, 3);
      expect(side?.stats.recoilH).toBeCloseTo(342 * 0.505, 3);
      expect(side?.stats.weight).toBeCloseTo(WEIGHT, 10);
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
