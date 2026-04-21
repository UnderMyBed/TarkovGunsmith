import { describe, expect, it } from "vitest";
import { RawProgressionSchema } from "./types.js";
import rawFixture from "./__fixtures__/raw-progression.json" with { type: "json" };

describe("RawProgressionSchema", () => {
  it("accepts the fixture as valid", () => {
    expect(() => RawProgressionSchema.parse(rawFixture)).not.toThrow();
  });

  it("rejects a payload missing tasksProgress and points at the field path", () => {
    const bad = { ...(rawFixture as unknown as Record<string, unknown>) };
    delete bad.tasksProgress;
    const result = RawProgressionSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "tasksProgress")).toBe(true);
    }
  });
});
