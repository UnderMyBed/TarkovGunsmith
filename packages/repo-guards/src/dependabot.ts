import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { REPO_ROOT, readRepoFile } from "./repo.js";

export interface DependabotUpdate {
  "package-ecosystem": string;
  directory?: string;
  directories?: string[];
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
