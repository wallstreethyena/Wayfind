// Client-safe HOLD lock. Codes only — no inspect, no why-prose.
// Homepage JS is already against a 500KB ratchet; the page-inspect
// module must not ride along on every place card.
//
// 236862P2: Crystal River scallop pin redirected to an Italy ski lesson
// 22211P1: TreeUmph live H1 is "Sorry, this product is unavailable"

export const PRODUCT_CODE_RE = /\/d(\d+)-([A-Za-z0-9]+)/i;

export const VIATOR_SKU_DENYLIST = Object.freeze({
  "236862P2": Object.freeze({ reason: "scallop-HOLD-SKU" }),
  "22211P1": Object.freeze({ reason: "unavailable-HOLD-SKU" }),
});

export function normalizeProductCode(code) {
  const s = String(code || "").trim();
  if (!s) return "";
  const fromPath = s.match(PRODUCT_CODE_RE);
  if (fromPath) return fromPath[2].toUpperCase();
  const dashed = s.match(/^d\d+-([A-Za-z0-9]+)$/i);
  if (dashed) return dashed[1].toUpperCase();
  return s.toUpperCase();
}

export function isDeniedViatorSku(code) {
  const key = normalizeProductCode(code);
  return Object.prototype.hasOwnProperty.call(VIATOR_SKU_DENYLIST, key);
}

export function deniedViatorReason(code) {
  const key = normalizeProductCode(code);
  const row = VIATOR_SKU_DENYLIST[key];
  return row ? row.reason : "";
}

export function isViatorSearchOrHomeUrl(url) {
  const s = String(url || "").trim();
  if (!s) return false;
  if (/searchResults/i.test(s)) return true;
  try {
    const u = new URL(s);
    if (!/(?:^|\.)viator\.com$/i.test(u.hostname)) return false;
    const path = (u.pathname || "/").replace(/\/+$/, "") || "/";
    return path === "/";
  } catch {
    return /viator\.com\/?$/i.test(s);
  }
}

export function placePickIsLive(row) {
  if (!row) return false;
  if (row.provider === "viator" && isDeniedViatorSku(row.offerId)) return false;
  return true;
}
