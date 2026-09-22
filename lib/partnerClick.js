// lib/partnerClick.js — the pure decision behind CommerceClickBeacon.
//
// Pulled out of app/components/CommerceClickBeacon.js (a "use client" React
// component) so it can be imported and CALLED directly from a plain-Node test
// (scripts/test-analytics.mjs), per CLAUDE.md's "assert on the CALL, not on
// the string": a structural regex over the component's source proves the code
// LOOKS right, calling this function and reading its return proves it BEHAVES
// right. React itself is not required to load this module.
//
// planPartnerClick() is a PURE function — no DOM, no PostHog, no Google tag,
// no mutation of anything the caller hands in. Given a clicked <a>'s raw href
// attribute, the page's own host, whether the component that rendered the
// anchor already tracks its own clicks, and a click-id minter, it decides
// whether this is a genuine hand-off through one of our four partner redirect
// routes and, if so, exactly what CommerceClickBeacon.js should do about it.
// CommerceClickBeacon.js is the only caller and the only place any of those
// side effects (mutating the DOM href, calling emitCommerce, calling
// forwardToGoogle) actually happen.

import { sanitizeClientClickId } from "./commerce.js";

export const PARTNER_ROUTES = [
  { prefix: "/api/commerce/go", provider: null, joinable: true },
  { prefix: "/api/viator/go", provider: "viator", joinable: false },
  { prefix: "/api/ticketmaster/go", provider: "ticketmaster", joinable: false },
  { prefix: "/api/hotels/go", provider: "stay22", joinable: false },
];

// Hosts a partner-redirect click is allowed to resolve against. Matching the
// PATH alone is not proof of origin — an absolute link to another host that
// happens to reuse one of our /api/*/go paths (e.g.
// https://evil.example/api/viator/go) is not a hand-off through OUR redirect
// layer and must never count as one, however it renders on the page.
const OWN_SUFFIXES = ["gowayfind.com"];

function isOwnHost(host, locationHost) {
  const h = String(host || "").toLowerCase();
  if (!h) return false;
  if (locationHost && h === String(locationHost).toLowerCase()) return true;
  return OWN_SUFFIXES.some((suffix) => h === suffix || h === "www." + suffix);
}

/**
 * @param {object} args
 * @param {string} args.href           the clicked <a>'s raw `href` ATTRIBUTE
 *                                      (not the browser-resolved absolute
 *                                      `.href`, which would already carry the
 *                                      page's own origin for a relative link
 *                                      and defeat the host check below).
 * @param {boolean} args.owned         true when the anchor carries
 *                                      data-commerce-owner — the rendering
 *                                      component already records
 *                                      commerce_cta_clicked to PostHog itself.
 * @param {string} [args.locationHost] window.location.hostname of the page
 *                                      the click happened on (a relative href
 *                                      resolves against this).
 * @param {string} [args.fallbackSurface] surface to use when the href carries
 *                                      none of its own.
 * @param {() => string} args.mint     click-id minter (commerce.mintClickId).
 * @returns {null | {
 *   clickId: string,
 *   rewriteHref: string|null,
 *   emitPostHog: boolean,
 *   googleParams: { provider: string|null, surface: string|null },
 *   ctx: object,
 * }}
 */
export function planPartnerClick({ href, owned, locationHost, fallbackSurface, mint }) {
  let url;
  try {
    url = new URL(String(href || ""), locationHost ? "https://" + locationHost : "https://gowayfind.com");
  } catch (e) {
    return null;
  }
  // Absolute link to a foreign host: never ours, whatever the path says.
  if (/^https?:$/i.test(url.protocol) === false) return null;
  const isRelative = !/^[a-z][a-z0-9+.-]*:\/\//i.test(String(href || "").trim());
  if (!isRelative && !isOwnHost(url.hostname, locationHost)) return null;

  const route = PARTNER_ROUTES.find((r) => url.pathname === r.prefix);
  if (!route) return null;

  const q = url.searchParams;
  const existing = sanitizeClientClickId(q.get("click_id"));
  const clickId = existing || (typeof mint === "function" ? mint() : null);
  if (!clickId) return null;

  let rewriteHref = null;
  if (route.joinable && !owned) {
    const next = new URL(url.toString());
    next.searchParams.set("click_id", clickId);
    rewriteHref = next.pathname + "?" + next.searchParams.toString();
  }

  const provider = route.provider || q.get("provider") || null;
  const surface = q.get("surface") || fallbackSurface || null;

  return {
    clickId,
    rewriteHref,
    emitPostHog: !owned,
    googleParams: { provider, surface },
    ctx: {
      surface,
      provider,
      offer_id: q.get("offer") || null,
      content_id: q.get("content") || null,
    },
  };
}
