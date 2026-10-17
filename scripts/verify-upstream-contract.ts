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
  AR15_BARREL_10_3,
  CQR_GRIP,
  HAMR_SCOPE,
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
import { SNAPSHOT_BUDGET, UPSTREAM_FLOORS } from "../packages/tarkov-data/src/snapshot/limits.js";
import { COMPLETED_QUESTS_CAP } from "../packages/tarkov-data/src/build-schema.js";
import {
  snapshotPartCatalog,
  snapshotWeaponList,
} from "../packages/tarkov-data/src/snapshot/views.js";
import type { ItemsDocument } from "../packages/tarkov-data/src/queries/documents.js";
import {
  buildSlotGraph,
  selectWeaponTree,
} from "../packages/tarkov-data/src/queries/slot-graph.js";
import type { WeaponListItem } from "../packages/tarkov-data/src/queries/weaponList.js";
import { presetRecordSchema } from "../packages/tarkov-data/src/queries/presets.js";
import type { BuilderSnapshot } from "../packages/tarkov-data/src/snapshot/types.js";
import { partsById, type AttachablePart } from "../packages/tarkov-data/src/queries/parts.js";
import { attachedParts } from "../packages/tarkov-data/src/attached-parts.js";
import { adaptMod, adaptWeapon } from "../packages/tarkov-data/src/ballistic-adapters.js";
import { weaponSpec } from "../packages/ballistics/src/weapon/weaponSpec.js";

const API_BASE = "https://json.tarkov.dev/regular/";
const ITEMS_URL = `${API_BASE}items`;

interface LiveItem {
  id: string;
  weight?: number;
  /** Top-level, and a PERCENT: unlike the fraction-scale modifiers under `properties`. */
  velocity?: number | null;
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

  // Every slot-attachable part type: barrels carry one too (up to 0.1 live).
  const accuracyModifiers = [
    "ItemPropertiesWeaponMod",
    "ItemPropertiesBarrel",
    "ItemPropertiesScope",
    "ItemPropertiesMagazine",
  ]
    .flatMap(propsOfType)
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

  // The #220 stats. `velocity` is top-level and a percent (-11 = -11%); the magazine figures
  // are fractions; `centerOfImpact` (cm at 100 m) sits only on weapons and barrels, never
  // negative, which the optimizer's max-accuracy bound relies on (packages/optimizer bounds.ts).
  const partVelocities = items
    .filter((i) => {
      const type = i.properties?.["propertiesType"];
      return type !== "ItemPropertiesAmmo" && type !== "ItemPropertiesWeapon";
    })
    .map((i) => i.velocity)
    .filter((v): v is number => typeof v === "number");
  const velMin = Math.min(...partVelocities);
  const velMax = Math.max(...partVelocities);
  check(
    "unit/velocity",
    velMin < -1 && velMin >= -100 && velMax <= 100,
    `expected a percent in [-100, 100] reaching below -1, got [${velMin}, ${velMax}] — a fraction ` +
      `scale here means weaponSpec's velocity/100 is off by 100x`,
  );
  notes.push(`part velocity range [${velMin}, ${velMax}] (percent, top-level)`);

  const numbersOf = (type: string, key: string) =>
    propsOfType(type)
      .map((p) => p[key])
      .filter((v): v is number => typeof v === "number");
  const loadModifiers = numbersOf("ItemPropertiesMagazine", "loadModifier");
  const malfunctions = numbersOf("ItemPropertiesMagazine", "malfunctionChance");
  const loadRange = [Math.min(...loadModifiers), Math.max(...loadModifiers)];
  const malfRange = [Math.min(...malfunctions), Math.max(...malfunctions)];
  check(
    "unit/loadModifier",
    loadRange[0]! >= -1 && loadRange[1]! <= 1,
    `expected a fraction in [-1, 1], got [${loadRange.join(", ")}] — the Spec panel shows it ×100`,
  );
  check(
    "unit/malfunctionChance",
    malfRange[0]! >= 0 && malfRange[1]! <= 1,
    `expected a fraction in [0, 1], got [${malfRange.join(", ")}] — the Spec panel shows it ×100`,
  );
  notes.push(
    `magazine loadModifier [${loadRange.join(", ")}], malfunctionChance [${malfRange.join(", ")}] (fractions)`,
  );

  const strayStats: string[] = [];
  for (const item of items) {
    const props = item.properties;
    const type = props?.["propertiesType"];
    if (props == null || type === "ItemPropertiesWeapon") continue;
    for (const key of ["fireRate", "effectiveDistance"]) {
      if (props[key] != null) strayStats.push(`${item.id} (${String(type)}) has ${key}`);
    }
    if (type !== "ItemPropertiesBarrel" && props["centerOfImpact"] != null) {
      strayStats.push(`${item.id} (${String(type)}) has centerOfImpact`);
    }
  }
  check(
    "scope/part-stats",
    strayStats.length === 0,
    `weaponSpec reads fireRate and effectiveDistance from the weapon alone, and centerOfImpact ` +
      `from the weapon and its barrel alone; these parts now carry one: ${strayStats.slice(0, 5).join("; ")}`,
  );
  const centers = [
    ...numbersOf("ItemPropertiesWeapon", "centerOfImpact"),
    ...numbersOf("ItemPropertiesBarrel", "centerOfImpact"),
  ];
  check(
    "bounds/centerOfImpact",
    Math.min(...centers) >= 0,
    `expected centerOfImpact >= 0, got ${Math.min(...centers)} — the optimizer's max-accuracy bound assumes it`,
  );
  notes.push(
    `centerOfImpact [${Math.min(...centers)}, ${Math.max(...centers)}] cm on weapons and barrels only`,
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
    checkNumber("weapon/M4A1/centerOfImpact", weaponLive["centerOfImpact"], M4A1.centerOfImpact);
    checkNumber("weapon/M4A1/deviationCurve", weaponLive["deviationCurve"], M4A1.deviationCurve);
    checkNumber("weapon/M4A1/velocity", byId[M4A1.id]?.velocity, M4A1.velocity);
    checkNumber("weapon/M4A1/fireRate", weaponLive["fireRate"], M4A1.fireRate);
    checkNumber(
      "weapon/M4A1/effectiveDistance",
      weaponLive["effectiveDistance"],
      M4A1.effectiveDistance,
    );
    checkNumber("weapon/M4A1/sightingRange", weaponLive["sightingRange"], M4A1.sightingRange);
    const ammoId = weaponLive["defaultAmmo"];
    const ammo = typeof ammoId === "string" ? byId[ammoId]?.properties : undefined;
    checkNumber(
      "weapon/M4A1/defaultAmmo/initialSpeed",
      ammo?.["initialSpeed"],
      M4A1.defaultAmmo?.initialSpeed ?? Number.NaN,
    );
  }

  for (const mod of [CQR_GRIP, UBR_GEN2_STOCK, VP09_MUZZLE_BRAKE, AR15_BARREL_10_3, HAMR_SCOPE]) {
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
    checkNumber(`mod/${mod.name}/velocity`, item?.velocity, mod.velocity);
    checkNumber(`mod/${mod.name}/centerOfImpact`, live["centerOfImpact"] ?? 0, mod.centerOfImpact);
    if (mod.deviationMax !== null) {
      checkNumber(`mod/${mod.name}/deviationMax`, live["deviationMax"], mod.deviationMax);
    }
    if (mod.sightingRange !== null) {
      checkNumber(`mod/${mod.name}/sightingRange`, live["sightingRange"], mod.sightingRange);
    }
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

/** Brotli at the quality the budget is measured at, roughly what Cloudflare's edge serves. */
const edgeBrotli = (text: string): number =>
  brotliCompressSync(text, {
    params: { [constants.BROTLI_PARAM_QUALITY]: SNAPSHOT_BUDGET.brotliQuality },
  }).length;

/**
 * The Builder snapshot still generates from the live documents, and still fits its budget.
 *
 * This is the same strict generator, with the same floors (`UPSTREAM_FLOORS`) and size
 * budget (`SNAPSHOT_BUDGET`), that the release deploy runs (`apps/web/scripts/
 * builder-snapshot.ts`): every problem it reports here would fail that deploy. Checking on a
 * schedule finds it before a release does.
 */

async function checkBuilderSnapshot(): Promise<void> {
  // Translations required, exactly as the release build reads them.
  const client = createTarkovClient(API_BASE, undefined, undefined, {
    requireTranslations: true,
  });
  const documents = await fetchSnapshotDocuments(client);
  let generated: ReturnType<typeof buildBuilderSnapshot>;
  try {
    generated = buildBuilderSnapshot(documents, "upstream");
  } catch (error) {
    if (!(error instanceof SnapshotDriftError)) throw error;
    for (const problem of error.problems) check("snapshot", false, problem);
    return;
  }
  const { snapshot, prices } = generated;
  // The floors are enforced inside generation, which reports them as drift above.
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
      `headroom ${kb(SNAPSHOT_BUDGET.rawBytes - raw)} raw, ${kb(SNAPSHOT_BUDGET.brotliBytes - brotli)} brotli)`,
  );
  notes.push(
    `builder prices: ${kb(Buffer.byteLength(pricesText))} raw, ` +
      `${kb(edgeBrotli(pricesText))} brotli (q4); data as of ${snapshot.dataAsOf}`,
  );
  checkQuestGating(snapshot);
  // Presets are checked against the weapons and parts the Builder actually reads: the snapshot.
  const weapons = snapshotWeaponList(snapshot, prices.prices);
  const catalog = snapshotPartCatalog(snapshot, prices.prices);
  checkPresets(documents.items, snapshot.presets, weapons, catalog);
  checkSlotGraphBounds(documents.items, weapons, catalog);
}

/**
 * The snapshot's task list is exactly the quests its offers are gated by: the profile editor
 * lists those, and TarkovTracker sync keeps only those. The floor on quest-gated offers and
 * the ceiling on gating quests run inside generation.
 */
function checkQuestGating(snapshot: BuilderSnapshot): void {
  const gated = Object.values(snapshot.offers)
    .flat()
    .flatMap((o) =>
      o.kind !== "flea" && o.vendor.taskUnlock !== null ? [o.vendor.taskUnlock] : [],
    );
  const gating = new Set(gated.map((q) => q.normalizedName));
  const listed = new Set(snapshot.tasks.map((t) => t.normalizedName));
  const unlisted = [...gating].filter((q) => !listed.has(q));
  const extra = [...listed].filter((q) => !gating.has(q));
  check(
    "snapshot/quest-gating",
    unlisted.length === 0 && extra.length === 0,
    `tasks and quest gates disagree: gating but not listed [${unlisted.join(", ")}], ` +
      `listed but gating nothing [${extra.join(", ")}]`,
  );
  notes.push(
    `quest gating: ${gating.size} quests gate ${gated.length} offers ` +
      `(floor ${UPSTREAM_FLOORS.questOffers} offers; at most ${COMPLETED_QUESTS_CAP} quests)`,
  );
}

/**
 * Every weapon preset in the snapshot reproduces upstream's own preset ergonomics and recoil —
 * the stat oracle (#220), over the whole document rather than the six presets the unit test
 * pins.
 *
 * Upstream's preset stats count each DISTINCT part once, while the Builder counts every physical
 * part (a preset listing 3× rail has three rails). So the oracle is checked over distinct parts,
 * and the presets where the per-part figure differs are counted, not failed.
 */
function checkPresets(
  doc: ItemsDocument,
  byWeapon: BuilderSnapshot["presets"],
  weapons: readonly WeaponListItem[],
  parts: readonly AttachablePart[],
): void {
  // Placement failures and the preset floors are drift inside generation, reported above.
  const graph = buildSlotGraph(doc);
  const byId = partsById(parts);
  const weaponById = new Map(weapons.map((w) => [w.id, w]));
  let placed = 0;
  let perPartMatches = 0;
  let moaChecked = 0;
  const misses: string[] = [];
  const moaMisses: string[] = [];
  for (const [weaponId, presets] of Object.entries(byWeapon)) {
    const weapon = weaponById.get(weaponId);
    if (weapon === undefined) {
      misses.push(`${weaponId}: weapon not in the weapon list`);
      continue;
    }
    const tree = selectWeaponTree(doc, weaponId, graph);
    for (const preset of presets) {
      placed += 1;
      const stats = presetRecordSchema.parse(doc.items[preset.id]).properties;
      const { entries, missing } = attachedParts(tree, preset.attachments, byId);
      const distinct = [...new Map(entries.map((e) => [e.part.id, e.part])).values()];
      const matches = (spec: ReturnType<typeof weaponSpec>) =>
        Math.abs(spec.ergonomics - stats.ergonomics) < 1e-6 &&
        Math.abs(spec.verticalRecoil - stats.recoilVertical) <= 0.5 &&
        Math.abs(spec.horizontalRecoil - stats.recoilHorizontal) <= 0.5;
      const base = adaptWeapon(weapon);
      const distinctSpec = weaponSpec(base, distinct.map(adaptMod));
      if (missing.length > 0 || !matches(distinctSpec)) {
        misses.push(
          `${preset.id} ${preset.shortName}: upstream ergo ${stats.ergonomics} ` +
            `V ${stats.recoilVertical} H ${stats.recoilHorizontal}, distinct parts give ` +
            `${distinctSpec.ergonomics.toFixed(2)} / ${distinctSpec.verticalRecoil.toFixed(2)} / ` +
            `${distinctSpec.horizontalRecoil.toFixed(2)}, ${missing.length} missing`,
        );
      }
      // MOA: upstream's `moa` leaves accuracy modifiers out, so the Builder's figure is that
      // times (1 − Σ accuracyModifier) over the same distinct parts. The (1 − Σ) factor itself
      // has no upstream oracle; this pins the rest. 0.006 covers upstream's 2-decimal rounding.
      const accuracySum = distinct.reduce((sum, p) => sum + adaptMod(p).accuracyModifier, 0);
      const expectedMoa = stats.moa * (1 - accuracySum);
      moaChecked += 1;
      if (missing.length > 0 || Math.abs(distinctSpec.accuracy - expectedMoa) > 0.006) {
        moaMisses.push(
          `${preset.id} ${preset.shortName}: upstream moa ${stats.moa} × (1 − ${accuracySum.toFixed(3)}) ` +
            `= ${expectedMoa.toFixed(3)}, the Builder gives ${distinctSpec.accuracy.toFixed(3)}`,
        );
      }
      if (
        matches(
          weaponSpec(
            base,
            entries.map((e) => adaptMod(e.part)),
          ),
        )
      )
        perPartMatches += 1;
    }
  }
  check(
    "presets/oracle",
    misses.length === 0,
    `${misses.length} preset(s) disagree with upstream's own stats: ${misses.slice(0, 5).join("; ")}`,
  );
  check(
    "presets/moa",
    moaMisses.length === 0,
    `${moaMisses.length} preset(s) disagree with upstream's moa: ${moaMisses.slice(0, 5).join("; ")}`,
  );
  notes.push(
    `presets: ${placed} placed on ${Object.keys(byWeapon).length} weapons; ` +
      `${placed - misses.length} match upstream over distinct parts, ${perPartMatches} also ` +
      `counting every physical part; MOA ${moaChecked - moaMisses.length}/${moaChecked} within 0.006`,
  );
}

/**
 * The most of `value` any build of a weapon can collect: per slot, the best of leaving it empty
 * or fitting one allowed item (its own value plus the best of its sub-slots), summed over slots.
 * Conflicts are ignored, so it over-estimates if anything.
 */
function slotGraphMaximum(
  graph: ReturnType<typeof buildSlotGraph>,
  value: (itemId: string) => number,
): (weaponId: string) => number {
  const memo = new Map<string, number>();
  const maximum = (ownerId: string, visiting: Set<string>): number => {
    const hit = memo.get(ownerId);
    if (hit !== undefined) return hit;
    if (visiting.has(ownerId)) return 0;
    visiting.add(ownerId);
    let total = 0;
    for (const slot of graph.owners[ownerId]?.slots ?? []) {
      let best = 0;
      for (const id of slot.allowedItemIds) {
        best = Math.max(best, value(id) + maximum(id, visiting));
      }
      total += best;
    }
    visiting.delete(ownerId);
    memo.set(ownerId, total);
    return total;
  };
  return (weaponId) => maximum(weaponId, new Set());
}

/**
 * The two facts the optimizer's max-accuracy bound (`packages/optimizer/src/bounds.ts`) rests on,
 * over every weapon's slot graph with conflicts ignored (so a weapon passes only if no chain of
 * allowed items breaks them):
 *
 * - no weapon can mount two barrels — the bound takes the build's `centerOfImpact` as the
 *   weapon's plus ONE barrel's;
 * - the summed `accuracyModifier` of any build lies in (-1, 1) — the bound needs 1 − a ≤ 2 and
 *   1 − a ≥ 0 for every running and final sum a.
 */
function checkSlotGraphBounds(
  doc: ItemsDocument,
  weapons: readonly WeaponListItem[],
  parts: readonly AttachablePart[],
): void {
  const graph = buildSlotGraph(doc);
  const byId = partsById(parts);
  const accuracy = (id: string) => {
    const part = byId.get(id);
    return part === undefined ? 0 : adaptMod(part).accuracyModifier;
  };
  const barrels = slotGraphMaximum(graph, (id) =>
    byId.get(id)?.properties.propertiesType === "ItemPropertiesBarrel" ? 1 : 0,
  );
  const highest = slotGraphMaximum(graph, accuracy);
  const lowest = slotGraphMaximum(graph, (id) => -accuracy(id));

  const over = weapons.filter((w) => barrels(w.id) > 1);
  const most = Math.max(0, ...weapons.map((w) => barrels(w.id)));
  check(
    "bounds/barrels-per-weapon",
    over.length === 0,
    `${over.length} weapon(s) can mount more than one barrel: ` +
      `${over
        .slice(0, 5)
        .map((w) => w.shortName)
        .join(", ")}`,
  );
  notes.push(`barrels: at most ${most} per weapon over ${weapons.length} weapons`);

  const sumMax = Math.max(0, ...weapons.map((w) => highest(w.id)));
  const sumMin = -Math.max(0, ...weapons.map((w) => lowest(w.id)));
  check(
    "bounds/accuracy-sum",
    sumMax < 1 && sumMin > -1,
    `a build's summed accuracyModifier can reach [${sumMin}, ${sumMax}], outside (-1, 1) — ` +
      `the optimizer's max-accuracy bound assumes it stays inside`,
  );
  notes.push(
    `summed accuracyModifier per build within [${sumMin.toFixed(3)}, ${sumMax.toFixed(3)}] (conflicts ignored)`,
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
