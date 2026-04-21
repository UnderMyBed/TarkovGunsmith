const SAMPLE_BUILD = {
  version: 4 as const,
  weaponId: "5447a9cd4bdc2dbd208b4567", // M4A1
  attachments: {
    mod_pistol_grip: "55d4af3a4bdc2d972f8b456f",
    mod_stock: "5c793fc42e221600114ca25d",
    mod_barrel: "5b7be4895acfc400170e2dd5",
  },
  orphaned: [] as string[],
  createdAt: "2026-04-21T00:00:00.000Z",
  name: "RECOIL KING",
  description: "Fixture build for OG smoke tests.",
};

const SAMPLE_PAIR_RIGHT = {
  ...SAMPLE_BUILD,
  weaponId: "5bb2475ed4351e00853264e3", // HK 416A5
  name: "BASELINE",
  description: "",
};

interface SeedEnv {
  BUILDS: KVNamespace;
  OG_FIXTURE_BUILD_ID: string;
  OG_FIXTURE_PAIR_ID: string;
}

/**
 * If `OG_FIXTURE_BUILD_ID` / `OG_FIXTURE_PAIR_ID` env vars are set, seed a
 * known BuildV4 + pair under those KV keys. Idempotent — never overwrites.
 *
 * Called on first request in dev/test; a no-op in prod where the vars are
 * empty strings.
 */
export async function maybeSeedOgFixtures(env: SeedEnv): Promise<void> {
  if (env.OG_FIXTURE_BUILD_ID) {
    const key = `b:${env.OG_FIXTURE_BUILD_ID}`;
    const existing = await env.BUILDS.get(key);
    if (!existing) {
      await env.BUILDS.put(key, JSON.stringify(SAMPLE_BUILD));
    }
  }
  if (env.OG_FIXTURE_PAIR_ID) {
    const key = `p:${env.OG_FIXTURE_PAIR_ID}`;
    const existing = await env.BUILDS.get(key);
    if (!existing) {
      await env.BUILDS.put(
        key,
        JSON.stringify({
          v: 1,
          createdAt: "2026-04-21T00:00:00.000Z",
          left: SAMPLE_BUILD,
          right: SAMPLE_PAIR_RIGHT,
        }),
      );
    }
  }
}
