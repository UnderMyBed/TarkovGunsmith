import { BuildPair } from "@tarkov/data/schemas";
import { newBuildId, BUILD_ID_REGEX } from "./id.js";
import {
  checkRateLimit,
  clientIp,
  recordAdmission,
  tooManyRequestsResponse,
} from "./rate-limit.js";
import { formatValidationError } from "./validation.js";

const MAX_BODY_BYTES = 32 * 1024;
const PAIR_PREFIX = "p:";

async function readBody(request: Request): Promise<{ size: number; text: string }> {
  const text = await request.text();
  return { size: new TextEncoder().encode(text).byteLength, text };
}

function pairUrl(requestUrl: URL, id: string): string {
  return `${requestUrl.origin}/pairs/${id}`;
}

export async function handlePostPair(request: Request, env: Env): Promise<Response> {
  const { size, text } = await readBody(request);
  if (size === 0) return new Response("Empty body", { status: 400 });
  if (size > MAX_BODY_BYTES) return new Response("Payload too large", { status: 413 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Validate against the same `BuildPair` union apps/web parses saved pairs through
  // (`@tarkov/data`'s `loadPair`) before it ever reaches KV.
  const validation = BuildPair.safeParse(parsed);
  if (!validation.success) {
    return new Response(`Invalid pair: ${formatValidationError(validation.error)}`, {
      status: 400,
    });
  }

  // See index.ts's handlePost for why this read-only check runs after every free,
  // in-memory check and shares its reasoning with rate-limit.ts.
  const ip = clientIp(request);
  const rate = await checkRateLimit(env.BUILDS, ip);
  if (!rate.allowed) return tooManyRequestsResponse();

  const id = newBuildId();
  const ttl = Number(env.BUILD_TTL_SECONDS);
  // Re-serialize the *parsed* value, not the raw `text`, so a save always round-trips
  // through the schema (e.g. Zod's `.default()`s on `PlayerProfile.level` are applied),
  // matching how handlePost stores `validation.data` for builds.
  await env.BUILDS.put(`${PAIR_PREFIX}${id}`, JSON.stringify(validation.data), {
    expirationTtl: ttl,
  });
  await recordAdmission(env.BUILDS, ip, rate.count);

  const url = pairUrl(new URL(request.url), id);
  return new Response(JSON.stringify({ id, url }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleGetPair(id: string, env: Env): Promise<Response> {
  if (!BUILD_ID_REGEX.test(id)) {
    return new Response("Invalid id", { status: 400 });
  }
  const value = await env.BUILDS.get(`${PAIR_PREFIX}${id}`);
  if (!value) return new Response("Not Found", { status: 404 });
  return new Response(value, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleForkPair(id: string, request: Request, env: Env): Promise<Response> {
  if (!BUILD_ID_REGEX.test(id)) {
    return new Response("Invalid id", { status: 400 });
  }
  const source = await env.BUILDS.get(`${PAIR_PREFIX}${id}`);
  if (!source) return new Response("Not Found", { status: 404 });

  // Fork copies bytes that are already sitting in KV (either written through
  // handlePostPair's validation above, or the OG fixture seeder's known-good shape) rather
  // than ingesting new client-supplied content, so it isn't re-validated here — but it does
  // perform a KV write, so it still counts against the same per-IP daily budget as
  // handlePostPair. Without this an attacker could bypass the cap entirely by forking
  // instead of posting.
  const ip = clientIp(request);
  const rate = await checkRateLimit(env.BUILDS, ip);
  if (!rate.allowed) return tooManyRequestsResponse();

  const newId = newBuildId();
  const ttl = Number(env.BUILD_TTL_SECONDS);
  await env.BUILDS.put(`${PAIR_PREFIX}${newId}`, source, { expirationTtl: ttl });
  await recordAdmission(env.BUILDS, ip, rate.count);

  const url = pairUrl(new URL(request.url), newId);
  return new Response(JSON.stringify({ id: newId, url }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}
