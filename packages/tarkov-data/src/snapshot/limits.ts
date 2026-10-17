/**
 * The limits a release snapshot must meet. One copy: the release build and `pnpm
 * verify:upstream` both read these, so the scheduled check warns on exactly what would fail
 * a deploy.
 */

/**
 * Minimum counts for a snapshot built from upstream. Strict parsing catches a record that
 * changed shape; it cannot catch records that vanished, which is what a renamed type
 * (`propertiesType`, the preset type) or a renamed link (`baseItem`) looks like: the rows
 * stop being recognised and the snapshot comes out valid but gutted.
 *
 * Each floor is roughly half of live on 2026-10-17 (164 weapons, 2335 parts, 303 offers that
 * sell a weapon or part through a preset, 304 barter offers, 399 weapon presets on 164
 * weapons): low enough that ordinary churn
 * upstream never trips them, high enough that losing a whole class of rows always does.
 * Parts sit closer to live because a slot-graph break loses nearly all of them at once.
 */
export const UPSTREAM_FLOORS = {
  weapons: 50,
  parts: 2000,
  presetOffers: 150,
  barterOffers: 150,
  presets: 200,
  presetWeapons: 80,
} as const;

/**
 * Size budget for `builder-snapshot.json`, which every Builder visit downloads. Brotli is
 * measured at quality 4, roughly what Cloudflare's edge serves the file at.
 *
 * - 300 KB brotli. Live data measured 236 KB on 2026-10-17, and placing presets in the
 *   snapshot (#216) adds about 27 KB, which leaves about 37 KB for upstream growth before a
 *   deliberate decision is needed.
 * - 6 MB raw. What the browser parses on load: 3.7 MB on 2026-10-17 (`JSON.parse` 6.6 ms on
 *   a desktop), plus about 280 KB for #216. The raw cap guards a payload that compresses well
 *   but costs parse time and memory.
 */
export const SNAPSHOT_BUDGET = {
  brotliQuality: 4,
  brotliBytes: 300 * 1024,
  rawBytes: 6 * 1024 * 1024,
} as const;
