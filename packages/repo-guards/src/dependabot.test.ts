import { describe, expect, it } from "vitest";
import {
  compositeActionDirs,
  matchesGlob,
  pnpmWorkspaceGlobs,
  readDependabotUpdates,
} from "./dependabot.js";

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

  // The two ecosystems have OPPOSITE rules and the config must not be "unified".
  //
  // github-actions: `directory: /` scans .github/workflows/ and nothing else, so every
  // composite action needs its own entry (the test above).
  //
  // npm-on-pnpm: a pnpm workspace keeps ONE pnpm-lock.yaml, at the root. An update job
  // launched inside /apps/web has no lockfile in scope, so it rewrites the manifest and
  // stops — and CI then fails ERR_PNPM_OUTDATED_LOCKFILE on every Dependabot PR. This is
  // the documented misconfiguration, per dependabot-core's own maintainers:
  // https://github.com/dependabot/dependabot-core/pull/11487
  //   "In PNPM workspaces, all dependencies should be updated from the root directory,
  //    where pnpm-workspace.yaml and pnpm-lock.yaml exist. Customers sometimes
  //    misconfigure Dependabot by adding both root and subdirectory updates."
  // Root-only does NOT mean members go unwatched: Dependabot reads pnpm-workspace.yaml
  // and discovers them itself. This repo shipped the globs, and all 7 npm PRs from the
  // first run failed. See 2026-08-18-dependabot-pnpm-workspace-fix-design.md.
  it("scopes npm to the pnpm workspace root, never a member directory", () => {
    const configured = readDependabotUpdates()
      .filter((update) => update["package-ecosystem"] === "npm")
      .flatMap((update) => update.directories ?? (update.directory ? [update.directory] : []));

    expect(configured).not.toEqual([]);

    // Derived from pnpm-workspace.yaml rather than hardcoded, so a future `tools/*`
    // workspace is guarded on the day it is added.
    const memberGlobs = pnpmWorkspaceGlobs();
    expect(memberGlobs).not.toEqual([]);

    const insideWorkspace = configured.filter((dir) =>
      memberGlobs.some((glob) => matchesGlob(dir, glob)),
    );
    expect(insideWorkspace).toEqual([]);
    expect(configured).toEqual(["/"]);
  });
});
