import { describe, expect, it } from "vitest";
import { newBuildId, BUILD_ID_REGEX } from "./id.js";

describe("newBuildId", () => {
  it("returns an 8-character lowercase alphanumeric string", () => {
    const id = newBuildId();
    expect(id).toMatch(BUILD_ID_REGEX);
    expect(id).toHaveLength(8);
  });

  it("produces unique ids across many calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(newBuildId());
    expect(ids.size).toBe(1000);
  });

  it("uses only the safe alphabet (no ambiguous characters)", () => {
    for (let i = 0; i < 200; i++) {
      const id = newBuildId();
      expect(id).not.toMatch(/[0OIl1]/);
    }
  });
});

describe("BUILD_ID_REGEX", () => {
  it("accepts known-good ids", () => {
    expect("a2b4c6d8").toMatch(BUILD_ID_REGEX);
  });

  it("rejects ids with disallowed characters", () => {
    expect("a2b4c6dO").not.toMatch(BUILD_ID_REGEX); // contains O
    expect("UPPERCAS").not.toMatch(BUILD_ID_REGEX); // uppercase
    expect("short").not.toMatch(BUILD_ID_REGEX); // too short
    expect("toomanychars").not.toMatch(BUILD_ID_REGEX); // too long
  });
});
