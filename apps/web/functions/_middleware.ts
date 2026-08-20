/**
 * Cloudflare Pages middleware — injects Open Graph / Twitter meta tags into
 * the SPA's `index.html` for `/builder/:id` and `/builder/compare/:pairId`
 * responses so crawlers (Discord, Twitter, Slack) see `og:image` and unfurl
 * the preview card. All other paths pass through untouched.
 */
import { isValidBuildId } from "./lib/build-id.js";
import { buildsApiBase } from "./lib/builds-api.js";

interface Env {
  BUILDS_API_URL?: string;
}

interface BuildRecord {
  name?: string;
  description?: string;
  weaponId?: string;
}

interface PairRecord {
  left?: { name?: string; weaponId?: string } | null;
  right?: { name?: string; weaponId?: string } | null;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const path = url.pathname;

  // These two patterns decide the ROUTE SHAPE only — one path segment, no
  // separators. What counts as a valid id is `isValidBuildId`'s job, so the
  // rule lives in exactly one place (functions/lib/build-id.ts) instead of
  // being restated as a character class here.
  const buildMatch = /^\/builder\/([^/]+)$/.exec(path);
  const pairMatch = /^\/builder\/compare\/([^/]+)$/.exec(path);

  if (!buildMatch && !pairMatch) return context.next();

  const isPair = pairMatch !== null;
  const matched = buildMatch ?? pairMatch;
  const id = matched?.[1] ?? "";
  // Pass an unusable id straight through to the SPA rather than answering it
  // here: this is an HTML navigation, and the app renders its own invalid-id
  // state. Skipping the subrequest below is the point — an id that fails this
  // test would only ever earn a 400 from the Worker, and must never be
  // interpolated into the fetch URL.
  if (!isValidBuildId(id)) return context.next();

  const origin = url.origin;

  const [htmlRes, entityRes] = await Promise.all([
    context.next(),
    fetch(`${buildsApiBase(context.env)}/${isPair ? "pairs" : "builds"}/${id}`),
  ]);

  if (!entityRes.ok) return htmlRes;

  const entity: BuildRecord & PairRecord = await entityRes.json();

  const title = isPair
    ? `${entity.left?.name ?? entity.left?.weaponId ?? "BUILD A"} vs ${entity.right?.name ?? entity.right?.weaponId ?? "BUILD B"} — TarkovGunsmith`
    : `${entity.name ?? entity.weaponId ?? "Build"} — TarkovGunsmith`;

  const description = isPair
    ? "Side-by-side weapon build comparison."
    : entity.description && entity.description.length > 0
      ? entity.description
      : "Shared weapon build. Ergonomics / recoil / weight at a glance.";

  const imageUrl = `${origin}/og/${isPair ? "pair" : "build"}/${id}`;

  const injection = `
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${imageUrl}" />
  `;

  return new HTMLRewriter()
    .on("head", {
      element(el) {
        el.append(injection, { html: true });
      },
    })
    .transform(htmlRes);
};

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
