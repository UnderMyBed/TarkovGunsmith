import { describe, it, expect } from "vitest";
import { statDelta, type StatDirection } from "./stat-delta.js";

const a = {
  ergonomics: 50,
  verticalRecoil: 100,
  horizontalRecoil: 200,
  weight: 3.5,
  accuracy: 3.0,
};

describe("statDelta", () => {
  it("returns zero deltas when specs are identical", () => {
    const res = statDelta(a, a);
    for (const row of res) {
      expect(row.delta).toBe(0);
      expect(row.direction).toBe<StatDirection>("neutral");
    }
  });

  it("marks ergo increase as 'better' (higher is better)", () => {
    const b = { ...a, ergonomics: 60 };
    const res = statDelta(a, b);
    const row = res.find((r) => r.key === "ergonomics");
    expect(row?.delta).toBe(10);
    expect(row?.direction).toBe<StatDirection>("better");
  });

  it("marks vertical-recoil decrease as 'better' (lower is better)", () => {
    const b = { ...a, verticalRecoil: 80 };
    const res = statDelta(a, b);
    const row = res.find((r) => r.key === "verticalRecoil");
    expect(row?.delta).toBe(-20);
    expect(row?.direction).toBe<StatDirection>("better");
  });

  it("marks horizontal-recoil increase as 'worse'", () => {
    const b = { ...a, horizontalRecoil: 230 };
    const res = statDelta(a, b);
    const row = res.find((r) => r.key === "horizontalRecoil");
    expect(row?.delta).toBe(30);
    expect(row?.direction).toBe<StatDirection>("worse");
  });

  it("marks weight decrease as 'better' (lower is better)", () => {
    const b = { ...a, weight: 3.0 };
    const res = statDelta(a, b);
    const row = res.find((r) => r.key === "weight");
    expect(row?.delta).toBeCloseTo(-0.5, 5);
    expect(row?.direction).toBe<StatDirection>("better");
  });

  it("marks accuracy decrease as 'better' (lower MOA is better)", () => {
    const b = { ...a, accuracy: 2.0 };
    const res = statDelta(a, b);
    const row = res.find((r) => r.key === "accuracy");
    expect(row?.delta).toBeCloseTo(-1.0, 5);
    expect(row?.direction).toBe<StatDirection>("better");
  });

  it("handles null on either side with direction=unavailable", () => {
    const res = statDelta(a, null);
    for (const row of res) {
      expect(row.direction).toBe<StatDirection>("unavailable");
      expect(row.delta).toBeNull();
    }
  });

  it("reports all 5 WeaponSpec stats in a stable order", () => {
    const res = statDelta(a, a);
    expect(res.map((r) => r.key)).toEqual([
      "ergonomics",
      "verticalRecoil",
      "horizontalRecoil",
      "weight",
      "accuracy",
    ]);
  });
});
