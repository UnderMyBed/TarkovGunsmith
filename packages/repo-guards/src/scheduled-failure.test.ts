import { describe, expect, it } from "vitest";
import {
  ALERTING_CONCLUSIONS,
  alertTitle,
  assess,
} from "../../../.github/scripts/scheduled-failure.mjs";

const base = {
  workflowName: "CodeQL",
  conclusion: "failure",
  runEvent: "schedule",
  runUrl: "https://github.com/UnderMyBed/TarkovGunsmith/actions/runs/1",
  openIssues: [] as { title: string }[],
};

describe("assess", () => {
  it("files an alert for a failing run with nothing open", () => {
    const result = assess(base);
    expect(result.fileIssue).toBe(true);
    expect(result.title).toBe("CodeQL is failing");
    expect(result.body).toContain(base.runUrl);
  });

  it("files an alert for a timed-out run", () => {
    expect(assess({ ...base, conclusion: "timed_out" }).fileIssue).toBe(true);
  });

  it("stays silent on success", () => {
    expect(assess({ ...base, conclusion: "success" }).fileIssue).toBe(false);
  });

  it("stays silent on cancellation, which is usually deliberate", () => {
    expect(assess({ ...base, conclusion: "cancelled" }).fileIssue).toBe(false);
  });

  it("does not file a second alert while one is already open", () => {
    const result = assess({ ...base, openIssues: [{ title: alertTitle("CodeQL") }] });
    expect(result.fileIssue).toBe(false);
    expect(result.reason).toContain("already open");
  });

  it("dedupes per workflow, not globally", () => {
    const result = assess({ ...base, openIssues: [{ title: alertTitle("Deploy") }] });
    expect(result.fileIssue).toBe(true);
  });

  it("exposes exactly the two alerting conclusions", () => {
    expect(ALERTING_CONCLUSIONS).toEqual(["failure", "timed_out"]);
  });
});
