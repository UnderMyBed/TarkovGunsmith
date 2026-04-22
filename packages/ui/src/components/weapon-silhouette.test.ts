import { describe, expect, it } from "vitest";
import { weaponSilhouetteSrc } from "./weapon-silhouette.js";

describe("weaponSilhouetteSrc", () => {
  it("builds the base-image CDN URL from an item id", () => {
    expect(weaponSilhouetteSrc("5447a9cd4bdc2dbd208b4567")).toBe(
      "https://assets.tarkov.dev/5447a9cd4bdc2dbd208b4567-base-image.webp",
    );
  });

  it("throws on empty itemId", () => {
    expect(() => weaponSilhouetteSrc("")).toThrow();
  });
});
