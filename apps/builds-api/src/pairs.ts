import { newBuildId, BUILD_ID_REGEX } from "./id.js";

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

  try {
    JSON.parse(text);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const id = newBuildId();
  const ttl = Number(env.BUILD_TTL_SECONDS);
  await env.BUILDS.put(`${PAIR_PREFIX}${id}`, text, { expirationTtl: ttl });

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

  const newId = newBuildId();
  const ttl = Number(env.BUILD_TTL_SECONDS);
  await env.BUILDS.put(`${PAIR_PREFIX}${newId}`, source, { expirationTtl: ttl });

  const url = pairUrl(new URL(request.url), newId);
  return new Response(JSON.stringify({ id: newId, url }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}
