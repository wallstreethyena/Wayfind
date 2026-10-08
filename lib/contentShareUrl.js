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
import { experienceGoUrl } from "./affiliates.js";

const PARTNER_PARAMS = ["mcid", "pid", "medium", "api_version", "campaign", "cid", "partner_id"];
const OWN_HOST = /^(?:www\.)?gowayfind\.com$/i;
const PARTNER_HOST = /(?:^|\.)(?:viator\.com|getyourguide\.com|ticketmaster\.com|tripadvisor\.com)$/i;

function parse(raw) {
  try { return new URL(raw, "https://www.gowayfind.com"); } catch { return null; }
}

function isCommercial(item, raw) {
  if (!raw) return false;
  const provider = String((item && item.provider) || "").toLowerCase();
  const u = parse(raw);
  if (!u) return false;
  const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || raw.startsWith("//");
  if (absolute && !OWN_HOST.test(u.hostname)) return true; // any off-site absolute URL
  if (PARTNER_HOST.test(u.hostname) && absolute) return true;
  if (u.pathname.startsWith("/api/")) return false; // already one of our routes
  if (PARTNER_PARAMS.some((k) => u.searchParams.has(k))) return true;
  // Viator-shaped relative product path with no Wayfind page behind it.
  if (provider === "viator" && /^\/(?:tours|attractions|d\d+)\b/i.test(u.pathname)) return true;
  return false;
}

// Returns a site-relative path when `origin` is empty, else an absolute URL on `origin`.
export function shareableItemUrl(item, origin = "") {
  const raw = String((item && item.url) || "").trim();
  const join = (p) => (origin ? origin.replace(/\/+$/, "") + p : p);
  if (!raw) return origin || "";
  if (!isCommercial(item, raw)) {
    const u = parse(raw);
    if (!u) return origin || "";
    // Our own page/route: keep as given, but never let partner params ride along.
    for (const k of PARTNER_PARAMS) u.searchParams.delete(k);
    const own = u.pathname + (u.search || "") + (u.hash || "");
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !origin ? u.toString() : join(own);
  }
  const code = item && (item.code || item.productCode || item.id);
  const provider = String((item && item.provider) || "viator").toLowerCase();
  if (code && /^[A-Za-z0-9_-]+$/.test(String(code))) {
    const h = commerceHref({ provider, offerId: String(code), surface: "shared_item" });
    if (h) return join(h);
  }
  const title = item && (item.title || item.name);
  const go = title ? experienceGoUrl(String(title), "", "", "", { surface: "shared_item" }) : null;
  return go ? join(go) : (origin || "");
}
