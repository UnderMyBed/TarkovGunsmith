#!/usr/bin/env node
/**
 * Decides whether a completed workflow_run warrants filing an alert issue.
 *
 * Lives outside the workflow YAML so the decision is unit-testable — the dedupe is a
 * read-then-write and the conclusion filter is easy to widen by accident. Stdlib only,
 * no build step, so the workflow needs nothing but a node runtime.
 */
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * An ALLOW-LIST. Never widen this to `!= "success"`: the two forms differ on a CANCELLED
 * run, which is usually a human deliberately superseding one — and an alert that pages on
 * deliberate cancellation is an alert that gets muted.
 */
export const ALERTING_CONCLUSIONS = ["failure", "timed_out"];

/**
 * Labels the alert is filed with. `gh issue create` FAILS OUTRIGHT on an unknown label,
 * which would turn this alert into a failed run whose only symptom is a red tick nobody
 * watches — so the workflow creates them before filing, and a guard holds them to
 * .github/labels.yml.
 */
export const ALERT_LABELS = ["critical", "scheduled-red"];

/** Stable dedupe key. One open alert per workflow, not one per failed run. */
export function alertTitle(workflowName) {
  return `${workflowName} is failing`;
}

export function assess({ workflowName, conclusion, runEvent, runUrl, openIssues }) {
  if (!ALERTING_CONCLUSIONS.includes(conclusion)) {
    return { fileIssue: false, reason: `conclusion "${conclusion}" is not an alerting conclusion` };
  }

  const title = alertTitle(workflowName);

  // Staleness is a CONDITION, not an event: it stays true until someone fixes it. Without
  // this, a three-month stall files ninety issues, and an alert that buries its own repeat
  // is an alert that gets muted.
  if (openIssues.some((issue) => issue.title === title)) {
    return { fileIssue: false, reason: `an alert titled "${title}" is already open` };
  }

  const body = [
    `**${workflowName}** finished with conclusion \`${conclusion}\`.`,
    "",
    `- Triggering event: \`${runEvent}\``,
    `- Failed run: ${runUrl}`,
    "",
    "Filed automatically: a failing workflow nobody is watching is indistinguishable from one",
    "that never ran. Close this once the workflow is green again — it will not be re-filed",
    "while it stays open.",
  ].join("\n");

  return { fileIssue: true, title, body };
}

const BODY_DELIMITER = "SCHEDULED_FAILURE_BODY";

function writeOutput(result) {
  const lines = [`file_issue=${result.fileIssue ? "1" : "0"}`];

  if (result.fileIssue) {
    if (result.body.includes(BODY_DELIMITER)) {
      throw new Error("issue body contains the heredoc delimiter; refusing to emit output");
    }
    lines.push(`issue_title=${result.title}`);
    lines.push(`issue_body<<${BODY_DELIMITER}`, result.body, BODY_DELIMITER);
  } else {
    console.log(`::notice::not filing an alert — ${result.reason}`);
  }

  const text = `${lines.join("\n")}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, text);
  else process.stdout.write(text);
}

function main(argv) {
  const [workflowName, conclusion, runEvent, runUrl, openIssuesJson] = argv;

  // A failed `gh` listing must NEVER arrive here as an empty string — `[]` is a legitimate
  // answer (no alert open) but an outage is not, and passing one on defeats the dedupe.
  // The workflow refuses to call this script on an empty listing; this is the second line.
  if (!openIssuesJson) throw new Error("missing open-issues JSON argument");

  writeOutput(
    assess({
      workflowName,
      conclusion,
      runEvent,
      runUrl,
      openIssues: JSON.parse(openIssuesJson),
    }),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
