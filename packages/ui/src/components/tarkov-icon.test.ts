import { describe, expect, it } from "vitest";
import { iconUrl } from "./tarkov-icon.js";

describe("iconUrl", () => {
  it("builds a CDN URL from an item id with default size", () => {
    expect(iconUrl("5656d7c34bdc2d9d198b4587")).toBe(
      "https://assets.tarkov.dev/5656d7c34bdc2d9d198b4587-icon.webp",
    );
  });

  it("supports the grid-image variant", () => {
    expect(iconUrl("5656d7c34bdc2d9d198b4587", "grid-image")).toBe(
      "https://assets.tarkov.dev/5656d7c34bdc2d9d198b4587-grid-image.webp",
    );
  });

  it("supports the base-image variant", () => {
    expect(iconUrl("5656d7c34bdc2d9d198b4587", "base-image")).toBe(
      "https://assets.tarkov.dev/5656d7c34bdc2d9d198b4587-base-image.webp",
    );
  });

  it("throws on empty itemId", () => {
    expect(() => iconUrl("")).toThrow(/itemId/);
  });
});
