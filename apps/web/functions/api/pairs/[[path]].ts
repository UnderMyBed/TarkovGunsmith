/**
 * Cloudflare Pages Function — forwards `/api/pairs/*` to the builds-api Worker.
 *
 * Uses a catch-all `[[path]]` param so `/api/pairs` (POST), `/api/pairs/<id>` (GET),
 * and `/api/pairs/<id>/fork` (POST) all hit this handler. The downstream Worker
 * expects paths under `/pairs/...`, so we strip `/api` before forwarding.
 *
 * Reuses the same `BUILDS_API_URL` env var as the /builds proxy — both endpoints
 * live on the same Worker.
 */

interface Env {
  BUILDS_API_URL: string;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.BUILDS_API_URL) {
    return new Response("BUILDS_API_URL not configured on this environment", { status: 500 });
  }

  const incoming = new URL(request.url);
  const downstream = new URL(env.BUILDS_API_URL);
  // Strip `/api` from the incoming path; keep `/pairs/...` so the Worker routes it.
  downstream.pathname = incoming.pathname.replace(/^\/api/, "");
  downstream.search = incoming.search;

  const forwarded = new Request(downstream.toString(), request);
  return fetch(forwarded);
};
