import { cacheKeyFor } from "./cache-key.js";

interface GraphQLRequestBody {
  query?: unknown;
  variables?: unknown;
  operationName?: unknown;
}

const CACHE_TTL_SECONDS = 60;

async function handleGraphQL(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body: GraphQLRequestBody;
  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    body = (await request.clone().json()) as GraphQLRequestBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query : "";
  const variables =
    body.variables && typeof body.variables === "object"
      ? (body.variables as Record<string, unknown>)
      : {};
  const operationName = typeof body.operationName === "string" ? body.operationName : undefined;

  if (!query) {
    return new Response("Missing query", { status: 400 });
  }

  const keyUrl = await cacheKeyFor({ query, variables, operationName });
  const cache = caches.default;
  const cacheKey = new Request(keyUrl);

  const cached = await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set("X-Cache", "HIT");
    return new Response(cached.body, { status: cached.status, headers });
  }

  const upstream = await fetch(env.UPSTREAM_GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables, operationName }),
  });

  const upstreamBody = await upstream.text();
  const response = new Response(upstreamBody, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
      "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
      "X-Cache": "MISS",
    },
  });

  if (upstream.ok) {
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return response;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return new Response("ok", { status: 200 });
    }
    if (url.pathname === "/graphql") {
      return handleGraphQL(request, env, ctx);
    }
    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
