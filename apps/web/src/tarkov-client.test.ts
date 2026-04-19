import { describe, expect, it } from "vitest";
import { tarkovClient, TARKOV_GRAPHQL_ENDPOINT } from "./tarkov-client.js";

describe("tarkovClient", () => {
  it("is configured for the api.tarkov.dev endpoint", () => {
    expect(TARKOV_GRAPHQL_ENDPOINT).toBe("https://api.tarkov.dev/graphql");
    expect(tarkovClient.url).toBe(TARKOV_GRAPHQL_ENDPOINT);
  });

  it("exposes a request function", () => {
    expect(typeof tarkovClient.request).toBe("function");
  });
});
