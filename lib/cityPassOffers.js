// lib/cityPassOffers.js — the CityPASS destination registry: WHICH citypass.com
// pages we may send a user to, and the evidence that each one is real.
//
// SAME REGISTRY DISCIPLINE AS lib/clippOffers.js, for the same reason: membership
// in a list IS the claim, so every shippable row carries the browser verification
// that backs it. Adding a market means loading the page and recording what was on
// it — not editing a slug.
//
// THE SHAPE TRAP THIS FILE EXISTS TO PREVENT
// CityPASS serves 17 destinations and FOUR of them are not bare city slugs:
// chicago-comparison, new-york-comparison, san-francisco-comparison and
// seattle-comparison. A `/${citySlug}` template — the obvious implementation —
// silently emits /chicago, /new-york, /san-francisco and /seattle, none of which
// is the destination page. It would NOT have been caught locally either, because
// the two cities Wayfind covers (orlando, tampa) are both plain slugs; a template
// looks perfect right up until someone adds Chicago.
//
// So the allowlist is an ENUMERATED TABLE with a literal path per row, and there
// is no slug rule anywhere in this file. Read from CityPASS's own destination nav
// on 2026-07-30 (docs/CITYPASS_CITY_ALLOWLIST_2026-07-30.md).
import { CJ_PID } from "./deals.js";

// Every destination CityPASS serves. This is the ALLOWLIST — what is a valid
// citypass.com destination at all. It is deliberately larger than what we ship.
export const CITYPASS_PATHS = Object.freeze([
  "/atlanta", "/boston", "/chicago-comparison", "/dallas", "/denver", "/houston",
  "/los-angeles", "/new-york-comparison", "/orlando", "/philadelphia",
  "/san-antonio", "/san-diego", "/san-francisco-comparison", "/seattle-comparison",
  "/southern-california", "/tampa", "/toronto",
]);
const _PATHS = new Set(CITYPASS_PATHS);

/**
 * Is this a citypass.com destination we are willing to link to?
 *
 * Two gates, both needed. The host check alone would accept any citypass.com URL
 * including a 404 or a checkout page; the path check alone would accept another
 * host serving the same path. The path must be a MEMBER of the enumerated list —
 * never a pattern match, because a pattern is exactly what produces /chicago.
 */
export function isCityPassDest(destUrl) {
  if (!destUrl || !/^https:\/\//i.test(destUrl)) return false;
  try {
    const u = new URL(destUrl);
    if (!/^(?:www\.)?citypass\.com$/i.test(u.hostname)) return false;
    return _PATHS.has(u.pathname.replace(/\/+$/, "") || "/");
  } catch { return false; }
}

// What we actually SHIP: destinations inside a Wayfind metro, each browser-
// verified with live priced inventory. `metro` matches the METROS vocabulary in
// lib/orderInFeatured.js, so the deal sheet's locality sort can place these the
// same way it places everything else.
//
// Only two rows despite a 17-entry allowlist. That is the point: CityPASS covers
// cities we do not, and a link to another metro's inventory is worse than no
// link, because it looks like a working recommendation.
export const CITYPASS_MARKETS = Object.freeze([
  Object.freeze({
    offerId: "citypass-orlando",
    city: "Orlando",
    area: "Orlando",
    metro: "orlando",
    dest: "https://www.citypass.com/orlando",
    headline: "Orlando theme-park tickets, bundled",
    detail: "One purchase covers Walt Disney World®, SeaWorld® and more, at a bundled price below the gate. Choose your parks at checkout.",
    verified: Object.freeze({
      on: "2026-07-30",
      title: "Official Orlando CityPASS® | Save on Tickets to Orlando Theme Parks",
      priced: true,
      sample: Object.freeze(["Walt Disney World® Resort", "SeaWorld® Orlando"]),
      priceSeen: "3–10 day tickets from $366",
    }),
  }),
  Object.freeze({
    offerId: "citypass-tampa",
    city: "Tampa",
    area: "Tampa",
    metro: "tampa",
    dest: "https://www.citypass.com/tampa",
    headline: "Five Tampa Bay attractions, up to 55% off",
    detail: "Busch Gardens Tampa Bay plus four more, bundled into one ticket. Pick your five at checkout.",
    verified: Object.freeze({
      on: "2026-07-30",
      title: "CityPASS® - See 5 Top Things to Do in Tampa Bay and Save up to 55%",
      priced: true,
      sample: Object.freeze(["Busch Gardens Tampa Bay"]),
      priceSeen: "$149.95, bundles to $332.92",
    }),
  }),
]);

const _BY_ID = new Map(CITYPASS_MARKETS.map((m) => [m.offerId, m]));

/** The verified market row for an offer id, or null. Never guesses. */
export function cityPassOfferById(offerId) {
  return _BY_ID.get(String(offerId || "")) || null;
}

/**
 * The tracked CJ destination for an offer id, or null.
 *
 * NULL IS THE WHOLE POINT, exactly as in clippTrackedUrl: there is no untracked
 * fallback, because a citypass.com URL that leaves here without our PID earns
 * nothing. An unknown or unverifiable offer must produce NOTHING rather than a
 * working-but-free link.
 *
 * Uses the CJ raw-path form (/links/<pid>/type/dlg/sid/<sid>/<dest>), which needs
 * only our publisher id — no per-advertiser link id. Verified live 2026-07-31:
 * the chain 302s three times and lands on citypass.com with cjevent + mv_source=cj
 * set, i.e. attribution fires.
 */
export function cityPassTrackedUrl(offerId, sid = "coupon") {
  const m = cityPassOfferById(offerId);
  if (!m || !isCityPassDest(m.dest)) return null;
  const s = String(sid || "coupon").replace(/[^\w.:-]/g, "").slice(0, 40) || "coupon";
  return `https://www.anrdoezrs.net/links/${CJ_PID}/type/dlg/sid/${s}/${m.dest}`;
}
