import { describe, expect, it } from "vitest";
import { PRODUCTION_ORIGINS, SAMPLING_RATE, faroUrlFor } from "./faro-guard.js";

const URL = "https://faro-collector-prod-us-west-0.grafana.net/collect/abc123";

describe("faroUrlFor", () => {
  it.each(PRODUCTION_ORIGINS)("starts Faro on %s when the build carries a URL", (origin) => {
    expect(faroUrlFor(origin, URL)).toBe(URL);
  });

  it.each([
    "http://localhost:5173",
    "http://127.0.0.1:4173",
    "https://abc123.tarkov-gunsmith-web.pages.dev",
    "http://tarkovgunsmith.undermybed.dev",
  ])("never starts on %s", (origin) => {
    expect(faroUrlFor(origin, URL)).toBeNull();
  });

  it.each([undefined, "", "   "])("never starts without a URL (%j)", (url) => {
    expect(faroUrlFor(PRODUCTION_ORIGINS[0]!, url)).toBeNull();
  });

  it("samples every session for now", () => {
    expect(SAMPLING_RATE).toBe(1);
  });
});
