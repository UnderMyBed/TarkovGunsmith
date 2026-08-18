import { describe, expect, it } from "vitest";
import { compositeActionDirs, readDependabotUpdates } from "./dependabot.js";

describe("dependabot coverage", () => {
  it("watches every composite action directory", () => {
    const watched = new Set(
      readDependabotUpdates()
        .filter((update) => update["package-ecosystem"] === "github-actions")
        .flatMap((update) => update.directories ?? (update.directory ? [update.directory] : [])),
    );

    // `directory: /` covers .github/workflows only. Each composite action needs its own entry.
    const unwatched = compositeActionDirs().filter((dir) => !watched.has(dir));
    expect(unwatched).toEqual([]);
  });

  it("covers the workspace roots for npm", () => {
    const npm = readDependabotUpdates().filter((u) => u["package-ecosystem"] === "npm");
    const directories = npm.flatMap((u) => u.directories ?? []);
    expect(directories).toEqual(expect.arrayContaining(["/", "/apps/*", "/packages/*"]));
  });
});
