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

const ITEMS_URL = "https://json.tarkov.dev/regular/items";

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

  report();
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
