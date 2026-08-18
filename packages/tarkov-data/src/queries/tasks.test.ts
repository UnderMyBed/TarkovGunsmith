import { describe, expect, it } from "vitest";
import { fetchTasks } from "./tasks.js";
import { fixtureClient } from "../__fixtures__/client.js";

describe("fetchTasks", () => {
  it("returns tasks with a normalizedName and a resolved trader", async () => {
    const tasks = await fetchTasks(fixtureClient());
    expect(tasks.length).toBeGreaterThan(0);
    for (const t of tasks) {
      expect(typeof t.normalizedName).toBe("string");
      expect(typeof t.trader.normalizedName).toBe("string");
      expect(t.trader.normalizedName).not.toBe("");
    }
  });

  it("resolves translated names", async () => {
    const tasks = await fetchTasks(fixtureClient());
    for (const t of tasks) expect(t.name).not.toMatch(/ Name$/);
  });

  it("includes the restructured Gunsmith quests under their new names", async () => {
    const names = (await fetchTasks(fixtureClient())).map((t) => t.normalizedName);
    expect(names).toContain("gunsmith-master-part-1");
    expect(names).toContain("gunsmith-m4a1");
    expect(names).not.toContain("gunsmith-part-1");
  });
});
