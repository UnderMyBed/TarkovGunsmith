import { describe, expect, it } from "vitest";
import { PMC_BODY_DEFAULTS, createPmcTarget } from "./defaults.js";
import { ZONES } from "./types.js";

describe("PMC_BODY_DEFAULTS", () => {
  it("covers all seven zones", () => {
    for (const zone of ZONES) {
      expect(PMC_BODY_DEFAULTS[zone]).toBeGreaterThan(0);
    }
  });

  it("matches canonical Tarkov PMC values", () => {
    expect(PMC_BODY_DEFAULTS.head).toBe(35);
    expect(PMC_BODY_DEFAULTS.thorax).toBe(85);
    expect(PMC_BODY_DEFAULTS.stomach).toBe(70);
    expect(PMC_BODY_DEFAULTS.leftArm).toBe(60);
    expect(PMC_BODY_DEFAULTS.rightArm).toBe(60);
    expect(PMC_BODY_DEFAULTS.leftLeg).toBe(65);
    expect(PMC_BODY_DEFAULTS.rightLeg).toBe(65);
  });
});

describe("createPmcTarget", () => {
  it("produces a target with full HP and no blacked parts", () => {
    const t = createPmcTarget();
    for (const zone of ZONES) {
      expect(t.parts[zone].hp).toBe(PMC_BODY_DEFAULTS[zone]);
      expect(t.parts[zone].max).toBe(PMC_BODY_DEFAULTS[zone]);
      expect(t.parts[zone].blacked).toBe(false);
    }
    expect(t.helmet).toBeUndefined();
    expect(t.bodyArmor).toBeUndefined();
  });
});
