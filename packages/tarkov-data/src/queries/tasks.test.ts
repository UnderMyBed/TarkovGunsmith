import { describe, expect, it } from "vitest";
import { fetchTasks } from "./tasks.js";
import { fixtureClient } from "../__fixtures__/client.js";
import type { TarkovJsonClient } from "../client.js";

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

  it("drops malformed trader entries, malformed task entries, and tasks that fail schema", async () => {
    // One synthetic document exercising every defensive branch fetchTasks has, since the
    // real fixture's traders/tasks are all well-formed:
    //  - a null / non-object trader entry (skipped when building the id->normalizedName map)
    //  - a trader entry missing `id` or `normalizedName` (also skipped)
    //  - a null / non-object task entry (skipped)
    //  - a task whose `trader` isn't a string, and one whose trader id doesn't resolve
    //    (both drop the task rather than emit a blank trader)
    //  - a task whose trader DOES resolve but which otherwise fails `taskListItemSchema`
    //    (missing `name`) — proves resolving the trader isn't enough on its own
    //  - one fully valid task, so the "kept" path still runs too
    const client: TarkovJsonClient = {
      fetchResource: <T>(resource: string): Promise<T> => {
        if (resource === "traders") {
          return Promise.resolve({
            badTrader1: null,
            badTrader2: "not an object",
            badTrader3: { id: "t3" }, // missing normalizedName
            badTrader4: { normalizedName: "t4" }, // missing id
            goodTrader: { id: "t-good", normalizedName: "prapor-test" },
          } as T);
        }
        if (resource === "tasks") {
          return Promise.resolve({
            tasks: {
              badTask1: null,
              badTask2: 42,
              nonStringTrader: { id: "bt3", name: "Bad", normalizedName: "bad-3", trader: 12345 },
              unresolvedTrader: {
                id: "bt4",
                name: "Bad",
                normalizedName: "bad-4",
                trader: "unknown-trader-id",
              },
              missingName: { id: "bt5", normalizedName: "bad-5", trader: "t-good" },
              goodTask: {
                id: "task1",
                name: "Test Task",
                normalizedName: "test-task",
                kappaRequired: false,
                trader: "t-good",
              },
            },
          } as T);
        }
        throw new Error(`unexpected resource "${resource}"`);
      },
    };

    const tasks = await fetchTasks(client);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      normalizedName: "test-task",
      trader: { normalizedName: "prapor-test" },
    });
  });
});
