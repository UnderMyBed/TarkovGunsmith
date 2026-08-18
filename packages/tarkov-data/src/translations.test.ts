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
      data: { traders: { t1: { name: "t1 Nickname" } } },
      translations: ["$$$[not-a-path", "$.data.traders.*.name"],
    };
    const merged = mergeTranslations(doc, { "t1 Nickname": "Prapor" });
    expect(merged.traders.t1.name).toBe("Prapor");
  });
});
