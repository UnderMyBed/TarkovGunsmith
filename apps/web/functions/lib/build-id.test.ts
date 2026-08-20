import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BUILD_ID_REGEX, isValidBuildId } from "./build-id.js";

/** Stand-in for `BUILDS_API_URL` — the base every OG handler interpolates into. */
const API = "https://api.example.com";

describe("isValidBuildId — accepts real ids", () => {
  // These two are the ids playwright.config.ts:24 seeds into KV for the OG
  // e2e tests, so they are the exact strings the live path must keep serving.
  it.each(["abcd2345", "efgh6789", "zzzzzzzz", "k7m4n8p2"])("accepts %s", (id) => {
    expect(isValidBuildId(id)).toBe(true);
  });
});

describe("isValidBuildId — rejects ids that must never reach a fetch", () => {
  it("rejects an id containing a path separator", () => {
    expect(isValidBuildId("../healthz")).toBe(false);
    expect(isValidBuildId("abc/def")).toBe(false);
    expect(isValidBuildId("abcd2345/")).toBe(false);
  });

  it("rejects a percent-encoded separator, encoded or decoded", () => {
    // Path params arrive percent-decoded, so both forms are worth pinning:
    // the raw request-line form and what the runtime hands the handler.
    expect(isValidBuildId("..%2Fhealthz")).toBe(false);
    expect(isValidBuildId(decodeURIComponent("..%2Fhealthz"))).toBe(false);
    expect(isValidBuildId("%2E%2E%2Fhealthz")).toBe(false);
  });

  it("rejects an over-length id", () => {
    expect(isValidBuildId("abcd23456")).toBe(false);
    expect(isValidBuildId("a".repeat(64))).toBe(false);
    expect(isValidBuildId("a".repeat(4096))).toBe(false);
  });

  it("rejects an empty id", () => {
    expect(isValidBuildId("")).toBe(false);
  });

  it("rejects an under-length id", () => {
    expect(isValidBuildId("abcd234")).toBe(false);
  });

  it("rejects characters the generator's alphabet deliberately excludes", () => {
    // 0/O/I/l/1 are URL-ambiguous and are not in the generator's alphabet.
    for (const id of ["abcd2340", "abcd234o", "abcd234i", "abcd234l", "abcd2341"]) {
      expect(isValidBuildId(id)).toBe(false);
    }
    expect(isValidBuildId("ABCD2345")).toBe(false);
  });

  it("is not fooled by a newline (JS `$` alone would match before it)", () => {
    // `/…$/` without `m` still matches a single trailing newline in JS, which
    // is a classic validation bypass. `\n` is outside the class, so the anchor
    // never gets that chance — pinned so a future rewrite cannot regress it.
    expect(isValidBuildId("abcd2345\n")).toBe(false);
    expect(isValidBuildId("abcd2345\n../healthz")).toBe(false);
  });
});

describe("the traversal these ids would cause if interpolated unvalidated", () => {
  // This is the actual defect, expressed as an executable statement: these
  // strings do not stay inside /builds/ once a URL parser sees them. Each one
  // must therefore be rejected before it reaches `fetch`.
  it.each([
    ["../healthz", `${API}/healthz`],
    ["abc/../../healthz", `${API}/healthz`],
    ["..", `${API}/`],
  ])("%s escapes /builds/ and resolves to %s", (id, escaped) => {
    expect(new URL(`${API}/builds/${id}`).href).toBe(escaped);
    expect(isValidBuildId(id)).toBe(false);
  });

  it("a valid id stays inside /builds/", () => {
    expect(new URL(`${API}/builds/abcd2345`).href).toBe(`${API}/builds/abcd2345`);
  });
});

describe("mirrored contract with the builds-api generator", () => {
  // The rule is duplicated by hand across two deploy targets (Pages Functions
  // cannot import the Worker's source). Read the SOURCE file and compare, so
  // drift fails a test here instead of 400-ing freshly minted ids in prod.
  const idSource = readFileSync(
    fileURLToPath(new URL("../../../../apps/builds-api/src/id.ts", import.meta.url)),
    "utf8",
  );

  it("matches BUILD_ID_REGEX as declared in apps/builds-api/src/id.ts", () => {
    const declared = /export const BUILD_ID_REGEX = (\/.+\/);/.exec(idSource)?.[1];
    expect(declared, "BUILD_ID_REGEX not found in apps/builds-api/src/id.ts").toBeDefined();
    expect(BUILD_ID_REGEX.source).toBe(new RegExp(declared!.slice(1, -1)).source);
  });

  it("matches the generator's alphabet and length", () => {
    const alphabet = /const ALPHABET = "([^"]+)";/.exec(idSource)?.[1];
    const length = /const ID_LENGTH = (\d+);/.exec(idSource)?.[1];
    expect(alphabet, "ALPHABET not found in apps/builds-api/src/id.ts").toBeDefined();
    expect(length, "ID_LENGTH not found in apps/builds-api/src/id.ts").toBeDefined();

    // Every character the generator can emit is accepted at the declared length.
    const id = alphabet!.slice(0, Number(length));
    expect(id).toHaveLength(Number(length));
    expect(isValidBuildId(id)).toBe(true);
    expect(isValidBuildId(alphabet!.slice(-Number(length)))).toBe(true);
  });
});
