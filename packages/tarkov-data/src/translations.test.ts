import { describe, expect, it } from "vitest";
import { mergeTranslations } from "./translations.js";

describe("mergeTranslations", () => {
  it("substitutes translation keys named by the upstream JSONPath list", () => {
    const doc = {
      data: { traders: { t1: { id: "t1", name: "t1 Nickname" } } },
      translations: ["$.data.traders.*.name"],
    };
    const merged = mergeTranslations(doc, { "t1 Nickname": "Prapor" });
    expect(merged.traders.t1.name).toBe("Prapor");
  });

  it("leaves a key in place when no translation exists", () => {
    const doc = {
      data: { traders: { t1: { id: "t1", name: "t1 Nickname" } } },
      translations: ["$.data.traders.*.name"],
    };
    const merged = mergeTranslations(doc, {});
    expect(merged.traders.t1.name).toBe("t1 Nickname");
  });

  it("returns data untouched when the document declares no translations", () => {
    const doc = { data: { a: 1 } };
    expect(mergeTranslations(doc, {})).toEqual({ a: 1 });
  });

  it("handles nested array paths", () => {
    const doc = {
      data: { tasks: { q1: { objectives: [{ description: "q1 Obj" }] } } },
      translations: ["$.data.tasks.*.objectives[*].description"],
    };
    const merged = mergeTranslations(doc, { "q1 Obj": "Find the thing" });
    expect(merged.tasks.q1.objectives[0]!.description).toBe("Find the thing");
  });

  it("ignores a malformed JSONPath instead of failing the whole merge", () => {
    const doc = {
      // `$$$[not-a-path` looks malformed but jsonpath-plus parses it without throwing (it
      // just matches nothing) — it does not exercise the `catch`. `$.data[(` is an unclosed
      // filter expression, and jsonpath-plus only evaluates (and rejects) that syntax once it
      // reaches a base path that actually exists in `doc` — `$.a[(` against this doc has no
      // top-level `a` to descend into and silently no-ops instead of throwing. `$.data` does
      // exist, so this is the path that actually reaches the `catch { continue; }` branch.
      data: { traders: { t1: { name: "t1 Nickname" } } },
      translations: ["$.data[(", "$.data.traders.*.name"],
    };
    const merged = mergeTranslations(doc, { "t1 Nickname": "Prapor" });
    expect(merged.traders.t1.name).toBe("Prapor");
  });

  it("skips a matched value that isn't a string, leaving it untouched", () => {
    // `typeof value !== "string" || parent === undefined` — every other test in this file
    // points `translations` at a string field. Pointing it at a number exercises the
    // "don't stomp a non-string match" guard instead.
    const doc = {
      data: { traders: { t1: { id: "t1", level: 4 } } },
      translations: ["$.data.traders.*.level"],
    };
    const merged = mergeTranslations(doc, { "4": "should never apply to a number" });
    expect(merged.traders.t1.level).toBe(4);
  });
});
