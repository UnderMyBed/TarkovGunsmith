import { Build } from "@tarkov/data";
import { newBuildId, BUILD_ID_REGEX } from "./id.js";
import { maybeSeedOgFixtures } from "./og-fixtures.js";
import { handlePostPair, handleGetPair, handleForkPair } from "./pairs.js";
import {
  checkRateLimit,
  clientIp,
  recordAdmission,
  tooManyRequestsResponse,
} from "./rate-limit.js";
import { formatValidationError } from "./validation.js";

let ogSeeded = false;

const MAX_BODY_BYTES = 32 * 1024;

async function readBody(request: Request): Promise<{ size: number; text: string }> {
  const text = await request.text();
  return { size: new TextEncoder().encode(text).byteLength, text };
}

async function handlePost(request: Request, env: Env): Promise<Response> {
  const { size, text } = await readBody(request);
  if (size === 0) return new Response("Empty body", { status: 400 });
  if (size > MAX_BODY_BYTES) return new Response("Payload too large", { status: 413 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Validate against the same `Build` discriminated union apps/web parses saved builds
  // through (`@tarkov/data`'s `loadBuild`) — every version v1-v6 a real client could ever
  // send is a member, so this only ever rejects shapes no client actually produces.
  const validation = Build.safeParse(parsed);
  if (!validation.success) {
    return new Response(`Invalid build: ${formatValidationError(validation.error)}`, {
      status: 400,
    });
  }

  // Cheap checks (size, JSON syntax, schema) all happen before this KV read, so a flood of
  // malformed payloads costs zero KV operations — only requests that would otherwise
  // succeed ever touch the rate limiter. See rate-limit.ts for the full reasoning.
  const ip = clientIp(request);
  const rate = await checkRateLimit(env.BUILDS, ip);
  if (!rate.allowed) return tooManyRequestsResponse();

  const id = newBuildId();
  const ttl = Number(env.BUILD_TTL_SECONDS);
  await env.BUILDS.put(`b:${id}`, JSON.stringify(validation.data), { expirationTtl: ttl });
  await recordAdmission(env.BUILDS, ip, rate.count);

  const requestUrl = new URL(request.url);
  const url = `${requestUrl.origin}/builds/${id}`;
  return new Response(JSON.stringify({ id, url }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleGet(id: string, env: Env): Promise<Response> {
  if (!BUILD_ID_REGEX.test(id)) {
    return new Response("Invalid id", { status: 400 });
  }
  const value = await env.BUILDS.get(`b:${id}`);
  if (!value) return new Response("Not Found", { status: 404 });
  return new Response(value, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (!ogSeeded) {
      ogSeeded = true;
      ctx.waitUntil(maybeSeedOgFixtures(env));
    }
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/healthz") return new Response("ok", { status: 200 });

    if (path === "/builds") {
      if (request.method === "POST") return handlePost(request, env);
      return new Response("Method Not Allowed", { status: 405 });
    }

    const buildMatch = /^\/builds\/([^/]+)$/.exec(path);
    if (buildMatch && request.method === "GET") {
      return handleGet(buildMatch[1] ?? "", env);
    }

    if (path === "/pairs") {
      if (request.method === "POST") return handlePostPair(request, env);
      return new Response("Method Not Allowed", { status: 405 });
    }

    const pairForkMatch = /^\/pairs\/([^/]+)\/fork$/.exec(path);
    if (pairForkMatch && request.method === "POST") {
      return handleForkPair(pairForkMatch[1] ?? "", request, env);
    }

    const pairMatch = /^\/pairs\/([^/]+)$/.exec(path);
    if (pairMatch && request.method === "GET") {
      return handleGetPair(pairMatch[1] ?? "", env);
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
