// lib/topRatedBadge.js — the "Top rated on Wayfind" badge a business puts on
// its own website. PURE: no fetch, no React, no Next. One import (the score).
//
// WHY (owner, 2026-10-31, backlinks plan): "Top rated on Wayfind" badges for
// high scoring places. A business pastes a small image link on its site, the
// link points at that place's durable /places/{id} page, and every badge is a
// real link from a real local business to gowayfind.com. It is the one
// backlink source that grows on its own as places are added.
//
// RULES THIS FILE LOCKS (scripts/check-top-rated-badge.mjs):
//   1. Eligibility is MERIT ONLY: the canonical Wayfind Score
//      (lib/wayfindScore.js, rating + review count, review-depth deduction
//      included) must be >= BADGE_MIN_SCORE, AND the place page must be
//      indexable. No creator boost, no affinity, no paid anything — a badge is
//      a public claim, so it rests on the same merit the score shows everyone.
//      An unrated place (score null) is never eligible.
//   2. The badge shows NO number. Card scores carry small boosts (creator
//      videos, Cindy Selects) that this base score does not, so printing a
//      number here could disagree with the card. "Top rated" is true either way.
//   3. The embed link is a plain followed link (no rel="nofollow", no
//      "sponsored", no "ugc") to the canonical /places/{id} URL. That is the
//      whole point: a nofollow badge earns nothing.
//   4. Everything a place name touches is XML/HTML escaped. The name comes
//      from Google / inventory data, which is untrusted input, and it lands
//      inside an SVG that is served as an image AND inside HTML a business
//      pastes into its own site.
//   5. The wordmark is the official logo, copied 1:1 from
//      public/brand/wayfind-logo.svg (the guard diffs them). Never redrawn.
import { wayfindScore } from "./wayfindScore.js";

// 0–100 internal scale. 90 = a 9.0 on the badge scale. Measured 2026-10-31 on
// wf_place_ids: 10,849 of 53,155 rated places clear it, so it means "top
// rated" and still gives thousands of businesses a badge to claim.
export const BADGE_MIN_SCORE = 90;

// Google place ids and Wayfind inventory ids are [A-Za-z0-9_-]. Anything else
// never reaches the database: the image route renders the plain badge instead.
export const BADGE_ID_RE = /^[A-Za-z0-9_-]{6,300}$/;

export const BADGE_THEMES = ["dark", "light"];
export const BADGE_W = 220;
export const BADGE_H = 80;

// The campaign tags every badge link carries, so PostHog can tell badge
// visitors apart from everyone else (utm_* is captured automatically).
export const BADGE_UTM = "utm_source=wayfind_badge&utm_medium=referral&utm_campaign=top_rated";

export function badgeTheme(t) {
  return BADGE_THEMES.includes(t) ? t : "dark";
}

export function validBadgeId(id) {
  return typeof id === "string" && BADGE_ID_RE.test(id);
}

/**
 * Is this place allowed to claim the badge?
 * @param {{indexable?:boolean, rating?:number|null, reviews?:number|null}} p
 * @returns {boolean}
 */
export function badgeEligible(p) {
  if (!p || p.indexable !== true) return false;
  const s = wayfindScore(p.rating, p.reviews);
  return typeof s === "number" && isFinite(s) && s >= BADGE_MIN_SCORE;
}

export function escapeXml(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Control characters never belong in a name, and some are invalid XML (an
// invalid character makes the whole SVG fail to render on the business's site).
function cleanName(name) {
  return String(name == null ? "" : name).replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
}

// Long names are cut at a word boundary with an ellipsis so they never spill
// outside the badge. Counted in code points so an emoji is never split.
export const BADGE_NAME_MAX = 30;
export function badgeName(name) {
  const t = cleanName(name);
  const chars = Array.from(t);
  if (chars.length <= BADGE_NAME_MAX) return t;
  const cut = chars.slice(0, BADGE_NAME_MAX - 1).join("");
  const sp = cut.lastIndexOf(" ");
  return (sp >= 12 ? cut.slice(0, sp) : cut).replace(/[\s,.;:&-]+$/, "") + "…";
}

// public/brand/wayfind-logo.svg, everything between <svg ...> and </svg>, with
// the one lettering fill replaced by __INK__ (white on dark, near black on
// light — exactly the wayfind-logo / wayfind-logo-ink pair). viewBox below.
export const LOGO_VIEWBOX = "0 0 550.61 153.00";
export const LOGO_INNER = "<defs><linearGradient id=\"pg\" x1=\"0\" y1=\"0\" x2=\"0.35\" y2=\"1\"><stop offset=\"0\" stop-color=\"#FDA60A\"/><stop offset=\"0.55\" stop-color=\"#FC5F06\"/><stop offset=\"1\" stop-color=\"#FB3502\"/></linearGradient><radialGradient id=\"pgloss\" cx=\"0.35\" cy=\"0.28\" r=\"0.7\"><stop offset=\"0\" stop-color=\"#FFFFFF\"/><stop offset=\"0.5\" stop-color=\"#FFFFFF\" stop-opacity=\"0\"/><stop offset=\"1\" stop-color=\"#FFFFFF\" stop-opacity=\"0\"/></radialGradient></defs><g transform=\"translate(28.00,104.00) scale(0.10000,-0.10000)\" fill=\"__INK__\"><path transform=\"translate(0.0,0)\" d=\"M815 551 644 0H524L413 407L302 0H182L10 551H126L241 108L358 551H477L589 110L703 551Z\"/>\n<path transform=\"translate(815.0,0)\" d=\"M297 560Q362 560 410.5 534.5Q459 509 488 471V551H603V0H488V82Q459 43 409.0 17.0Q359 -9 295 -9Q224 -9 165.0 27.5Q106 64 71.5 129.5Q37 195 37 278Q37 361 71.5 425.0Q106 489 165.5 524.5Q225 560 297 560ZM321 461Q277 461 239.0 439.5Q201 418 177.5 376.5Q154 335 154 278Q154 221 177.5 178.0Q201 135 239.5 112.5Q278 90 321 90Q365 90 403.0 112.0Q441 134 464.5 176.5Q488 219 488 276Q488 333 464.5 375.0Q441 417 403.0 439.0Q365 461 321 461Z\"/>\n<path transform=\"translate(1483.0,0)\" d=\"M571 551 233 -259H115L227 9L10 551H137L292 131L453 551Z\"/>\n<path transform=\"translate(2055.0,0)\" d=\"M306 458H204V0H89V458H24V551H89V590Q89 685 139.5 728.5Q190 772 298 772V677Q246 677 225.0 657.5Q204 638 204 590V551H306Z\"/>\n<path transform=\"translate(2377.0,0)\" d=\"M60 697Q60 728 81.0 749.0Q102 770 133 770Q163 770 184.0 749.0Q205 728 205 697Q205 666 184.0 645.0Q163 624 133 624Q102 624 81.0 645.0Q60 666 60 697ZM189 551V0H75V551Z\"/>\n<path transform=\"translate(2631.0,0)\" d=\"M579 325V0H466V308Q466 382 429.0 421.5Q392 461 328 461Q264 461 226.5 421.5Q189 382 189 308V0H75V551H189V488Q217 522 260.5 541.0Q304 560 353 560Q418 560 469.5 533.0Q521 506 550.0 453.0Q579 400 579 325Z\"/>\n<path transform=\"translate(3270.0,0)\" d=\"M298 560Q352 560 404.5 536.5Q457 513 488 474V740H603V0H488V83Q460 43 410.5 17.0Q361 -9 297 -9Q225 -9 165.5 27.5Q106 64 71.5 129.5Q37 195 37 278Q37 361 71.5 425.0Q106 489 165.5 524.5Q225 560 298 560ZM321 461Q277 461 239.0 439.5Q201 418 177.5 376.5Q154 335 154 278Q154 221 177.5 178.0Q201 135 239.5 112.5Q278 90 321 90Q365 90 403.0 112.0Q441 134 464.5 176.5Q488 219 488 276Q488 333 464.5 375.0Q441 417 403.0 439.0Q365 461 321 461Z\"/></g><g transform=\"translate(423.67,-1.04) scale(3.5336)\"><path d=\"M16 2 C9.4 2 4 7.4 4 14 c0 8.4 12 16 12 16 s12-7.6 12-16 C28 7.4 22.6 2 16 2 Z M16 8.6 a5.4 5.4 0 1 0 0.001 0 Z\" fill=\"url(#pg)\" fill-rule=\"evenodd\"/><path d=\"M16 2 C9.4 2 4 7.4 4 14 c0 8.4 12 16 12 16 s12-7.6 12-16 C28 7.4 22.6 2 16 2 Z M16 8.6 a5.4 5.4 0 1 0 0.001 0 Z\" fill=\"url(#pgloss)\" fill-rule=\"evenodd\" opacity=\"0.35\"/></g>";

const THEME = {
  dark: { bg: "#0E1116", border: "#2A323D", kicker: "#FF8A1F", ink: "#FFFFFF", name: "#E2E8F0" },
  light: { bg: "#FFFFFF", border: "#E2E8F0", kicker: "#E8630A", ink: "#0E1116", name: "#334155" },
};

const FONT = "Poppins, Inter, 'Helvetica Neue', Arial, sans-serif";

/**
 * The badge image. Self-contained SVG: no external font, image or script, so
 * it renders the same inside any site's <img> tag.
 * @param {{name?:string, theme?:string}} o
 */
export function badgeSvg({ name, theme } = {}) {
  const c = THEME[badgeTheme(theme)];
  const shown = badgeName(name);
  const label = shown ? `${shown}, top rated on Wayfind` : "Top rated on Wayfind";
  // 440x160 drawing space, shown at 220x80.
  const logoW = 214;
  const logoH = Math.round((logoW * 153) / 550.61);
  const logoY = shown ? 50 : 62;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE_W}" height="${BADGE_H}" viewBox="0 0 440 160" role="img" aria-label="${escapeXml(label)}">`,
    `<title>${escapeXml(label)}</title>`,
    `<rect x="2" y="2" width="436" height="156" rx="30" fill="${c.bg}" stroke="${c.border}" stroke-width="3"/>`,
    `<text x="220" y="${shown ? 42 : 52}" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="19" letter-spacing="5" fill="${c.kicker}">TOP RATED ON</text>`,
    `<svg x="${220 - logoW / 2}" y="${logoY}" width="${logoW}" height="${logoH}" viewBox="${LOGO_VIEWBOX}">${LOGO_INNER.replace("__INK__", c.ink)}</svg>`,
    shown ? `<text x="220" y="${logoY + logoH + 30}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="21" fill="${c.name}">${escapeXml(shown)}</text>` : "",
    `</svg>`,
  ].join("");
}

/** The canonical place page the badge links to (with the campaign tags). */
export function badgeHref(siteUrl, id) {
  return `${siteUrl}/places/${encodeURIComponent(id)}?${BADGE_UTM}`;
}

export function badgeImgSrc(siteUrl, id, theme) {
  return `${siteUrl}/api/badge/${encodeURIComponent(id)}?theme=${badgeTheme(theme)}`;
}

/**
 * The exact HTML a business pastes into its website. A plain followed link
 * (rule 3). Width/height are set so the page never jumps while it loads.
 */
export function badgeEmbedHtml({ siteUrl, id, name, theme }) {
  const shown = cleanName(name);
  const alt = shown ? `${shown} is top rated on Wayfind` : "Top rated on Wayfind";
  return `<a href="${escapeXml(badgeHref(siteUrl, id))}" target="_blank" rel="noopener" title="${escapeXml(alt)}">`
    + `<img src="${escapeXml(badgeImgSrc(siteUrl, id, theme))}" alt="${escapeXml(alt)}" width="${BADGE_W}" height="${BADGE_H}" style="border:0;max-width:100%;height:auto" loading="lazy"></a>`;
}
