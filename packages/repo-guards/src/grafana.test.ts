import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { REPO_ROOT, readRepoFile } from "./repo.js";
import { parseWorkflow } from "./workflows.js";

/**
 * infra/grafana/ is applied only by CI, after merge, against a shared stack. Nothing checks
 * its objects agree with each other or with the site until a release has already shipped, so
 * the cross-references are asserted here.
 */

interface Manifest {
  metadata: { name: string; annotations?: Record<string, string> };
  spec: Record<string, unknown>;
}

const yamlAt = <T>(path: string): T => parse(readRepoFile(path)) as T;

const folder = () => yamlAt<Manifest>("infra/grafana/resources/folder/folder.yaml");
const rule = () => yamlAt<Manifest>("infra/grafana/resources/alerting/alert-rule.yaml");
const contactPoint = () =>
  yamlAt<{ name: string; type: string; settings: { addresses: string } }>(
    "infra/grafana/contact-point.yaml",
  );
const faroApp = () => yamlAt<Manifest>("infra/grafana/faro-app.yaml");
const checks = () => [
  yamlAt<Manifest>("infra/grafana/checks/site.yaml"),
  yamlAt<Manifest>("infra/grafana/checks/api.yaml"),
];

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("infra/grafana manifests agree with each other", () => {
  it("lists every check manifest this guard reads", () => {
    const onDisk = readdirSync(join(REPO_ROOT, "infra/grafana/checks")).sort();
    expect(onDisk).toEqual(["api.yaml", "site.yaml"]);
  });

  it("files the alert rule in the TarkovGunsmith folder", () => {
    expect(folder().spec["title"]).toBe("TarkovGunsmith");
    expect(rule().metadata.annotations?.["grafana.app/folder"]).toBe(folder().metadata.name);
  });

  it("routes the alert rule straight to the contact point, never the shared policy", () => {
    expect(rule().spec["notificationSettings"]).toEqual({
      type: "SimplifiedRouting",
      receiver: contactPoint().name,
    });
  });

  it("alerts on every check, by job", () => {
    const expressions = rule().spec["expressions"] as Record<string, { model: { expr?: string } }>;
    const expr = Object.values(expressions)
      .map((e) => e.model.expr ?? "")
      .join("\n");
    for (const check of checks()) expect(expr).toContain(check.spec["job"] as string);
  });

  it("keeps the alert email address out of the repo", () => {
    expect(contactPoint().settings.addresses).toBe("${GRAFANA_ALERT_EMAIL}");
    const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
    const leaks = filesUnder(join(REPO_ROOT, "infra/grafana"))
      .filter((path) => email.test(readRepoFile(relative(REPO_ROOT, path))))
      .map((path) => relative(REPO_ROOT, path));
    expect(leaks).toEqual([]);
  });
});

describe("infra/grafana agrees with the site", () => {
  it("allows Faro exactly the origins the site starts it on", () => {
    const source = readRepoFile("apps/web/src/observability/faro-guard.ts");
    const block = /PRODUCTION_ORIGINS[^=]*=\s*\[([^\]]*)\]/.exec(source)?.[1] ?? "";
    const siteOrigins = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]!).sort();
    expect(siteOrigins.length).toBeGreaterThan(0);
    const faroOrigins = (faroApp().spec["corsOrigins"] as { url: string }[])
      .map((o) => o.url)
      .sort();
    expect(faroOrigins).toEqual(siteOrigins);
  });

  it("admits a Grafana Faro collector in the site's connect-src", () => {
    const headers = readRepoFile("apps/web/public/_headers");
    expect(headers).toMatch(/connect-src[^;\n]*https:\/\/faro-collector-[a-z0-9-]+\.grafana\.net/);
  });
});

describe("the Grafana apply is wired into the release", () => {
  type Job = {
    needs?: string | string[];
    uses?: string;
    steps?: { env?: Record<string, string> }[];
  };
  const deployJobs = () => (parseWorkflow("deploy.yml") as { jobs: Record<string, Job> }).jobs;

  it("applies Grafana before the site builds, and builds with the Faro URL it outputs", () => {
    const jobs = deployJobs();
    expect(jobs["grafana"]?.uses).toBe("./.github/workflows/grafana.yml");
    expect([jobs["pages"]?.needs].flat()).toContain("grafana");
    const envs = (jobs["pages"]?.steps ?? []).map((step) => step.env?.["VITE_FARO_URL"]);
    expect(envs).toContain("${{ needs.grafana.outputs.faro_url }}");
  });

  it("never runs the Grafana apply on a pull request", () => {
    const doc = parseWorkflow("grafana.yml") as Record<string, unknown>;
    const triggers = Object.keys((doc["on"] ?? doc["true"]) as Record<string, unknown>).sort();
    expect(triggers).toEqual(["workflow_call", "workflow_dispatch"]);
  });
});
