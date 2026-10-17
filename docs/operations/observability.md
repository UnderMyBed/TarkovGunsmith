# Observability — Operations Runbook

What the site reports to Grafana Cloud, where to look, and how the Grafana side is applied,
bootstrapped, rotated and cleaned up. This is a small setup on a free tier, not production-grade
observability.

## The stack

| Item           | Value                                                                 |
| -------------- | --------------------------------------------------------------------- |
| Stack          | `shipman`, https://shipman.grafana.net (id `1520134`)                 |
| Region         | `prod-us-west-0`                                                      |
| Plan           | Free, and shared with another project                                 |
| Our objects    | Everything below; the alert rule lives in the `TarkovGunsmith` folder |
| Stack settings | Never touched, including the stack-wide notification policy           |

## What is collected

### From browsers (Faro)

The SPA loads `@grafana/faro-web-sdk` after the page has loaded, as its own chunk
(`apps/web/src/observability/`). It starts only on `https://tarkovgunsmith.undermybed.dev` and
`https://tarkov-gunsmith-web.pages.dev`, and only when the build carries `VITE_FARO_URL`. Local
dev, `wrangler pages dev`, preview deploys and every e2e run send nothing.

| Signal        | Source                                        |
| ------------- | --------------------------------------------- |
| Errors        | Uncaught errors and unhandled rejections      |
| Web vitals    | LCP, INP, CLS, FCP, TTFB, without attribution |
| Sessions      | Faro's own session id; no user id is ever set |
| Page views    | Route changes (`faro.navigation`)             |
| Custom events | The six below, sent through `track()`         |

Not collected: tracing, session replay, console output, resource timings, user-action clicks.
Every URL is sent without its query string or fragment, and with build and pair ids replaced by
their route template: `/builder/:id`, `/builder/compare/:pairId` (`scrub.ts`). A share id grants
access to a build. Geolocation is resolved at country level by Grafana. Repeated identical events
are all sent (`skipDedupe`).

| Event             | Attributes                                                                                                        | Sent when                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `weapon_selected` | `weaponId`                                                                                                        | A weapon is picked in the Builder                                                                                                |
| `mode_changed`    | `mode`: `theorycraft` or `progression`                                                                            | The mode switch or setting a profile changes the mode, in that tab only                                                          |
| `optimizer_run`   | `objective`, `outcome` (`ok`, `infeasible-<reason>`, `timeout`, `cancelled`, `abandoned`, `error`), `ms`, `exact` | An optimizer run ends; `abandoned` is a run still going when the optimizer unmounts; `exact` is false unless the search finished |
| `build_shared`    | none                                                                                                              | A build is saved to a share URL                                                                                                  |
| `build_loaded`    | `source`: `link` or `draft`                                                                                       | A shared build or a stored draft opens                                                                                           |
| `compare_opened`  | none                                                                                                              | `/builder/compare` opens                                                                                                         |

No event carries a build name or note, a TarkovTracker token or profile, or a user id.

### From Synthetic Monitoring

| Check                 | Target                                                  | Passes on               |
| --------------------- | ------------------------------------------------------- | ----------------------- |
| `tarkovgunsmith-site` | `GET https://tarkovgunsmith.undermybed.dev/builder`     | HTTP 200                |
| `tarkovgunsmith-api`  | `GET https://api.tarkovgunsmith.undermybed.dev/healthz` | HTTP 200 with body `ok` |

Both run every 5 minutes from one probe (Atlanta): about 17k executions a month against 100k
included.

### Alerting

`TarkovGunsmith site or API down` evaluates one series per check. It fires for a check when every
run of it in the last 10 minutes failed, or when it reported nothing in that window, and that has
held for 5 more minutes. Each check's vanishing is caught on its own, through
`absent_over_time`. A query that returns nothing at all pages too, without a job label. It emails
the `TarkovGunsmith email` contact point directly through the rule's own notification settings.

## Where to look

| Question                         | Where                                                      |
| -------------------------------- | ---------------------------------------------------------- |
| Errors, vitals, sessions, events | Grafana → Frontend Observability → `tarkovgunsmith-web`    |
| Is the site up                   | Grafana → Testing & synthetics → Synthetics → Checks       |
| Alert state                      | Grafana → Alerting → Alert rules → folder `TarkovGunsmith` |

Read-only from a terminal, with `GCX_KEYCHAIN=off` locally:

```bash
mise exec -- gcx frontend apps get tarkovgunsmith-web
mise exec -- gcx alert rules list
mise exec -- gcx resources get folders/tarkovgunsmith
```

`gcx synthetic-monitoring` commands try to register an SM install when no SM token is
configured, which is a write. Do not run them locally without `GRAFANA_PROVIDER_SYNTH_SM_TOKEN`.

## How it is applied

Every object is declared in `infra/grafana/` and applied by CI. Nothing is created by hand except
the bootstrap below, and nothing is applied from a workstation.

| File                                 | Object                        | Applied by                                           |
| ------------------------------------ | ----------------------------- | ---------------------------------------------------- |
| `resources/folder/folder.yaml`       | Folder `TarkovGunsmith`       | `gcx resources push`, dry run first                  |
| `resources/alerting/alert-rule.yaml` | Alert rule                    | `gcx resources push`, dry run first                  |
| `contact-point.yaml`                 | Email contact point           | Look up by name, then `update` or `create`           |
| `checks/*.yaml`                      | SM checks                     | Look up by job and target, then `update` or `create` |
| `faro-app.yaml`                      | Faro app `tarkovgunsmith-web` | Look up by name, then `update` or `create`           |

`infra/grafana/apply.sh` does all of it and fails on the first error. A lookup that finds more
than one match fails rather than picking one. After applying the Faro app it reads the app back,
builds its collector URL, checks the collector host is in `connect-src` in
`apps/web/public/_headers`, and outputs the URL.

`.github/workflows/grafana.yml` runs the script. It runs:

- **On release**, as the `grafana` job of `deploy.yml`. `pages` needs it and builds the SPA with
  its output as `VITE_FARO_URL`, so the site always reports to the app the code created. The build
  step fails if the URL is empty.
- **On `workflow_dispatch`**, on its own: `gh workflow run grafana.yml --ref main`.

It never runs on pull requests, which carry no Grafana credentials. gcx is pinned in `mise.toml`
and CI installs that exact version with `jdx/mise-action`.

`packages/repo-guards/src/grafana.test.ts` checks, on every PR, that the manifests agree with each
other and with the site: folder, receiver, check jobs, Faro origins, the CSP, the release wiring,
and that no email address is committed.

`packages/repo-guards/src/grafana-apply.test.ts` runs `apply.sh` against
`src/fixtures/fake-gcx.sh`, a stand-in `gcx` that serves canned lists and records its calls.
It covers create on an empty stack, update on a match, a second run creating nothing, and a
non-zero exit with no create on a duplicate, a failed list, a non-array list or a failed Faro
update. It needs `jq`, `yq` and `envsubst` on `PATH`.

### Release blocked on the Grafana apply

A failing `grafana` job holds the whole release, by design: the site must not ship pointing at a
Faro app the code did not create.

1. Read the failed step's log. The error names the object and the gcx call.
2. Fix the manifest or the secret, merge the fix, then dispatch `grafana.yml` alone and wait for
   it to pass.
3. Re-run the failed `Deploy` run (`gh run rerun <id> --failed`), or dispatch `deploy.yml`.

If Grafana Cloud itself is down at release time, wait for it
(https://status.grafana.com) and re-run the failed jobs. Do not remove the `grafana` dependency
to ship around it: a site built without `VITE_FARO_URL` fails the build step anyway.

## One-time bootstrap

Done once by the maintainer. Everything after this is applied by CI.

1. **Initialise Synthetic Monitoring.** In the stack, open Testing & synthetics → Synthetics and
   finish its setup until the Checks page loads without a setup prompt.
2. **Create the service account.** Administration → Users and access → Service accounts → Add:
   name `tarkovgunsmith-ci`, role **Editor**. Add a token, without expiry or with a calendar
   reminder. If the apply's Faro step returns 403, raise the role to **Admin**: the Faro API is
   proxied through a plugin that may require it.
3. **Create the SM access token.** Synthetics → Config → Access tokens → Generate.
4. **Store the repo secrets** at `https://github.com/UnderMyBed/TarkovGunsmith/settings/secrets/actions`:

| Secret                | Value                                         |
| --------------------- | --------------------------------------------- |
| `GRAFANA_SERVER`      | `https://shipman.grafana.net`                 |
| `GRAFANA_TOKEN`       | The `tarkovgunsmith-ci` service account token |
| `GRAFANA_SM_TOKEN`    | The SM access token                           |
| `GRAFANA_ALERT_EMAIL` | The address alerts go to                      |

5. **Apply.** `gh workflow run grafana.yml --ref main`, then run it a second time: the second run
   must report only `update` lines.

The stack id (`1520134`) and SM API host are not secret and live in `grafana.yml`.

## Rotating tokens

| Token                 | Steps                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `GRAFANA_TOKEN`       | Add a new token to `tarkovgunsmith-ci`, update the secret, dispatch `grafana.yml`, delete the old token |
| `GRAFANA_SM_TOKEN`    | Generate a new SM token, update the secret, dispatch `grafana.yml`, delete the old token                |
| `GRAFANA_ALERT_EMAIL` | Update the secret and dispatch `grafana.yml`; the contact point is updated in place                     |

The Faro app key is public: it ships in the site's JavaScript. It changes only if the app is
deleted and recreated, and the next release picks up the new one.

## Deleting an object

`gcx resources push` has no prune, and the other objects are applied by lookup. Removing a
manifest does **not** delete the remote object. Delete it from a CI run or, with the maintainer's
own credentials, from a terminal:

| Object        | Command                                                                       |
| ------------- | ----------------------------------------------------------------------------- |
| Alert rule    | `gcx resources delete alertrules/tarkovgunsmith-uptime`                       |
| Folder        | `gcx resources delete folders/tarkovgunsmith` (after its contents)            |
| SM check      | `gcx synthetic-monitoring checks delete <job>-<id>` (name from `checks list`) |
| Contact point | `gcx alert contact-points delete tarkovgunsmith-email`                        |
| Faro app      | `gcx frontend apps delete <slug-id>` (name from `frontend apps list`)         |

Delete the manifest in the same PR, or the next apply recreates the object.

## The sampling lever

`SAMPLING_RATE` in `apps/web/src/observability/faro-guard.ts` is the share of sessions Faro
records, 1.0 today. If Frontend Observability usage approaches the free limit, lower it and
release. Sampling is per session, so a sampled-out session sends nothing at all.
