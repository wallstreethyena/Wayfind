// lib/guideBundle.js — PURE. No React, no fetch.
//
// Owner direction: "On guide pages, bundle two or three bookable picks (show,
// dinner, activity) so one visit can lead to several partner clicks; present
// options, not orders." Readers bounce fast (dwell 0 to 25 seconds), so the
// bundle sits high on the page (app/guides/[slug]/GuideBundle.js).
//
// THE RULES (enforced by scripts/test-guide-bundle.mjs):
//   - At most 3 items, each from a DIFFERENT pick or deal. Fewer than 2
//     qualifying items returns [] so nothing renders.
//   - One of each kind where the guide has it, in this order of preference:
//     "activity" (a primary Viator offer), "show" (an affiliate pick ticket),
//     "food" (a dining deal on our tracked /api/commerce/go redirect).
//   - Within a kind, the guide's own pick order wins. Never sorted by
//     commission, price or anything else.
//   - Copy comes ONLY from existing data. No prices, no ratings, no urgency.
//     A field that carries a "$" or a digit-star rating is dropped (or the
//     item skipped when it is the name or the button), never rewritten.
//   - Only things the picks loop would itself show: callers pass tickets
//     already resolved with the no-sale check applied, and offers already
//     resolved through guidePickOffers.
import { commerceHref } from "./commerce.js";
import { PICK_OFFER_CTA } from "./guidePickOffers.js";

export const BUNDLE_SURFACE = "guide_bundle";
export const BUNDLE_MAX = 3;
export const BUNDLE_MIN = 2;
const KIND_LABEL = Object.freeze({ activity: "Activity", show: "Show", food: "Food" });
const KIND_ORDER = Object.freeze(["activity", "show", "food"]);

const text = (v) => (typeof v === "string" ? v.trim() : "");
// No prices and no star ratings in copy, ever.
export function copyIsClean(s) {
  return !/\$|[0-9]\s*(?:-|\s)?(?:stars?\b|★|☆)|★|☆/i.test(String(s || ""));
}
const cleanOr = (s, fallback = "") => (s && copyIsClean(s) ? s : fallback);

/**
 * Re-surface one of OUR /api/commerce/go redirects for the bundle and derive its
 * commerce context from the same query string (same idea as guideDealCommerce).
 * Anything else returns null and keeps its href untouched.
 */
export function bundleRedirect(url) {
  const raw = String(url || "");
  if (!raw.startsWith("/api/commerce/go?")) return null;
  let q;
  try { q = new URLSearchParams(raw.slice(raw.indexOf("?") + 1)); } catch (e) { return null; }
  const provider = q.get("provider");
  const offer = q.get("offer");
  if (!provider || !offer) return null;
  q.set("surface", BUNDLE_SURFACE);
  return {
    href: "/api/commerce/go?" + q.toString(),
    ctx: { surface: BUNDLE_SURFACE, provider, offer_id: offer, content_id: q.get("content") || offer },
  };
}

function activityCandidates(slug, picks) {
  const out = [];
  for (const p of picks) {
    const entry = p.offerEntry;
    const offer = entry && Array.isArray(entry.offers) ? entry.offers.find((x) => x && x.role === "primary") : null;
    if (!offer || !offer.provider || !offer.offerId) continue;
    const name = text(p.name);
    if (!name || !copyIsClean(name)) continue;
    const pickId = entry.pickId || p.pickId || String(p.key);
    const contentId = slug + ":" + pickId;
    const href = commerceHref({ provider: offer.provider, offerId: offer.offerId, surface: BUNDLE_SURFACE, contentId, page: "g-" + slug });
    if (!href) continue;
    out.push({
      owner: "pick:" + p.key,
      item: {
        kind: "activity", kindLabel: KIND_LABEL.activity, name,
        detail: cleanOr(text(offer.title)),
        href, ctaLabel: cleanOr(text(offer.buttonLabel), PICK_OFFER_CTA),
        // The client emits this one's click itself (like GuidePickOffer).
        owned: true,
        ctx: { surface: BUNDLE_SURFACE, provider: offer.provider, offer_id: offer.offerId, city_id: offer.city, category: "tour", content_id: contentId },
      },
    });
  }
  return out;
}

function showCandidates(slug, picks) {
  const out = [];
  for (const p of picks) {
    const t = p.ticket;
    if (!t || t.affiliate !== true || !text(t.href) || !text(t.label)) continue;
    const name = text(p.name);
    const label = text(t.label);
    if (!name || !copyIsClean(name) || !copyIsClean(label)) continue;
    const re = bundleRedirect(t.href);
    const pickId = p.pickId || String(p.key);
    out.push({
      owner: "pick:" + p.key,
      item: {
        kind: "show", kindLabel: KIND_LABEL.show, name, detail: "",
        href: re ? re.href : t.href, ctaLabel: label, owned: false,
        ctx: re ? re.ctx : { surface: BUNDLE_SURFACE, provider: "ticketmaster", content_id: slug + ":" + pickId },
      },
    });
  }
  return out;
}

function foodCandidates(deals) {
  const out = [];
  for (const d of Array.isArray(deals) ? deals : []) {
    if (!d || d.category !== "dining" || !d.commerce || !d.id) continue;
    const re = bundleRedirect(d.url);
    if (!re) continue;
    const name = text(d.business);
    if (!name || !copyIsClean(name)) continue;
    out.push({
      owner: "deal:" + d.id,
      item: {
        kind: "food", kindLabel: KIND_LABEL.food, name,
        detail: cleanOr(text(d.title)),
        href: re.href, ctaLabel: cleanOr(text(d.cta), "See the deal"), owned: false,
        ctx: re.ctx,
      },
    });
  }
  return out;
}

/**
 * @param {{slug: string, picks: Array<{key, name, pickId?, ticket?, offerEntry?}>, deals?: Array}} input
 *   picks: in the guide's visible order, tickets already resolved through
 *   guidePickTicket (null when the pick is sold out / not on sale), offerEntry
 *   already resolved through guidePickOffers.
 * @returns {Array} 0 items, or 2 to 3 (never 1).
 */
export function guideBundleItems({ slug, picks, deals } = {}) {
  if (!slug || !Array.isArray(picks)) return [];
  const lists = {
    activity: activityCandidates(slug, picks),
    show: showCandidates(slug, picks),
    food: foodCandidates(deals),
  };
  // Pick the largest set (max 3) with no pick or deal used twice. Candidates are
  // tried in guide order and "skip this kind" is tried last, so the first best
  // set found is the one that keeps the editors' order.
  let best = [];
  const walk = (ki, used, chosen) => {
    if (chosen.length > best.length) best = chosen.slice();
    if (ki >= KIND_ORDER.length || best.length >= BUNDLE_MAX) return;
    for (const c of lists[KIND_ORDER[ki]]) {
      if (used.has(c.owner)) continue;
      used.add(c.owner); chosen.push(c.item);
      walk(ki + 1, used, chosen);
      chosen.pop(); used.delete(c.owner);
      if (best.length >= BUNDLE_MAX) return;
    }
    walk(ki + 1, used, chosen);
  };
  walk(0, new Set(), []);
  return best.length >= BUNDLE_MIN ? best.slice(0, BUNDLE_MAX) : [];
}
