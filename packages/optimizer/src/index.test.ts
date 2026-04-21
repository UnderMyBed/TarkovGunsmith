import { describe, it, expect } from "vitest";
import { OPTIMIZER_PLACEHOLDER } from "./index.js";

describe("@tarkov/optimizer scaffold", () => {
  it("exports the placeholder sentinel", () => {
    expect(OPTIMIZER_PLACEHOLDER).toBe("scaffold");
  });
});
