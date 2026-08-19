import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { REPO_ROOT, readRepoFile } from "./repo.js";

export interface DependabotIgnore {
  "dependency-name": string;
  versions?: string[];
}

export interface DependabotUpdate {
  "package-ecosystem": string;
  directory?: string;
  directories?: string[];
  ignore?: DependabotIgnore[];
}

export function readDependabotUpdates(): DependabotUpdate[] {
  const config = parse(readRepoFile(".github/dependabot.yml")) as {
    updates?: DependabotUpdate[];
  };
  return config.updates ?? [];
}

/**
 * Every directory holding a composite action, formatted the way a dependabot
 * `directory:` value would be written (leading slash, repo-relative).
 */
export function compositeActionDirs(): string[] {
  const base = join(REPO_ROOT, ".github", "actions");
  if (!existsSync(base)) return [];

  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(base, entry.name, "action.yml")))
    .map((entry) => `/.github/actions/${entry.name}`)
    .sort();
}

/**
 * The workspace globs pnpm itself uses to discover members, straight from
 * `pnpm-workspace.yaml`.
 *
 * Dependabot's npm updates must target the workspace ROOT and nothing inside these —
 * see the reasoning in dependabot.test.ts.
 */
export function pnpmWorkspaceGlobs(): string[] {
  const workspace = parse(readRepoFile("pnpm-workspace.yaml")) as { packages?: string[] };
  return workspace.packages ?? [];
}

/**
 * Does a dependabot `directory:` value fall inside a pnpm workspace glob?
 *
 * Both sides may contain `*`. A dependabot value of `/apps/*` is itself a glob, and a
 * value of `/apps/web` is a concrete path — matching `*` as an ordinary non-slash
 * character catches both against a workspace glob of `apps/*`, which is what the guard
 * needs. Paths *below* a member (`/apps/web/tools`) count as inside it too.
 */
export function matchesGlob(directory: string, workspaceGlob: string): boolean {
  const pattern = withLeadingSlash(workspaceGlob)
    .split("/")
    .map((segment) =>
      segment
        .split("*")
        .map((literal) => literal.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*"),
    )
    .join("/");

  return new RegExp(`^${pattern}(/.*)?$`).test(withLeadingSlash(directory));
}

function withLeadingSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}
