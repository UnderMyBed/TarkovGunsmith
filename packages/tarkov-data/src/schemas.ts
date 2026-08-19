/**
 * React-free entry point, exposed as `@tarkov/data/schemas`.
 *
 * The main barrel (`@tarkov/data`) re-exports the TanStack Query hooks, so importing it
 * drags `react` and `@tanstack/react-query` in with it. That is fine in the browser and
 * fatal in a Cloudflare Worker: `apps/builds-api` validates incoming payloads against these
 * same schemas, and pulling the barrel into workerd broke @cloudflare/vitest-pool-workers
 * outright — every test file failed at its first `describe()` with
 * `TypeError: Cannot read properties of undefined (reading 'config')`.
 *
 * Validating on write against the very schema the client parses on read is the point, so
 * the fix is to make that possible without the React half. Nothing here may import React,
 * a hook, or the barrel — keep this module's dependency surface to zod alone.
 */
export {
  Build,
  BuildV1,
  BuildV2,
  BuildV3,
  BuildV4,
  BuildV5,
  BuildV6,
  PlayerProfile,
  DEFAULT_PROFILE,
  CURRENT_BUILD_VERSION,
} from "./build-schema.js";
export { BuildPair, BuildPairV1, CURRENT_PAIR_VERSION } from "./pair-schema.js";
