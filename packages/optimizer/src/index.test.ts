import { describe, it, expect } from "vitest";
import type { Objective } from "./index.js";

describe("@tarkov/optimizer exports", () => {
  it("exports the Objective type (compile-time)", () => {
    const o: Objective = "min-recoil";
    expect(o).toBe("min-recoil");
  });
});
