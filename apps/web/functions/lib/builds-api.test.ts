import { describe, expect, it } from "vitest";
import { DEFAULT_BUILDS_API_URL, buildsApiBase } from "./builds-api.js";

describe("buildsApiBase", () => {
  it("prefers an explicit binding", () => {
    expect(buildsApiBase({ BUILDS_API_URL: "http://127.0.0.1:8788" })).toBe(
      "http://127.0.0.1:8788",
    );
  });

  it("falls back to the Worker's declared custom domain when unset", () => {
    // The regression this exists for: an unset binding used to produce a 500 on every
    // share and unfurl, and nothing failed at deploy time to say so.
    expect(buildsApiBase({})).toBe(DEFAULT_BUILDS_API_URL);
    expect(buildsApiBase({ BUILDS_API_URL: undefined })).toBe(DEFAULT_BUILDS_API_URL);
  });

  it("treats an empty or whitespace binding as unset rather than as a valid base", () => {
    // `wrangler pages secret put` with an empty value is a plausible operator slip; it
    // must not produce `fetch("/builds/ab12cd34")` against the Pages origin itself.
    expect(buildsApiBase({ BUILDS_API_URL: "" })).toBe(DEFAULT_BUILDS_API_URL);
    expect(buildsApiBase({ BUILDS_API_URL: "   " })).toBe(DEFAULT_BUILDS_API_URL);
  });

  it("trims trailing slashes so callers can append a path", () => {
    expect(buildsApiBase({ BUILDS_API_URL: "https://api.example.com/" })).toBe(
      "https://api.example.com",
    );
    expect(buildsApiBase({ BUILDS_API_URL: "https://api.example.com///" })).toBe(
      "https://api.example.com",
    );
  });

  it("produces a usable absolute URL when a build path is appended", () => {
    expect(`${buildsApiBase({})}/builds/ab12cd34`).toBe(
      `${DEFAULT_BUILDS_API_URL}/builds/ab12cd34`,
    );
    expect(new URL(`${buildsApiBase({})}/builds/ab12cd34`).pathname).toBe("/builds/ab12cd34");
  });
});
