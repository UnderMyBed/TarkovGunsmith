import { readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { REPO_ROOT, readRepoFile } from "./repo.js";

export const WORKFLOW_DIR = ".github/workflows";

export interface RunBlock {
  /** Dotted path to the `run:` key, e.g. "jobs.release-please.steps.1.run". */
  path: string;
  /** The shell script text. */
  script: string;
}

/** Every workflow filename in .github/workflows, sorted for stable test output. */
export function workflowFiles(): string[] {
  return readdirSync(join(REPO_ROOT, WORKFLOW_DIR))
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort();
}

/** Parse one workflow into a plain JS object. */
export function parseWorkflow(file: string): unknown {
  return parse(readRepoFile(`${WORKFLOW_DIR}/${file}`));
}

/** Walk a parsed workflow and collect every `run:` scalar with its path. */
export function collectRunBlocks(node: unknown, path: string[] = []): RunBlock[] {
  const found: RunBlock[] = [];

  if (Array.isArray(node)) {
    node.forEach((item, index) => {
      found.push(...collectRunBlocks(item, [...path, String(index)]));
    });
    return found;
  }

  if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "run" && typeof value === "string") {
        found.push({ path: [...path, key].join("."), script: value });
      } else {
        found.push(...collectRunBlocks(value, [...path, key]));
      }
    }
  }

  return found;
}
