import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { ALERTING_CONCLUSIONS, ALERT_LABELS } from "../../../.github/scripts/scheduled-failure.mjs";
import { readRepoFile } from "./repo.js";
import { parseWorkflow, workflowFiles } from "./workflows.js";

const WATCHER_FILE = "scheduled-failure.yml";

/**
 * YAML 1.1 treats a bare `on` key as the boolean true. The `yaml` package defaults to 1.2,
 * where it stays the string "on" — read both so a parser-default change cannot silently
 * disable these guards by making every lookup undefined.
 */
function triggersOf(parsed: unknown): Record<string, unknown> {
  const doc = (parsed ?? {}) as Record<string, unknown>;
  return (doc["on"] ?? doc["true"] ?? {}) as Record<string, unknown>;
}

function watchedWorkflows(): string[] {
  const workflowRun = triggersOf(parseWorkflow(WATCHER_FILE))["workflow_run"] as
    { workflows?: string[] } | undefined;
  return workflowRun?.workflows ?? [];
}

describe("failure alerting is wired to everything that can fail silently", () => {
  it("watches every workflow that runs on a schedule", () => {
    const scheduled = workflowFiles()
      .filter((file) => file !== WATCHER_FILE)
      .map((file) => parseWorkflow(file))
      .filter((parsed) => "schedule" in triggersOf(parsed))
      .map((parsed) => (parsed as { name?: string }).name ?? "");

    const unwatched = scheduled.filter((name) => !watchedWorkflows().includes(name));
    expect(unwatched).toEqual([]);
  });

  it("the YAML prefilter and the script agree on which conclusions alert", () => {
    const raw = readRepoFile(`.github/workflows/${WATCHER_FILE}`);
    const fromYaml = [...raw.matchAll(/conclusion\s*==\s*'([^']+)'/g)].map((m) => m[1]!);
    expect(fromYaml.sort()).toEqual([...ALERTING_CONCLUSIONS].sort());
  });

  it("every label the alert uses is declared in labels.yml", () => {
    const declared = (parse(readRepoFile(".github/labels.yml")) as { name: string }[]).map(
      (label) => label.name,
    );
    const undeclared = ALERT_LABELS.filter((label) => !declared.includes(label));
    expect(undeclared).toEqual([]);
  });

  it("every label the alert uses appears in the watcher workflow", () => {
    const raw = readRepoFile(`.github/workflows/${WATCHER_FILE}`);
    const missing = ALERT_LABELS.filter((label) => !raw.includes(label));
    expect(missing).toEqual([]);
  });
});
