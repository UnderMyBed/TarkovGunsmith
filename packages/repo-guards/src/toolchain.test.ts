import { describe, expect, it } from "vitest";
import { readDependabotUpdates } from "./dependabot.js";
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

/**
 * `@types/node` must describe the runtime this repo actually RUNS, never float ahead of
 * it. Typing a runtime you do not run is how code typechecks and then fails on an API the
 * pinned runtime lacks — this repo shipped `^25`, and later `^26`, against a node 22 pin.
 *
 * The policy was already written down in .github/dependabot.yml. It was not enforced, and
 * the declared range drifted two majors past the pin anyway; these tests are what make it
 * hold. Dependabot cannot read .nvmrc, so its ignore range is a hand-maintained mirror of
 * the pin and is asserted here rather than trusted.
 *
 * Every expected value is DERIVED from .nvmrc, so raising the runtime is one edit that
 * moves the whole set — and forgetting any half of it fails here, not at run time.
 *
 * The root `pnpm.overrides` entry matters most: it forces one @types/node across every
 * workspace member regardless of what each declares, making it the authoritative control
 * point rather than just another declaration.
 */
interface NodeTypesPkg {
  engines?: { node?: string };
  devDependencies?: Record<string, string>;
  pnpm?: { overrides?: Record<string, string> };
}

/** Leading major in a semver range — `^22.20.1`, `>=22` and `22` all read as 22. */
function majorOf(range: string): number {
  const match = /(\d+)/.exec(range);
  if (!match) throw new Error(`no major version found in range: ${range}`);
  return Number(match[1]);
}

function readPkg(relPath: string): NodeTypesPkg {
  return JSON.parse(readRepoFile(relPath)) as NodeTypesPkg;
}

describe("@types/node tracks the pinned node runtime", () => {
  const nodeMajor = () => majorOf(readRepoFile(".nvmrc").trim());

  it("root devDependency major matches .nvmrc", () => {
    const declared = readPkg("package.json").devDependencies?.["@types/node"];
    expect(declared, "root package.json does not declare @types/node").toBeDefined();
    expect(majorOf(declared!)).toBe(nodeMajor());
  });

  it("pnpm override major matches .nvmrc", () => {
    const override = readPkg("package.json").pnpm?.overrides?.["@types/node"];
    expect(override, "root package.json does not override @types/node").toBeDefined();
    expect(majorOf(override!)).toBe(nodeMajor());
  });

  it("engines.node major matches .nvmrc", () => {
    const engines = readPkg("package.json").engines?.node;
    expect(engines, "root package.json does not declare engines.node").toBeDefined();
    expect(majorOf(engines!)).toBe(nodeMajor());
  });

  it("this package's own @types/node major matches .nvmrc", () => {
    const declared = readPkg("packages/repo-guards/package.json").devDependencies?.["@types/node"];
    expect(declared, "repo-guards does not declare @types/node").toBeDefined();
    expect(majorOf(declared!)).toBe(nodeMajor());
  });

  it("dependabot blocks the first major above the pinned runtime", () => {
    const npm = readDependabotUpdates().find((u) => u["package-ecosystem"] === "npm");
    expect(npm, "no npm ecosystem entry in dependabot.yml").toBeDefined();

    const entry = npm!.ignore?.find((i) => i["dependency-name"] === "@types/node");
    expect(entry, "dependabot does not ignore @types/node at all").toBeDefined();

    const floors = (entry!.versions ?? []).map(majorOf);
    expect(floors, "@types/node ignore declares no version range").not.toEqual([]);
    // Blocking exactly one major above the pin keeps the NEXT major arriving as the
    // re-evaluation point, rather than silencing the dependency forever.
    for (const floor of floors) expect(floor).toBe(nodeMajor() + 1);
  });
});
