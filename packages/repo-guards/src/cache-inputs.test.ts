import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { readRepoFile } from "./repo.js";

/**
 * These guards read files OUTSIDE their own package — workflows, mise.toml, the root
 * package.json. Turborepo hashes only a package's own files by default, so without an
 * explicit `inputs` list a change to `.github/workflows/**` does not invalidate this
 * package's cached test result.
 *
 * That is not a performance detail. It means CI can replay a stale PASS for the very
 * commit that broke a guard, and a guard that cannot fail is not a guard. Verified by
 * hand before this test was written: editing a workflow produced "cache hit, replaying
 * logs" until the `inputs` override existed, and "cache miss, executing" afterwards.
 */
const TASK = "@tarkov/repo-guards#test";
const SRC_DIR = "packages/repo-guards/src";

interface TurboConfig {
  tasks: Record<string, { inputs?: string[] } | undefined>;
}

function declaredInputs(): string[] {
  const turbo = JSON.parse(readRepoFile("turbo.json")) as TurboConfig;
  return turbo.tasks[TASK]?.inputs ?? [];
}

/**
 * Every .ts source in this package, concatenated, with comments stripped — otherwise the
 * example `readRepoFile("literal")` in this file's own doc block is scraped as a real read.
 */
function guardSources(): string {
  return readdirSync(new URL(".", import.meta.url))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => readRepoFile(`${SRC_DIR}/${name}`))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

/**
 * Repo-relative paths these guards actually read, derived from the source rather than
 * hand-listed, so a newly-added read cannot quietly escape the coverage check.
 */
function readPaths(): string[] {
  const sources = guardSources();
  const paths = new Set<string>();

  // readRepoFile("literal") — template forms with interpolation are handled below.
  for (const match of sources.matchAll(/readRepoFile\(\s*["'`]([^"'`$]+)["'`]/g)) {
    paths.add(match[1]!);
  }
  // Reads built from WORKFLOW_DIR resolve under .github/workflows.
  if (sources.includes("WORKFLOW_DIR")) paths.add(".github/workflows/ci.yml");
  // join(REPO_ROOT, ".github", "actions") style DIRECTORY reads. Probed as a file inside
  // the directory, since an input glob covers a directory by covering its contents.
  for (const match of sources.matchAll(/join\(\s*REPO_ROOT\s*,\s*["']([^"']+)["']/g)) {
    paths.add(`${match[1]!}/probe`);
  }

  // This package's own files are already covered by $TURBO_DEFAULT$.
  return [...paths].filter((path) => !path.startsWith("packages/"));
}

/** Does a turbo input glob (written relative to the package) cover this repo-relative path? */
function covers(glob: string, repoPath: string): boolean {
  const prefix = "../../";
  if (!glob.startsWith(prefix)) return false;
  const pattern = glob.slice(prefix.length);
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .split("**")
    .map((part) => part.replace(/\*/g, "[^/]*"))
    .join(".*");
  return new RegExp(`^${source}$`).test(repoPath);
}

describe("turbo cache inputs cover what these guards read", () => {
  it("declares an explicit inputs list for the test task", () => {
    const inputs = declaredInputs();
    expect(inputs.length).toBeGreaterThan(0);
    // Without this sentinel the package's own sources stop being hashed.
    expect(inputs).toContain("$TURBO_DEFAULT$");
  });

  it("covers every repo-root path the guards read", () => {
    const inputs = declaredInputs();
    const uncovered = readPaths().filter((path) => !inputs.some((glob) => covers(glob, path)));
    expect(uncovered).toEqual([]);
  });

  it("finds the paths it claims to check, so the guard cannot pass vacuously", () => {
    const paths = readPaths();
    expect(paths).toContain(".nvmrc");
    expect(paths).toContain("package.json");
    expect(paths).toContain("mise.toml");
    expect(paths).toContain("turbo.json");
    expect(paths.length).toBeGreaterThanOrEqual(5);
    // The comment stripper must not have eaten real reads along with the examples.
    expect(paths).not.toContain("literal");
  });

  it("rejects a glob that does not reach outside the package", () => {
    // Guards the matcher itself: "$TURBO_DEFAULT$" must not be read as covering everything.
    expect(covers("$TURBO_DEFAULT$", ".nvmrc")).toBe(false);
    expect(covers("../../.github/**", ".github/workflows/ci.yml")).toBe(true);
    expect(covers("../../.nvmrc", "package.json")).toBe(false);
  });
});
