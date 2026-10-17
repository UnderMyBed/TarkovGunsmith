/**
 * Contract check: does the live `json.tarkov.dev` document still say what our
 * fixtures and our math assume it says?
 *
 * This is the automation recommended by docs/operations/data-api-audit.md. The
 * audit's central finding was that a 100% green unit suite could not detect a
 * 100x recoil error or a 35-58x armor durability error, because every fixture
 * it ran on carried magnitudes that cannot occur upstream. Unit tests compare
 * our code against our assumptions; only this compares our assumptions against
 * reality.
 *
 * Deliberately NOT part of `pnpm test`: it needs the network, so it would make
 * the pre-merge gate fail on upstream's availability rather than on our code.
 * It runs on a schedule instead — see .github/workflows/upstream-contract.yml.
 *
 *   pnpm verify:upstream
 */
import {
  PS_545,
  BT_545,
  BP_545,
  M855,
  M995,
} from "../packages/ballistics/src/__fixtures__/ammo.js";
import {
  PACA_C2,
  MF_UNTAR_C3,
  SIX_B13_C4,
  FORT_DEFENDER_C5,
  HEXGRID_C6,
  ZABRALO_C6,
} from "../packages/ballistics/src/__fixtures__/armor.js";
import {
  M4A1,
  CQR_GRIP,
  UBR_GEN2_STOCK,
  VP09_MUZZLE_BRAKE,
} from "../packages/ballistics/src/__fixtures__/weapons.js";
import { brotliCompressSync, constants } from "node:zlib";
import { createTarkovClient } from "../packages/tarkov-data/src/client.js";
import { fetchAmmoList } from "../packages/tarkov-data/src/queries/ammoList.js";
import { fetchArmorList } from "../packages/tarkov-data/src/queries/armorList.js";
import {
  buildBuilderSnapshot,
  fetchSnapshotDocuments,
  SnapshotDriftError,
} from "../packages/tarkov-data/src/snapshot/generate.js";

const API_BASE = "https://json.tarkov.dev/regular/";
const ITEMS_URL = `${API_BASE}items`;

interface LiveItem {
  id: string;
  weight?: number;
  properties?: Record<string, unknown> | null;
}
interface LiveDocument {
  data: {
    items: Record<string, LiveItem>;
    armorMaterials: Record<string, { id: string; destructibility: number }>;
    itemCategories: Record<string, unknown>;
  };
}

const failures: string[] = [];
const notes: string[] = [];

function check(label: string, ok: boolean, detail: string): void {
  if (ok) return;
  failures.push(`${label}: ${detail}`);
}

/** Compare a fixture value against upstream, tolerating float representation only. */
function checkNumber(label: string, actual: unknown, expected: number): void {
  const ok = typeof actual === "number" && Math.abs(actual - expected) < 1e-9;
  check(label, ok, `fixture has ${expected}, upstream has ${String(actual)}`);
}

async function main(): Promise<void> {
  process.stdout.write(`Fetching ${ITEMS_URL} ...\n`);
  const response = await fetch(ITEMS_URL, { headers: { "accept-encoding": "gzip" } });
  if (!response.ok) {
    process.stderr.write(`FETCH FAILED: ${response.status} ${response.statusText}\n`);
    process.exit(2);
  }
  const doc = (await response.json()) as LiveDocument;

  // ---- 1. Document shape ------------------------------------------------
  // A new top-level shape means every fetcher in packages/tarkov-data is
  // reading a document that no longer exists in the form it expects.
  check("shape", typeof doc.data?.items === "object", "data.items missing");
  check("shape", typeof doc.data?.armorMaterials === "object", "data.armorMaterials missing");
  check("shape", typeof doc.data?.itemCategories === "object", "data.itemCategories missing");
  if (failures.length > 0) {
    report();
    return;
  }

  const items = Object.values(doc.data.items);
  const byId = doc.data.items;
  notes.push(`${items.length} items in the live document`);

  // ---- 2. Unit-scale invariants -----------------------------------------
  // These are the exact scales audit §B and §G recorded. A change here is the
  // signal that an adapter is now converting into the wrong unit, which is the
  // failure mode that went undetected for years.
  const propsOfType = (type: string) =>
    items.map((i) => i.properties).filter((p) => p?.["propertiesType"] === type) as Record<
      string,
      unknown
    >[];

  const recoilModifiers = propsOfType("ItemPropertiesWeaponMod")
    .map((p) => p["recoilModifier"])
    .filter((v): v is number => typeof v === "number");
  const recoilMin = Math.min(...recoilModifiers);
  const recoilMax = Math.max(...recoilModifiers);
  check(
    "unit/recoilModifier",
    recoilMin >= -1 && recoilMax <= 1,
    `expected a fraction in [-1, 1], got [${recoilMin}, ${recoilMax}] — a percent scale here means the 100x error of §B has returned`,
  );
  notes.push(`recoilModifier range [${recoilMin}, ${recoilMax}] (fraction)`);

  const accuracyModifiers = propsOfType("ItemPropertiesWeaponMod")
    .map((p) => p["accuracyModifier"])
    .filter((v): v is number => typeof v === "number");
  const accMin = Math.min(...accuracyModifiers);
  const accMax = Math.max(...accuracyModifiers);
  check(
    "unit/accuracyModifier",
    accMin >= -1 && accMax <= 1,
    `expected a fraction in [-1, 1], got [${accMin}, ${accMax}]`,
  );
  check(
    "sign/accuracyModifier",
    accMax > 0,
    "expected at least one POSITIVE accuracyModifier — positive means BETTER accuracy, and weaponSpec inverts the sign on that basis (§C)",
  );
  notes.push(`accuracyModifier range [${accMin}, ${accMax}] (fraction, positive = better)`);

  const armorDamages = propsOfType("ItemPropertiesAmmo")
    .map((p) => p["armorDamage"])
    .filter((v): v is number => typeof v === "number");
  const adMin = Math.min(...armorDamages);
  const adMax = Math.max(...armorDamages);
  check(
    "unit/armorDamage",
    adMax > 1 && adMax <= 100,
    `expected a percentage in (1, 100], got [${adMin}, ${adMax}] — armorDamage feeds armorDamage() as /100`,
  );
  notes.push(`armorDamage range [${adMin}, ${adMax}] (percent)`);

  // Armor class bounds the durability formula's clamp behaviour: the lower
  // clamp rails are unreachable only while class stays <= 6. See armorDamage.ts.
  const armorClasses = propsOfType("ItemPropertiesArmor")
    .map((p) => p["class"])
    .filter((v): v is number => typeof v === "number");
  const maxClass = Math.max(...armorClasses);
  check(
    "bounds/armorClass",
    maxClass <= 6,
    `expected max armor class 6, got ${maxClass} — the clamp-rail analysis in armorDamage.ts assumes class <= 6`,
  );

  const destructibilities = Object.values(doc.data.armorMaterials).map((m) => m.destructibility);
  const maxDestr = Math.max(...destructibilities);
  check("bounds/destructibility", maxDestr <= 1, `expected destructibility <= 1, got ${maxDestr}`);
  notes.push(
    `armorMaterials: ${Object.values(doc.data.armorMaterials)
      .map((m) => `${m.id}=${m.destructibility}`)
      .join(", ")}`,
  );

  // ---- 3. Every fixture still matches upstream --------------------------
  for (const ammo of [PS_545, BT_545, BP_545, M855, M995]) {
    const live = byId[ammo.id]?.properties;
    if (!live) {
      check(`ammo/${ammo.name}`, false, `id ${ammo.id} is gone from upstream`);
      continue;
    }
    checkNumber(
      `ammo/${ammo.name}/penetrationPower`,
      live["penetrationPower"],
      ammo.penetrationPower,
    );
    checkNumber(`ammo/${ammo.name}/damage`, live["damage"], ammo.damage);
    checkNumber(`ammo/${ammo.name}/armorDamage`, live["armorDamage"], ammo.armorDamagePercent);
  }

  for (const armor of [
    PACA_C2,
    MF_UNTAR_C3,
    SIX_B13_C4,
    FORT_DEFENDER_C5,
    HEXGRID_C6,
    ZABRALO_C6,
  ]) {
    const item = byId[armor.id];
    const live = item?.properties;
    if (!live) {
      check(`armor/${armor.name}`, false, `id ${armor.id} is gone from upstream`);
      continue;
    }
    checkNumber(`armor/${armor.name}/class`, live["class"], armor.armorClass);
    checkNumber(`armor/${armor.name}/durability`, live["durability"], armor.maxDurability);
    const materialId = live["material"];
    const destructibility =
      typeof materialId === "string"
        ? doc.data.armorMaterials[materialId]?.destructibility
        : undefined;
    checkNumber(
      `armor/${armor.name}/destructibility`,
      destructibility,
      armor.materialDestructibility,
    );
  }

  const weaponLive = byId[M4A1.id]?.properties;
  if (!weaponLive) {
    check("weapon/M4A1", false, `id ${M4A1.id} is gone from upstream`);
  } else {
    checkNumber("weapon/M4A1/ergonomics", weaponLive["ergonomics"], M4A1.baseErgonomics);
    checkNumber(
      "weapon/M4A1/recoilVertical",
      weaponLive["recoilVertical"],
      M4A1.baseVerticalRecoil,
    );
    checkNumber(
      "weapon/M4A1/recoilHorizontal",
      weaponLive["recoilHorizontal"],
      M4A1.baseHorizontalRecoil,
    );
    checkNumber("weapon/M4A1/weight", byId[M4A1.id]?.weight, M4A1.baseWeight);
  }

  for (const mod of [CQR_GRIP, UBR_GEN2_STOCK, VP09_MUZZLE_BRAKE]) {
    const item = byId[mod.id];
    const live = item?.properties;
    if (!live) {
      check(`mod/${mod.name}`, false, `id ${mod.id} is gone from upstream`);
      continue;
    }
    checkNumber(`mod/${mod.name}/ergonomics`, live["ergonomics"], mod.ergonomicsDelta);
    checkNumber(`mod/${mod.name}/recoilModifier`, live["recoilModifier"], mod.recoilModifier);
    checkNumber(`mod/${mod.name}/accuracyModifier`, live["accuracyModifier"], mod.accuracyModifier);
    checkNumber(`mod/${mod.name}/weight`, item?.weight, mod.weight);
  }

  await checkSelectorsAcceptLiveDocument();
  await checkBuilderSnapshot();

  report();
}

/**
 * The ammo and armor pickers still find their items in the live document.
 *
 * The checks above compare individual FIELDS against upstream. This runs the real fetchers,
 * which means the real Zod schemas: each drops any item that fails a strict per-item parse and
 * keeps going, so a renamed or retyped field doesn't error — it silently empties a picker.
 * The thresholds are deliberately far below today's counts — this is a "the selector still
 * works at all" check, not a census.
 */
async function checkSelectorsAcceptLiveDocument(): Promise<void> {
  const client = createTarkovClient(API_BASE);
  const minimums = { ammo: 50, armor: 20 } as const;
  const [ammo, armor] = await Promise.all([fetchAmmoList(client), fetchArmorList(client)]);
  const counts = { ammo: ammo.length, armor: armor.length };
  for (const [name, minimum] of Object.entries(minimums)) {
    const actual = counts[name as keyof typeof counts];
    check(
      `selector/${name}`,
      actual >= minimum,
      `only ${actual} items survived the schema (expected at least ${minimum}) — a field upstream ` +
        `renamed or retyped makes safeParse drop rows silently, which reaches users as an empty picker`,
    );
  }
  notes.push(`selectors parsed: ${counts.ammo} ammo, ${counts.armor} armor`);
}

/** Size budget for `/data/builder-snapshot.json`, which every Builder visit downloads. */
const SNAPSHOT_BUDGET = { brotliBytes: 250 * 1024, rawBytes: 4.5 * 1024 * 1024 } as const;

/**
 * The Builder snapshot still generates from the live documents, and still fits its budget.
 *
 * This is the same strict generator the release deploy runs (`apps/web/scripts/
 * builder-snapshot.ts`): any weapon, part, barter, trader or task that no longer matches its
 * schema, any weapon-reachable slot item that is not a part, and any two copies of one trader
 * offer that disagree on price is a problem here — and would fail that deploy. Checking on a
 * schedule finds it before a release does.
 */
/** Brotli at quality 4, roughly what Cloudflare's edge serves the file at. */
const edgeBrotli = (text: string): number =>
  brotliCompressSync(text, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } }).length;

async function checkBuilderSnapshot(): Promise<void> {
  // Translations required, exactly as the release build reads them.
  const client = createTarkovClient(API_BASE, undefined, undefined, {
    requireTranslations: true,
  });
  let generated: ReturnType<typeof buildBuilderSnapshot>;
  try {
    generated = buildBuilderSnapshot(await fetchSnapshotDocuments(client), "upstream");
  } catch (error) {
    if (!(error instanceof SnapshotDriftError)) throw error;
    for (const problem of error.problems) check("snapshot", false, problem);
    return;
  }
  const { snapshot, prices } = generated;
  // Strictness catches a record that changed shape; it cannot catch records that vanished.
  check(
    "snapshot/weapons",
    snapshot.weapons.length >= 50,
    `only ${snapshot.weapons.length} buildable weapons (expected at least 50)`,
  );
  check(
    "snapshot/parts",
    snapshot.parts.length >= 2000,
    `only ${snapshot.parts.length} weapon-reachable parts (expected at least 2000)`,
  );
  const text = JSON.stringify(snapshot);
  const raw = Buffer.byteLength(text);
  const brotli = edgeBrotli(text);
  const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;
  check(
    "snapshot/size",
    brotli <= SNAPSHOT_BUDGET.brotliBytes && raw <= SNAPSHOT_BUDGET.rawBytes,
    `builder-snapshot.json is ${kb(raw)} raw / ${kb(brotli)} brotli, over the budget of ` +
      `${kb(SNAPSHOT_BUDGET.rawBytes)} raw / ${kb(SNAPSHOT_BUDGET.brotliBytes)} brotli`,
  );
  const startedAt = performance.now();
  JSON.parse(text);
  const parseMs = performance.now() - startedAt;
  const pricesText = JSON.stringify(prices);
  notes.push(
    `builder snapshot: ${snapshot.weapons.length} weapons, ${snapshot.parts.length} parts, ` +
      `${kb(raw)} raw, ${kb(brotli)} brotli (q4), JSON.parse ${parseMs.toFixed(1)} ms ` +
      `(budget ${kb(SNAPSHOT_BUDGET.rawBytes)} raw / ${kb(SNAPSHOT_BUDGET.brotliBytes)} brotli q4; ` +
      `headroom ${kb(SNAPSHOT_BUDGET.brotliBytes - brotli)} brotli)`,
  );
  notes.push(
    `builder prices: ${kb(Buffer.byteLength(pricesText))} raw, ` +
      `${kb(edgeBrotli(pricesText))} brotli (q4); data as of ${snapshot.dataAsOf}`,
  );
}

function report(): void {
  for (const note of notes) process.stdout.write(`  · ${note}\n`);
  if (failures.length === 0) {
    process.stdout.write(`\n✓ upstream contract holds (${notes.length} invariants recorded)\n`);
    return;
  }
  process.stderr.write(`\n✗ ${failures.length} contract violation(s):\n`);
  for (const failure of failures) process.stderr.write(`  - ${failure}\n`);
  process.stderr.write(
    `\nA failure here means upstream moved, not that a test is flaky. Re-run the audit in\n` +
      `docs/operations/data-api-audit.md ("How to re-run this audit") before changing any fixture.\n`,
  );
  process.exit(1);
}

await main();
