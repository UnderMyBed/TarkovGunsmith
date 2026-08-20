/**
 * Cloudflare Pages Function — forwards `/api/builds/*` to the builds-api Worker.
 *
 * Uses a catch-all `[[path]]` param so both `/api/builds` (POST) and
 * `/api/builds/<id>` (GET) hit this handler. The downstream Worker expects
 * paths under `/builds/...`, so we strip `/api` before forwarding.
 *
 * The Worker URL comes from `buildsApiBase`: the `BUILDS_API_URL` binding when
 * set, otherwise the Worker's declared custom domain. See `lib/builds-api.ts`.
 */

import { buildsApiBase } from "../../lib/builds-api.js";

interface Env {
  BUILDS_API_URL?: string;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const incoming = new URL(request.url);
  const downstream = new URL(buildsApiBase(env));
  // Strip `/api` from the incoming path; keep `/builds/...` so the Worker routes it.
  downstream.pathname = incoming.pathname.replace(/^\/api/, "");
  downstream.search = incoming.search;

  const forwarded = new Request(downstream.toString(), request);
  return fetch(forwarded);
};
