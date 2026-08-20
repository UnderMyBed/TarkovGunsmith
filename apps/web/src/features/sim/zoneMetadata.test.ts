import { describe, expect, it } from "vitest";
import { ZONE_META, zoneLabel, ORDERED_ZONES } from "./zoneMetadata.js";
import { ZONES } from "@tarkov/ballistics";

describe("ORDERED_ZONES", () => {
  it("contains all seven canonical zones", () => {
    for (const z of ZONES) {
      expect(ORDERED_ZONES).toContain(z);
    }
  });

  it("has exactly seven entries", () => {
    expect(ORDERED_ZONES).toHaveLength(7);
  });
});

describe("ZONE_META", () => {
  it("has an entry for every zone", () => {
    for (const z of ZONES) {
      expect(ZONE_META[z]).toBeDefined();
    }
  });

  it("every entry has a non-empty label", () => {
    for (const z of ZONES) {
      expect(ZONE_META[z].label.length).toBeGreaterThan(0);
    }
  });

  it("every entry has a non-empty colorClass", () => {
    for (const z of ZONES) {
      expect(ZONE_META[z].colorClass.length).toBeGreaterThan(0);
    }
  });

  /* Colour comes from the Field Ledger tokens in packages/ui/src/styles/index.css, never from a
   * raw Tailwind palette class. A `bg-red-700` slipping back in would render, so nothing else
   * would catch it. */
  it("every entry paints from a palette token, not a raw Tailwind colour", () => {
    for (const z of ZONES) {
      expect(ZONE_META[z].colorClass).toMatch(/^bg-\[var\(--color-[a-z-]+\)\]$/);
      expect(ZONE_META[z].textClass).toMatch(/^text-\[var\(--color-[a-z-]+\)\]$/);
    }
  });
});

describe("zoneLabel", () => {
  it("returns the label for a known zone", () => {
    expect(zoneLabel("head")).toBe(ZONE_META["head"].label);
    expect(zoneLabel("thorax")).toBe(ZONE_META["thorax"].label);
    expect(zoneLabel("leftLeg")).toBe(ZONE_META["leftLeg"].label);
  });
});
