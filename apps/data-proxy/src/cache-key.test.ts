import { describe, expect, it } from "vitest";
import { cacheKeyFor } from "./cache-key.js";

describe("cacheKeyFor", () => {
  it("produces a deterministic URL for the same query + variables", async () => {
    const a = await cacheKeyFor({ query: "{ items { id } }", variables: {} });
    const b = await cacheKeyFor({ query: "{ items { id } }", variables: {} });
    expect(a).toBe(b);
  });

  it("differs when the query text differs", async () => {
    const a = await cacheKeyFor({ query: "{ items { id } }", variables: {} });
    const b = await cacheKeyFor({ query: "{ items { id name } }", variables: {} });
    expect(a).not.toBe(b);
  });

  it("differs when variables differ", async () => {
    const a = await cacheKeyFor({ query: "q", variables: { id: "1" } });
    const b = await cacheKeyFor({ query: "q", variables: { id: "2" } });
    expect(a).not.toBe(b);
  });

  it("differs when operationName differs", async () => {
    const a = await cacheKeyFor({ query: "q", variables: {}, operationName: "A" });
    const b = await cacheKeyFor({ query: "q", variables: {}, operationName: "B" });
    expect(a).not.toBe(b);
  });

  it("treats missing operationName the same as undefined", async () => {
    const a = await cacheKeyFor({ query: "q", variables: {} });
    const b = await cacheKeyFor({ query: "q", variables: {}, operationName: undefined });
    expect(a).toBe(b);
  });

  it("returns a parseable URL whose pathname is a hex hash", async () => {
    const key = await cacheKeyFor({ query: "q", variables: {} });
    const url = new URL(key);
    expect(url.protocol).toBe("https:");
    expect(url.pathname).toMatch(/^\/[0-9a-f]{64}$/);
  });
});
