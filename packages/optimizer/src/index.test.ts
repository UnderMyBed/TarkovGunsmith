import { describe, it, expect } from "vitest";
import { optimize } from "./index.js";
import type { Objective, OptimizationResult } from "./index.js";

describe("@tarkov/optimizer exports", () => {
  it("exports optimize and Objective/OptimizationResult types", () => {
    const o: Objective = "min-recoil";
    expect(o).toBe("min-recoil");
    expect(typeof optimize).toBe("function");
    const never: OptimizationResult | undefined = undefined;
    expect(never).toBeUndefined();
  });
});
