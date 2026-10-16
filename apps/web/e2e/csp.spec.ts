import { test, expect } from "./upstream.js";

// Cloudflare injects its Web Analytics beacon into every page at the edge, so it never
// appears in `dist/` and `wrangler pages dev` never serves it. This spec injects the same
// script tag the edge does and asserts the shipped CSP lets it load: a `script-src` that
// omits the beacon host blocks it silently in production, which is how analytics stayed
// dark until #209.
const BEACON = "https://static.cloudflareinsights.com/beacon.min.js";

test("the CSP admits the Cloudflare Web Analytics beacon", async ({ page }) => {
  await page.route(BEACON, (route) =>
    route.fulfill({ contentType: "text/javascript", body: "window.__cfBeacon = true;" }),
  );
  await page.goto("/");

  const outcome = await page.evaluate(
    (src) =>
      new Promise<{ loaded: boolean; violations: string[] }>((resolve) => {
        const violations: string[] = [];
        document.addEventListener("securitypolicyviolation", (e) =>
          violations.push(`${e.violatedDirective} ${e.blockedURI}`),
        );
        const script = document.createElement("script");
        script.src = src;
        script.onload = () => resolve({ loaded: true, violations });
        script.onerror = () => resolve({ loaded: false, violations });
        document.head.appendChild(script);
      }),
    BEACON,
  );

  expect(outcome.violations).toEqual([]);
  expect(outcome.loaded).toBe(true);
  expect(await page.evaluate(() => (window as { __cfBeacon?: boolean }).__cfBeacon)).toBe(true);
});

test("hashed assets are served immutable and without source maps", async ({ page, request }) => {
  await page.goto("/");
  const src = await page
    .locator('script[type="module"][src^="/assets/"]')
    .first()
    .getAttribute("src");
  expect(src).toBeTruthy();
  const asset = await request.get(src!);
  expect(asset.headers()["cache-control"]).toContain("immutable");
  expect(await asset.text()).not.toContain("sourceMappingURL");
});
