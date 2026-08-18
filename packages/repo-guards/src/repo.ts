import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Absolute path to the repository root, resolved from this file's location. */
export const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");

/** Read a repo-relative file as UTF-8 text. */
export function readRepoFile(relPath: string): string {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

/**
 * Parse the `[tools]` table out of mise.toml.
 *
 * A hand-rolled reader rather than a TOML dependency: mise.toml in this repo is a
 * single table of `key = "value"` lines, and the guard's whole job is to fail loudly
 * if that shape changes.
 */
export function readMiseTools(): Record<string, string> {
  const tools: Record<string, string> = {};
  let inTools = false;

  for (const line of readRepoFile("mise.toml").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed === "") continue;
    if (trimmed.startsWith("[")) {
      inTools = trimmed === "[tools]";
      continue;
    }
    if (!inTools) continue;
    const match = /^([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"/.exec(trimmed);
    if (match) tools[match[1]!] = match[2]!;
  }

  return tools;
}
