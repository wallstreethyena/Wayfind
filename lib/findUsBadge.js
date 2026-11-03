// lib/findUsBadge.js — the "Find us on Wayfind" badge for a listed place that
// is NOT top rated. The top-rated badge (lib/topRatedBadge.js) is unchanged.
//
// THEME is not exported there, and that file is not edited. The palette below
// is the same object, so dark and light stay the official pair. The wordmark
// is LOGO_INNER, not a redraw.
//
// The badge shows the words "Find us on Wayfind" and the place name. It never
// shows a score, stars, or a rating number.
import {
  LOGO_INNER,
  LOGO_VIEWBOX,
  BADGE_W,
  BADGE_H,
  badgeName,
  badgeTheme,
  escapeXml,
  validBadgeId,
} from "./topRatedBadge.js";

export { BADGE_W, BADGE_H, validBadgeId };

export function findUsIdOk(id) {
  return validBadgeId(id);
}

export const FIND_US_UTM = "utm_source=wayfind_badge&utm_medium=referral&utm_campaign=find_us";

const THEME = {
  dark: { bg: "#0E1116", border: "#2A323D", kicker: "#FF8A1F", ink: "#FFFFFF", name: "#E2E8F0" },
  light: { bg: "#FFFFFF", border: "#E2E8F0", kicker: "#E8630A", ink: "#0E1116", name: "#334155" },
};

const FONT = "Poppins, Inter, 'Helvetica Neue', Arial, sans-serif";
const PHRASE = "Find us on Wayfind";

function shownName(name) {
  return badgeName(String(name == null ? "" : name).replace(/[★☆⭐]/g, ""));
}

/**
 * Self-contained SVG. No external font, image, or script.
 * @param {{ name?: string, theme?: string }} [o]
 */
export function findUsBadgeSvg({ name, theme } = {}) {
  const c = THEME[badgeTheme(theme)];
  const shown = shownName(name);
  const label = shown ? `${PHRASE}, ${shown}` : PHRASE;
  const logoW = 188;
  const logoH = Math.round((logoW * 153) / 550.61);
  const logoY = shown ? 46 : 58;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE_W}" height="${BADGE_H}" viewBox="0 0 440 160" role="img" aria-label="${escapeXml(label)}">`,
    `<title>${escapeXml(label)}</title>`,
    `<rect x="2" y="2" width="436" height="156" rx="30" fill="${c.bg}" stroke="${c.border}" stroke-width="3"/>`,
    `<text x="220" y="${shown ? 36 : 48}" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="22" fill="${c.kicker}">${escapeXml(PHRASE)}</text>`,
    `<svg x="${220 - logoW / 2}" y="${logoY}" width="${logoW}" height="${logoH}" viewBox="${LOGO_VIEWBOX}">${LOGO_INNER.replace("__INK__", c.ink)}</svg>`,
    shown ? `<text x="220" y="${logoY + logoH + 26}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="20" fill="${c.name}">${escapeXml(shown)}</text>` : "",
    `</svg>`,
  ].join("");
}

function cleanName(name) {
  return String(name == null ? "" : name).replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
}

/** The canonical place page this badge links to, with the find-us campaign tags. */
export function findUsHref(siteUrl, id) {
  return `${siteUrl}/places/${encodeURIComponent(id)}?${FIND_US_UTM}`;
}

/**
 * The HTML a business pastes onto its site. A plain followed link: no
 * nofollow, no sponsored, no ugc. The image is the dark badge.
 */
export function findUsEmbedHtml({ siteUrl, id, name }) {
  const shown = cleanName(name);
  const alt = `${shown} on Wayfind`;
  const href = findUsHref(siteUrl, id);
  const src = `${siteUrl}/api/badge-find/${encodeURIComponent(id)}?theme=dark`;
  return `<a href="${escapeXml(href)}" target="_blank" rel="noopener">`
    + `<img src="${escapeXml(src)}" alt="${escapeXml(alt)}" width="${BADGE_W}" height="${BADGE_H}" style="border:0;max-width:100%;height:auto" loading="lazy"></a>`;
}

/**
 * What the image route answers. The SVG is served only for a real id, an
 * indexable place, and a name. Anything else, including the flag being off,
 * is a 404.
 */
export function findUsBadgeResponse({ flagOn, id, place, theme } = {}) {
  if (flagOn !== true) return { status: 404, body: "Not found" };
  if (!validBadgeId(id)) return { status: 404, body: "Not found" };
  const name = place && typeof place.name === "string" ? place.name.trim() : "";
  if (!name || !place || place.indexable !== true) return { status: 404, body: "Not found" };
  return { status: 200, body: findUsBadgeSvg({ name, theme }) };
}
