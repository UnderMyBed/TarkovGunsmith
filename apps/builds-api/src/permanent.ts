/**
 * Shared builds (`b:`) and pairs (`p:`) never expire. Only the rate-limit counters carry a TTL.
 *
 * Keys written before the TTL was removed still carry their old `expirationTtl`. Every
 * permanent write is stamped with `{ permanent: true }` KV metadata, so a read that finds a
 * live value WITHOUT the stamp knows it is a legacy key and re-puts it once, without a TTL.
 * That costs at most one KV write per legacy key, ever. Legacy keys that are never read keep
 * their original expiry until an operator re-puts them in bulk.
 */
export interface PermanentMetadata {
  permanent: true;
}

const PERMANENT: PermanentMetadata = { permanent: true };

/** Write `value` with no expiry, stamped so reads can tell it from a legacy TTL'd key. */
export async function putPermanent(kv: KVNamespace, key: string, value: string): Promise<void> {
  await kv.put(key, value, { metadata: PERMANENT });
}

/**
 * Read `key`. If it is a live legacy key (no permanent stamp), re-put the same value with the
 * stamp and no TTL so it stops counting down. The upgrade is best-effort: a failed re-put is
 * logged and never fails the read. It runs under `ctx.waitUntil` so it doesn't delay the
 * response.
 */
export async function getPermanent(
  kv: KVNamespace,
  ctx: ExecutionContext,
  key: string,
): Promise<string | null> {
  const { value, metadata } = await kv.getWithMetadata<Partial<PermanentMetadata>>(key);
  if (value === null) return null;
  if (metadata?.permanent !== true) {
    ctx.waitUntil(
      putPermanent(kv, key, value).catch((err: unknown) => {
        console.error(`permanent upgrade failed for ${key}`, err);
      }),
    );
  }
  return value;
}
