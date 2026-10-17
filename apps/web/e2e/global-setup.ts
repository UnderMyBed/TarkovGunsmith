/**
 * Preflight, then a watch on the servers for the rest of the run.
 *
 * Preflight: prove a browser can actually start before 35 specs try one each.
 *
 * Playwright ships its own Chromium build but not the system libraries it links against.
 * `ubuntu-24.04` (what CI runs on) already carries them, which is why `.github/workflows/ci.yml`
 * can skip `--with-deps`; a developer machine frequently does not, and the failure is one
 * `libfoo.so: cannot open shared object file` line repeated once per test, buried under the
 * per-test timeout of everything that never got a browser.
 *
 * One launch up front turns that into a single actionable message.
 *
 * Watch: see `dev-servers.ts`. Playwright starts the webServers before global setup and stops
 * them after the teardown this function returns, so the watch runs only while both servers are
 * meant to be up — and it starts only once both ports have accepted a connection.
 */
import { chromium } from "@playwright/test";
import { devServers, portAccepts, watchDevServers } from "./dev-servers.js";

const INSTALL_DEPS = "pnpm --filter @tarkov/web exec playwright install-deps chromium";
const INSTALL_BROWSER = "pnpm --filter @tarkov/web exec playwright install chromium";

export default async function globalSetup(): Promise<() => void> {
  await preflightBrowser();

  const servers = Object.values(devServers());
  for (const server of servers) {
    if (!(await portAccepts(server.port))) {
      throw new Error(
        `${server.name} is not accepting connections on 127.0.0.1:${server.port} after startup.\n` +
          `Its wrangler log: ${server.logFile}`,
      );
    }
  }
  return watchDevServers(servers);
}

// No `channel` or `executablePath` on purpose: `devices["Desktop Chrome"]` sets neither, so this
// launch resolves to the very binary the specs will use. A preflight that launched something
// else could pass while every test still failed.
//
// The signal options are off because this launch runs in the runner process. Left at their
// defaults, playwright-core installs a SIGINT handler that outlives the browser (the webServer
// processes share its kill list) and calls `process.exit(130)` on the interrupt the server
// watch sends — before Playwright prints the failures and the summary. They do not affect which
// binary is launched.
async function preflightBrowser(): Promise<void> {
  try {
    const browser = await chromium.launch({
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
    });
    await browser.close();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const missingLibrary = /(\S+\.so[.\d]*): cannot open shared object file/.exec(detail)?.[1];

    const fix = missingLibrary
      ? `Chromium is missing a system library: ${missingLibrary}\n\n` +
        `Install the browser's OS dependencies (needs sudo):\n\n  ${INSTALL_DEPS}\n`
      : `Chromium would not launch.\n\nIf the browser itself is missing:\n\n  ${INSTALL_BROWSER}\n`;

    // Rethrown, never swallowed: without a browser every spec below is meaningless, and a
    // suite that reports "0 failed" because nothing ran is worse than one that stops here.
    throw new Error(`${fix}\nUnderlying launch error:\n${detail}`, { cause: error });
  }
}
