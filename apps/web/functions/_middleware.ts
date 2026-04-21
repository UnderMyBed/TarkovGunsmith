/**
 * Cloudflare Pages middleware — injects Open Graph / Twitter meta tags into
 * the SPA's `index.html` for `/builder/:id` and `/builder/compare/:pairId`
 * responses so crawlers (Discord, Twitter, Slack) see `og:image` and unfurl
 * the preview card. All other paths pass through untouched.
 */
interface Env {
  BUILDS_API_URL: string;
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

  const buildMatch = /^\/builder\/([a-zA-Z0-9_-]{4,16})$/.exec(path);
  const pairMatch = /^\/builder\/compare\/([a-zA-Z0-9_-]{4,16})$/.exec(path);

  if (!buildMatch && !pairMatch) return context.next();

  const isPair = pairMatch !== null;
  const matched = buildMatch ?? pairMatch;
  const id = matched?.[1] ?? "";
  if (!id) return context.next();

  const origin = url.origin;

  const [htmlRes, entityRes] = await Promise.all([
    context.next(),
    fetch(`${context.env.BUILDS_API_URL}/${isPair ? "pairs" : "builds"}/${id}`),
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
