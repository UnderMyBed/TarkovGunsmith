import { describe, it, expect } from "vitest";
import { score } from "./objective.js";
import type { WeaponSpec } from "@tarkov/ballistics";

const stats: WeaponSpec = {
  weaponId: "w1",
  modCount: 0,
  ergonomics: 50,
  verticalRecoil: 100,
  horizontalRecoil: 200,
  weight: 3,
  accuracy: 2.5,
};

describe("score", () => {
  it("min-recoil = verticalRecoil + horizontalRecoil", () => {
    expect(score("min-recoil", stats)).toBe(300);
  });

  it("max-ergonomics = -ergonomics (lower is better uniformly)", () => {
    expect(score("max-ergonomics", stats)).toBe(-50);
  });

  it("min-weight = weight", () => {
    expect(score("min-weight", stats)).toBe(3);
  });

  it("max-accuracy = accuracy (lower MOA is better)", () => {
    expect(score("max-accuracy", stats)).toBe(2.5);
  });

  it("smaller-is-better invariant holds for all objectives", () => {
    const better: WeaponSpec = {
      ...stats,
      verticalRecoil: 50,
      horizontalRecoil: 150,
      ergonomics: 60,
      weight: 2.5,
      accuracy: 1.5,
    };
    for (const obj of ["min-recoil", "max-ergonomics", "min-weight", "max-accuracy"] as const) {
      expect(score(obj, better)).toBeLessThan(score(obj, stats));
    }
  });
});
