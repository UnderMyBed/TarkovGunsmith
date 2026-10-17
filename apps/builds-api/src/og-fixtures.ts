// Every id below is present in `packages/tarkov-data/src/__fixtures__/items-sample.json` and
// sits in the named slot's own `allowedItems`, so the OG cards these seed render real stats
// from the captured document rather than from live json.tarkov.dev. The e2e build generates
// the Builder snapshot the OG Pages Functions read from those captures
// (apps/web/scripts/builder-snapshot.ts); an id the captures don't carry silently drops out
// of the card — and a missing WEAPON id throws, which shows up as the fallback PNG rather
// than as a useful failure.
import { putPermanent } from "./permanent.js";

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

/**
 * A version-1 build as the first share URLs stored it: bare mod ids, no slot paths. The OG
 * card upgrades it as the Builder does, placing each id on the M4A1 (receiver, then the
 * handguard and grip the legacy tree finds for it). Same captured ids as
 * `apps/web/e2e/builder-integrity.spec.ts`.
 */
const SAMPLE_V1_BUILD = {
  version: 1 as const,
  weaponId: "5447a9cd4bdc2dbd208b4567", // Colt M4A1
  modIds: [
    "55d355e64bdc2d962f8b4569", // M4A1 5.56x45 upper receiver
    "5ae30db85acfc408fb139a05", // M4 carbine length handguard
    "55d4b9964bdc2d1d4e8b456e", // AR-15 Colt A2 pistol grip
  ],
  createdAt: "2026-04-21T00:00:00.000Z",
};

const SAMPLE_PAIR = {
  v: 1,
  createdAt: "2026-04-21T00:00:00.000Z",
  left: SAMPLE_BUILD,
  right: SAMPLE_PAIR_RIGHT,
};

/** A comparison whose left side is a version-1 build and whose right side is empty. */
const SAMPLE_V1_PAIR = {
  v: 1,
  createdAt: "2026-04-21T00:00:00.000Z",
  left: SAMPLE_V1_BUILD,
  right: null,
};

interface SeedEnv {
  BUILDS: KVNamespace;
  OG_FIXTURE_BUILD_ID?: string;
  OG_FIXTURE_PAIR_ID?: string;
  OG_FIXTURE_V1_BUILD_ID?: string;
  OG_FIXTURE_V1_PAIR_ID?: string;
}

/**
 * For each `OG_FIXTURE_*` env var that is set, seed its record under that id: a BuildV6, a
 * pair of two, a v1 build, and a pair with a v1 side. Idempotent — never overwrites.
 *
 * Called on first request in dev/test; a no-op in prod where the vars are
 * empty strings.
 */
export async function maybeSeedOgFixtures(env: SeedEnv): Promise<void> {
  const seeds: [string | undefined, "b" | "p", unknown][] = [
    [env.OG_FIXTURE_BUILD_ID, "b", SAMPLE_BUILD],
    [env.OG_FIXTURE_PAIR_ID, "p", SAMPLE_PAIR],
    [env.OG_FIXTURE_V1_BUILD_ID, "b", SAMPLE_V1_BUILD],
    [env.OG_FIXTURE_V1_PAIR_ID, "p", SAMPLE_V1_PAIR],
  ];
  for (const [id, prefix, record] of seeds) {
    if (!id) continue;
    const key = `${prefix}:${id}`;
    if (!(await env.BUILDS.get(key))) await putPermanent(env.BUILDS, key, JSON.stringify(record));
  }
}
