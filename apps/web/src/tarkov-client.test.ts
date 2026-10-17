import { describe, expect, it } from "vitest";
import {
  builderData,
  BUILDER_SNAPSHOT_URL,
  tarkovClient,
  TARKOV_JSON_API_BASE,
} from "./tarkov-client.js";

describe("tarkovClient", () => {
  it("is configured for the json.tarkov.dev regular game mode", () => {
    expect(TARKOV_JSON_API_BASE).toBe("https://json.tarkov.dev/regular/");
  });

  it("exposes a fetchResource function", () => {
    expect(typeof tarkovClient.fetchResource).toBe("function");
  });
});

describe("builderData", () => {
  it("reads the snapshot from the site and prices from upstream", () => {
    expect(BUILDER_SNAPSHOT_URL).toBe("/data/builder-snapshot.json");
    expect(typeof builderData.snapshot).toBe("function");
    expect(typeof builderData.prices).toBe("function");
  });
});
