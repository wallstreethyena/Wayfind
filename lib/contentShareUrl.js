// The one place that decides what URL a SHARED or SAVED non-place card carries.
//
// 2026-10-08 bug: contentCardActions.resolvedUrl() did new URL(item.url, origin).
// A Viator tour card's item.url is a Viator-relative product path
// (/tours/St-Petersburg/<slug>/d5403-173028P1?mcid=..&pid=..&medium=api&api_version=2.0),
// so the native share sheet got https://www.gowayfind.com/tours/... : a 404 on our
// site that also leaked the partner params. Saved tours stored the same URL.
//
// Rule (CLAUDE.md revenue rule 4): a commercial item is shared/saved as OUR redirect
// (/api/commerce/go for a known product code, else /api/viator/go via
// experienceGoUrl), never origin + partner path and never raw partner params.
import { commerceHref } from "./commerce.js";
import { experienceGoUrl, viatorProductGoUrl } from "./affiliates.js";

const PARTNER_PARAMS = ["mcid", "pid", "medium", "api_version", "partner_id"];
const OWN_HOST = /^(?:www\.)?gowayfind\.com$/i;

function parse(raw) {
  try { return new URL(raw, "https://www.gowayfind.com"); } catch { return null; }
}

function isCommercial(item, raw) {
  if (!raw) return false;
  const provider = String((item && item.provider) || "").toLowerCase();
  const u = parse(raw);
  if (!u) return false;
  const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || raw.startsWith("//");
  // Only Viator links are rerouted. Any other off-site URL (an event's official or
  // ticket page, a restaurant website) is shared exactly as before.
  if (absolute && /(?:^|\.)viator\.com$/i.test(u.hostname)) return true;
  if (absolute && !OWN_HOST.test(u.hostname)) return false; // non-Viator off-site: unchanged
  if (u.pathname.startsWith("/api/")) return false; // already one of our routes
  if (PARTNER_PARAMS.some((k) => u.searchParams.has(k))) return true;
  // Viator-shaped relative product path with no Wayfind page behind it.
  if (provider === "viator" && /^\/(?:tours|attractions|d\d+)\b/i.test(u.pathname)) return true;
  return false;
}

// A Viator product code, ONLY from a field that is a product code or from the product
// URL path (/tours/<city>/<slug>/d<dest>-<CODE>). item.id is deliberately NOT used:
// /api/commerce/go resolves viator offers against wf_experiences.product_code only, and
// several cards (ThingsToDoList, BestNearby) carry a row id there.
function productCode(item, u) {
  for (const k of ["code", "product_code", "productCode"]) {
    const v = item && item[k];
    if (v && /^[A-Za-z0-9_-]+$/.test(String(v))) return String(v);
  }
  const m = u && /\/d\d+-([A-Za-z0-9_]+)\/?$/.exec(u.pathname);
  return m ? m[1] : null;
}

// Returns a site-relative path when `origin` is empty, else an absolute URL on `origin`.
export function shareableItemUrl(item, origin = "") {
  const raw = String((item && item.url) || "").trim();
  const join = (p) => (origin ? origin.replace(/\/+$/, "") + p : p);
  if (!raw) return origin || "";
  const u = parse(raw);
  if (!u) return origin || "";
  if (!isCommercial(item, raw)) {
    // Own page/route: unchanged (own-site query strings are never touched).
    const isAbs = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
    if (isAbs && !OWN_HOST.test(u.hostname)) return u.toString(); // off-site link stays whole
    return isAbs && !origin ? u.toString() : join(u.pathname + (u.search || "") + (u.hash || ""));
  }
  const provider = String((item && item.provider) || "viator").toLowerCase();
  const code = productCode(item, u);
  if (code) {
    const h = commerceHref({ provider, offerId: code, surface: "shared_item" });
    if (h) return join(h);
  }
  // Absolute viator.com product URL: our product go route, partner params removed
  // (the route re-applies attribution server-side).
  if (/^https?:\/\/(?:www\.)?viator\.com\//i.test(raw)) {
    const clean = new URL(raw);
    for (const k of PARTNER_PARAMS) clean.searchParams.delete(k);
    const g = viatorProductGoUrl(clean.toString(), "", "", "shared_item");
    if (g) return join(g);
  }
  const title = item && (item.title || item.name);
  const go = title ? experienceGoUrl(String(title), "", "", "", { surface: "shared_item" }) : null;
  return go ? join(go) : (origin || "");
}
