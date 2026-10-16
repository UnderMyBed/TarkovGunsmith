/**
 * Shared builds (`b:`) and pairs (`p:`) never expire. Only the rate-limit counters carry a TTL.
 *
 * Keys written before the TTL was removed still carry their old `expirationTtl`. Every
 * permanent write is stamped with `{ permanent: true }` KV metadata, so a read that finds a
 * live value WITHOUT the stamp knows it is a legacy key and re-puts it without a TTL.
 *
 * The upgrade is a best-effort backstop for the operator's bulk re-put, not a guarantee.
 * KV is eventually consistent (~60s), so a freshly upgraded key can still read back unstamped
 * from another location. To keep a burst of reads from each spending a write, an attempt is
 * deduped twice, neither costing KV quota: a per-isolate `Set` of keys already attempted, and
 * a per-colo marker in the Cache API that other isolates in the same location see. Across
 * locations a legacy key can still be upgraded more than once; that is bounded by the number
 * of colos and by the key being unstamped only until the first write propagates.
 */
export interface PermanentMetadata {
  permanent: true;
}

const PERMANENT: PermanentMetadata = { permanent: true };

const attempted = new Set<string>();
const MARKER_MAX_AGE_SECONDS = 300;

function markerRequest(key: string): Request {
  return new Request(`https://upgrade-marker.internal/${encodeURIComponent(key)}`);
}

/** True when another isolate in this colo already attempted the upgrade. Never throws. */
async function markedElsewhere(key: string): Promise<boolean> {
  try {
    return (await caches.default.match(markerRequest(key))) !== undefined;
  } catch {
    return false;
  }
}

async function writeMarker(key: string): Promise<void> {
  try {
    await caches.default.put(
      markerRequest(key),
      new Response("1", { headers: { "Cache-Control": `max-age=${MARKER_MAX_AGE_SECONDS}` } }),
    );
  } catch {
    // Cache API failures must never fail a read.
  }
}

async function upgrade(kv: KVNamespace, key: string, value: string): Promise<void> {
  if (await markedElsewhere(key)) return;
  await writeMarker(key);
  try {
    await putPermanent(kv, key, value);
  } catch (err) {
    console.error(`permanent upgrade failed for ${key}`, err);
  }
}

/** Write `value` with no expiry, stamped so reads can tell it from a legacy TTL'd key. */
export async function putPermanent(kv: KVNamespace, key: string, value: string): Promise<void> {
  await kv.put(key, value, { metadata: PERMANENT });
}

/**
 * Read `key`. If it is a live legacy key (no permanent stamp), schedule a best-effort re-put of
 * the same value with the stamp and no TTL, under `ctx.waitUntil` so it doesn't delay the
 * response. A failed upgrade is logged and never fails the read.
 */
export async function getPermanent(
  kv: KVNamespace,
  ctx: ExecutionContext,
  key: string,
): Promise<string | null> {
  const { value, metadata } = await kv.getWithMetadata<Partial<PermanentMetadata>>(key);
  if (value === null) return null;
  if (metadata?.permanent !== true && !attempted.has(key)) {
    attempted.add(key);
    ctx.waitUntil(upgrade(kv, key, value));
  }
  return value;
}
