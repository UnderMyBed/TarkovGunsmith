import { describe, expect, it } from "vitest";
import { readMiseTools, readRepoFile } from "./repo.js";

describe("toolchain pins agree", () => {
  it("mise.toml node matches .nvmrc", () => {
    const nvmrc = readRepoFile(".nvmrc").trim();
    expect(readMiseTools().node).toBe(nvmrc);
  });

  it("mise.toml pnpm matches package.json packageManager", () => {
    const pkg = JSON.parse(readRepoFile("package.json")) as { packageManager?: string };
    expect(pkg.packageManager).toBe(`pnpm@${readMiseTools().pnpm}`);
  });
});
