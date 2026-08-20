/**
 * Preflight: prove a browser can actually start before 35 specs try one each.
 *
 * Playwright ships its own Chromium build but not the system libraries it links against.
 * `ubuntu-24.04` (what CI runs on) already carries them, which is why `.github/workflows/ci.yml`
 * can skip `--with-deps`; a developer machine frequently does not, and the failure is one
 * `libfoo.so: cannot open shared object file` line repeated once per test, buried under the
 * per-test timeout of everything that never got a browser.
 *
 * One launch up front turns that into a single actionable message.
 */
import { chromium } from "@playwright/test";

const INSTALL_DEPS = "pnpm --filter @tarkov/web exec playwright install-deps chromium";
const INSTALL_BROWSER = "pnpm --filter @tarkov/web exec playwright install chromium";

// No launch options on purpose: `devices["Desktop Chrome"]` sets no `channel`, so a bare
// `chromium.launch()` resolves to the very binary the specs will use. A preflight that
// launched something else could pass while every test still failed.
export default async function globalSetup(): Promise<void> {
  try {
    const browser = await chromium.launch();
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
