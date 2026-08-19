/**
 * Per-IP daily cap on admitted KV writes, shared across every write-performing endpoint
 * (`POST /builds`, `POST /pairs`, `POST /pairs/:id/fork`).
 *
 * ## Why a KV counter instead of Cloudflare's native Rate Limiting binding
 *
 * The `ratelimit` binding is the more idiomatic Workers primitive and doesn't touch KV at
 * all, but it was rejected for two concrete reasons, not just "simpler wins":
 *
 * 1. Its `period` is constrained to exactly 10 or 60 seconds (see the Cloudflare Workers
 *    Rate Limiting binding docs). That's a burst-control shape, not a daily-budget shape —
 *    it cannot directly express "N writes per UTC day," which is what actually needs
 *    protecting here (KV's free-tier write quota resets at 00:00 UTC).
 * 2. This project is a hard $0/mo commitment (see root CLAUDE.md). Cloudflare's own docs do
 *    not state plan-tier availability for the binding one way or the other, and silently
 *    depending on an unverified paid-plan feature for the thing that's supposed to *protect*
 *    uptime is a worse failure mode than the KV counter's known, bounded cost below.
 *
 * ## Why this doesn't burn the write quota it's protecting
 *
 * The naive version of a KV counter — increment on every request, then check — costs one
 * write per attempt, so a flood of *rejected* requests would exhaust the write quota just as
 * fast as if they'd been admitted. That defeats the entire point.
 *
 * This implementation splits "check" (read) from "record" (write) and never writes for a
 * rejection:
 *
 * - `checkRateLimit` only ever calls `KVNamespace.get`. Reads are the generous side of KV's
 *   free tier (100,000/day vs. 1,000 writes/day), and — importantly — that read budget can
 *   never be exhausted by request volume alone: the Workers free plan itself caps total
 *   requests/day at 100,000, the same number, so one read per request can never outrun it.
 * - `recordAdmission` is called by the route handler *only* after a request has passed every
 *   other check and the corresponding business write (the actual build/pair) has already
 *   happened. Its own write cost is therefore bounded by `PER_IP_DAILY_WRITE_LIMIT` — once an
 *   IP is capped, every further request for the rest of the day costs one read and zero
 *   writes, no matter how many requests arrive.
 *
 * Known limitation: KV reads can lag writes by up to 60 seconds (Cloudflare's documented
 * eventual-consistency window), so a burst of concurrent requests right at the boundary
 * could admit a few more than `PER_IP_DAILY_WRITE_LIMIT`. That's an acceptable trade for a
 * dependency-free counter — this is a "meaningfully raise the bar" mitigation, not a
 * strictly-enforced billing meter.
 */

// Scoped to the UTC calendar day so the counter's own reset cadence lines up with the exact
// budget it's protecting (KV's free-tier operation limits reset at 00:00 UTC). TTL is 2 days,
// not 1: the key's *date suffix* is what scopes a count to one day, not the TTL — the TTL
// just needs to be safely longer than the longest a same-dated key can remain relevant (up to
// ~24h from creation, if created just after midnight) so it's never evicted early.
const COUNTER_TTL_SECONDS = 2 * 24 * 60 * 60;

/**
 * 20 admitted writes/IP/day. Reasoning:
 *
 * - A real user sharing/comparing/forking builds in one active session tops out well under
 *   this in practice — nothing in the app writes on every keystroke or automatically.
 * - It converts "one trivial script from one IP exhausts the entire 1,000/day account-wide
 *   budget" into "one IP can consume at most 2% of it." An attacker would need ~50 distinct
 *   IPs, each individually maxing out, to reach the same damage one unthrottled IP does
 *   today — a materially higher bar for a free, unauthenticated endpoint.
 * - Loose enough that IPs shared by many real users (CGNAT, offices, mobile carriers) aren't
 *   likely to collide with each other in normal use.
 */
export const PER_IP_DAILY_WRITE_LIMIT = 20;

function utcDateStamp(now: Date): string {
  return now.toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}

function rateLimitKey(ip: string, now: Date): string {
  return `rl:${ip}:${utcDateStamp(now)}`;
}

/** Seconds remaining until the next UTC midnight — used as the `Retry-After` hint on a 429. */
export function secondsUntilUtcMidnight(now: Date): number {
  const nextMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
  );
  return Math.ceil((nextMidnight - now.getTime()) / 1000);
}

export interface RateLimitStatus {
  allowed: boolean;
  /** Current admitted-write count for this IP today, prior to this request. */
  count: number;
}

/**
 * Read-only check. Never writes to KV — see the module comment for why that matters.
 *
 * `ip` should come from the `CF-Connecting-IP` header, which Cloudflare sets on every
 * request that reaches a Worker through its network and which a client cannot forge (any
 * client-supplied value is overwritten at the edge). Falls back to a shared "unknown" bucket
 * when the header is absent, which only happens outside real Cloudflare traffic (local dev,
 * `vitest-pool-workers`) — production requests always carry it.
 */
export async function checkRateLimit(
  kv: KVNamespace,
  ip: string,
  now: Date = new Date(),
): Promise<RateLimitStatus> {
  const raw = await kv.get(rateLimitKey(ip, now));
  const count = raw ? Number(raw) : 0;
  return { allowed: count < PER_IP_DAILY_WRITE_LIMIT, count };
}

/**
 * Records one admitted write. Call this only after `checkRateLimit` allowed the request AND
 * the corresponding business write has actually happened — never for a rejected request.
 * `previousCount` is the `count` field `checkRateLimit` just returned, so this does a plain
 * write rather than a read-modify-write (KV has no atomic increment).
 */
export async function recordAdmission(
  kv: KVNamespace,
  ip: string,
  previousCount: number,
  now: Date = new Date(),
): Promise<void> {
  await kv.put(rateLimitKey(ip, now), String(previousCount + 1), {
    expirationTtl: COUNTER_TTL_SECONDS,
  });
}

/** Extracts the rate-limit identity for a request. See `checkRateLimit` for the fallback. */
export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}

/** Standard 429 for a request over `PER_IP_DAILY_WRITE_LIMIT`, with a `Retry-After` hint. */
export function tooManyRequestsResponse(now: Date = new Date()): Response {
  return new Response("Too Many Requests — daily share limit reached for this address", {
    status: 429,
    headers: { "Retry-After": String(secondsUntilUtcMidnight(now)) },
  });
}
