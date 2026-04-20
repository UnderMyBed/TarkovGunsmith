/**
 * Cloudflare Pages Function — forwards `/api/builds/*` to the builds-api Worker.
 *
 * Uses a catch-all `[[path]]` param so both `/api/builds` (POST) and
 * `/api/builds/<id>` (GET) hit this handler. The downstream Worker expects
 * paths under `/builds/...`, so we strip `/api` before forwarding.
 *
 * The Worker URL is configured via the `BUILDS_API_URL` Pages env var —
 * typically `https://tarkov-gunsmith-builds-api.<subdomain>.workers.dev`.
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
  // Strip `/api` from the incoming path; keep `/builds/...` so the Worker routes it.
  downstream.pathname = incoming.pathname.replace(/^\/api/, "");
  downstream.search = incoming.search;

  const forwarded = new Request(downstream.toString(), request);
  return fetch(forwarded);
};
