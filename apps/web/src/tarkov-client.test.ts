import { describe, expect, it } from "vitest";
import { tarkovClient, TARKOV_JSON_API_BASE } from "./tarkov-client.js";

describe("tarkovClient", () => {
  it("is configured for the json.tarkov.dev regular game mode", () => {
    expect(TARKOV_JSON_API_BASE).toBe("https://json.tarkov.dev/regular/");
  });

  it("exposes a fetchResource function", () => {
    expect(typeof tarkovClient.fetchResource).toBe("function");
  });
});
