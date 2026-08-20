// Every id below is present in `packages/tarkov-data/src/__fixtures__/items-sample.json` and
// sits in the named slot's own `allowedItems`, so the OG cards these seed render real stats
// from the captured document rather than from live json.tarkov.dev. The e2e suite serves
// those captures to the OG Pages Functions (apps/web/e2e/upstream-fixture-server.ts); an id
// the captures don't carry silently drops out of the card — and a missing WEAPON id throws,
// which shows up as the fallback PNG rather than as a useful failure.
const SAMPLE_BUILD = {
  version: 6 as const,
  weaponId: "5447a9cd4bdc2dbd208b4567", // Colt M4A1
  attachments: {
    mod_pistol_grip: "5a33e75ac4a2826c6e06d759", // AR-15 Hera Arms CQR pistol grip/buttstock
    mod_reciever: "55d355e64bdc2d962f8b4569", // M4A1 5.56x45 upper receiver
    mod_stock: "5649be884bdc2d79388b4577", // AR-15 Colt Carbine buffer tube
  },
  orphaned: [] as string[],
  createdAt: "2026-04-21T00:00:00.000Z",
  name: "RECOIL KING",
  description: "Fixture build for OG smoke tests.",
};

const SAMPLE_PAIR_RIGHT = {
  ...SAMPLE_BUILD,
  weaponId: "5448bd6b4bdc2dfc2f8b4569", // Makarov PM
  attachments: {
    mod_reciever: "6374a822e629013b9c0645c8", // PM pistol slide
    mod_pistolgrip: "637784c5f7b3f4ac1a0d1a9a", // PM FAB Defense PM-G pistol grip
  },
  name: "BASELINE",
  description: "",
};

interface SeedEnv {
  BUILDS: KVNamespace;
  OG_FIXTURE_BUILD_ID?: string;
  OG_FIXTURE_PAIR_ID?: string;
}

/**
 * If `OG_FIXTURE_BUILD_ID` / `OG_FIXTURE_PAIR_ID` env vars are set, seed a
 * known BuildV6 + pair under those KV keys. Idempotent — never overwrites.
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
