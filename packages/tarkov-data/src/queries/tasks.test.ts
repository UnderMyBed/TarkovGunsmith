import { describe, expect, it, vi } from "vitest";
import { fetchTasks, tasksSchema } from "./tasks.js";
import { createTarkovClient } from "../client.js";

const gunsmith = {
  id: "q1",
  name: "Gunsmith - Part 1",
  normalizedName: "gunsmith-part-1",
  kappaRequired: true,
  trader: { normalizedName: "mechanic" },
};

const fixture = { data: { tasks: [gunsmith] } };

describe("tasksSchema", () => {
  it("parses a valid response", () => {
    expect(tasksSchema.safeParse(fixture.data).success).toBe(true);
  });
});

describe("fetchTasks", () => {
  it("returns parsed tasks", async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    const result = await fetchTasks(client);
    expect(result).toHaveLength(1);
    expect(result[0]?.normalizedName).toBe("gunsmith-part-1");
  });
});
