import { execFile } from "node:child_process";
import { chmodSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { REPO_ROOT } from "./repo.js";

/**
 * infra/grafana/apply.sh only ever runs for real in CI, against a shared stack. These tests
 * run it against fixtures/fake-gcx.sh, a stand-in that serves canned lists and records every
 * call, so its upsert logic and its failure handling are proven before it writes anything.
 */

const run = promisify(execFile);
const APPLY = join(REPO_ROOT, "infra/grafana/apply.sh");
const FAKE_GCX = join(import.meta.dirname, "fixtures", "fake-gcx.sh");

const SITE_JOB = "tarkovgunsmith-site";
const SITE_TARGET = "https://tarkovgunsmith.undermybed.dev/builder";
const API_JOB = "tarkovgunsmith-api";
const API_TARGET = "https://api.tarkovgunsmith.undermybed.dev/healthz";

const check = (job: string, target: string, id: number) => ({
  metadata: { name: `${job}-${id}` },
  spec: { job, target },
});
const existingContactPoint = [{ uid: "tarkovgunsmith-email", name: "TarkovGunsmith email" }];
const existingFaroApp = [
  {
    metadata: { name: "tarkovgunsmith-web-7" },
    spec: {
      name: "tarkovgunsmith-web",
      appKey: "abc123",
      collectEndpointURL: "https://faro-collector-prod-us-west-0.grafana.net/collect",
    },
  },
];

interface Seed {
  contactPoints?: unknown;
  checks?: unknown;
  faroApps?: unknown;
}

interface Outcome {
  code: number;
  calls: string[];
  stderr: string;
  output: string;
}

let dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

beforeAll(async () => {
  // apply.sh needs these besides gcx. CI's runner image has them; locally mise provides yq.
  // A missing tool fails here, by name, instead of as a confusing apply failure below.
  await run("bash", ["-c", "command -v jq && command -v yq && command -v envsubst"]);
});

function newState(seed: Seed): string {
  const state = mkdtempSync(join(tmpdir(), "fake-gcx-"));
  dirs.push(state);
  const write = (name: string, value: unknown) =>
    writeFileSync(join(state, name), JSON.stringify(value ?? []));
  write("contact-points.json", seed.contactPoints);
  write("checks.json", seed.checks);
  write("faro-apps.json", seed.faroApps);
  writeFileSync(join(state, "calls"), "");
  cpSync(FAKE_GCX, join(state, "gcx"));
  chmodSync(join(state, "gcx"), 0o755);
  return state;
}

async function apply(state: string, fail?: string): Promise<Outcome> {
  const output = join(state, "github-output");
  writeFileSync(output, "");
  const env = {
    ...process.env,
    PATH: `${state}:${process.env["PATH"] ?? ""}`,
    FAKE_GCX_STATE: state,
    FAKE_GCX_FAIL: fail ?? "",
    GITHUB_OUTPUT: output,
    GRAFANA_SERVER: "https://example.grafana.net",
    GRAFANA_TOKEN: "fake",
    GRAFANA_STACK_ID: "1",
    GRAFANA_PROVIDER_SYNTH_SM_URL: "https://sm.example",
    GRAFANA_PROVIDER_SYNTH_SM_TOKEN: "fake",
    GRAFANA_ALERT_EMAIL: "alerts@example.org",
  };
  const { code, stderr } = await run("bash", [APPLY], { env }).then(
    (done) => ({ code: 0, stderr: done.stderr }),
    (error: unknown) => {
      const failed = error as { code?: number; stderr?: string };
      return { code: failed.code ?? -1, stderr: failed.stderr ?? "" };
    },
  );
  const calls = readFileSync(join(state, "calls"), "utf8").split("\n").filter(Boolean);
  return { code, calls, stderr, output: readFileSync(output, "utf8") };
}

const creates = (calls: string[]) => calls.filter((call) => / create( |$)/.test(call));
const updates = (calls: string[]) =>
  calls.filter((call) => / update /.test(call) && !call.includes("--dry-run"));

describe("infra/grafana/apply.sh", () => {
  it("creates everything on an empty stack, where gcx lists checks as null", async () => {
    const state = newState({ checks: null });
    const result = await apply(state);
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(creates(result.calls).filter((c) => !c.includes("--dry-run"))).toEqual([
      expect.stringMatching(/^alert contact-points create /),
      expect.stringMatching(/^synthetic-monitoring checks create /),
      expect.stringMatching(/^synthetic-monitoring checks create /),
      expect.stringMatching(/^frontend apps create /),
    ]);
    expect(result.output).toBe(
      "faro_url=https://faro-collector-prod-us-west-0.grafana.net/collect/abc123\n",
    );
    // The address comes from the secret, filled in at apply time.
    expect(readFileSync(join(state, "contact-point-sent.yaml"), "utf8")).toContain(
      "addresses: alerts@example.org",
    );
  });

  it("creates nothing on a second run against the state the first one left", async () => {
    const state = newState({ checks: null });
    expect((await apply(state)).code).toBe(0);
    writeFileSync(join(state, "calls"), "");
    const second = await apply(state);
    expect(second.code).toBe(0);
    expect(creates(second.calls)).toEqual([]);
    expect(updates(second.calls)).toHaveLength(4);
  });

  it("updates a check that matches by job and target, by its <job>-<id> name", async () => {
    const state = newState({
      contactPoints: existingContactPoint,
      checks: [check(SITE_JOB, SITE_TARGET, 41), check(API_JOB, API_TARGET, 42)],
      faroApps: existingFaroApp,
    });
    const result = await apply(state);
    expect(result.code).toBe(0);
    expect(creates(result.calls)).toEqual([]);
    expect(updates(result.calls)).toEqual([
      expect.stringMatching(/^alert contact-points update tarkovgunsmith-email /),
      // checks/*.yaml in glob order: api.yaml, then site.yaml.
      expect.stringMatching(new RegExp(`^synthetic-monitoring checks update ${API_JOB}-42 `)),
      expect.stringMatching(new RegExp(`^synthetic-monitoring checks update ${SITE_JOB}-41 `)),
      expect.stringMatching(/^frontend apps update tarkovgunsmith-web-7 /),
    ]);
  });

  it("refuses to choose between two matching checks, and creates nothing", async () => {
    const state = newState({
      contactPoints: existingContactPoint,
      checks: [
        check(API_JOB, API_TARGET, 42),
        check(SITE_JOB, SITE_TARGET, 41),
        check(SITE_JOB, SITE_TARGET, 43),
      ],
      faroApps: existingFaroApp,
    });
    const result = await apply(state);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain(`2 objects match check ${SITE_JOB}`);
    expect(creates(result.calls)).toEqual([]);
    expect(result.output).toBe("");
  });

  it("stops when a list fails, rather than reading it as empty and creating a duplicate", async () => {
    const state = newState({ contactPoints: existingContactPoint, faroApps: existingFaroApp });
    const result = await apply(state, "synthetic-monitoring checks list");
    expect(result.code).not.toBe(0);
    expect(creates(result.calls)).toEqual([]);
    expect(result.output).toBe("");
  });

  it("stops when a list returns something other than an array", async () => {
    const state = newState({
      contactPoints: { message: "unauthorized" },
      checks: [],
      faroApps: existingFaroApp,
    });
    const result = await apply(state);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("did not return a JSON array");
    expect(creates(result.calls)).toEqual([]);
  });

  it("stops when the Faro update fails, and outputs no URL", async () => {
    const state = newState({
      contactPoints: existingContactPoint,
      checks: [check(SITE_JOB, SITE_TARGET, 41), check(API_JOB, API_TARGET, 42)],
      faroApps: existingFaroApp,
    });
    const result = await apply(state, "frontend apps update");
    expect(result.code).not.toBe(0);
    expect(creates(result.calls)).toEqual([]);
    expect(result.output).toBe("");
  });
});
