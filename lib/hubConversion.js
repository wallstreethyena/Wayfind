// lib/hubConversion.js — the payload builders for the hub conversion layer.
//
// WHY THESE ARE OUT HERE RATHER THAN INLINE IN THE COMPONENTS. The first version
// of check-hub-conversion built its own copy of the expected payload and ran it
// through commercePayload(). That proved the LIBRARY worked and said nothing
// about the CALLERS: a red-prove that renamed `city_id` to `city` inside
// HubConversion left the guard green, because the guard never saw the
// component's payload. Same class of miss as CLAUDE.md's #486 — the check ran
// and answered a question nobody was asking.
//
// With the builders here, the components and the guard call the SAME function,
// so a field rename is caught by construction.
//
// THE FIELD-NAME SPLIT, which is the whole reason this is subtle:
//
//   product events (guide_cta_impression / guide_cta_clicked) go through
//   lib/track, which has no whitelist. They carry the literal field set:
//   click_id, guide_slug|culture_slug, surface, provider, offer_id, position,
//   cta_variant, city, category.
//
//   commerce events (commerce_impression / commerce_cta_clicked) go through
//   lib/commerce.commercePayload, which WHITELISTS CONTEXT_FIELDS and drops
//   everything else SILENTLY. The same facts must therefore be renamed:
//     guide_slug|culture_slug -> content_id
//     city                    -> city_id
//     cta_variant             -> variant
//     position                -> rank_bucket  (coarse, deliberately)
//
//   `position` is coarsened rather than passed through because a precise rank
//   sitting beside a commission figure is the evidence trail for
//   pay-for-placement — the accusation Wayfind's ranking method exists to be
//   able to refute. It stays raw on the product events, which carry no payout.
import { rankBucket } from "./commerce.js";

/**
 * The literal field set, for lib/track product events.
 * @param {object} a
 * @param {string} a.clickId
 * @param {string} a.slugKey  "guide_slug" | "culture_slug"
 * @param {string} a.slug
 * @param {string} a.surface
 * @param {string} [a.provider]
 * @param {string} [a.offerId]
 * @param {number} [a.position]
 * @param {string} [a.variant]
 * @param {string} [a.city]
 * @param {string} [a.category]
 */
export function hubProductProps(a) {
  const o = a || {};
  return {
    click_id: o.clickId || null,
    [o.slugKey || "guide_slug"]: o.slug || null,
    surface: o.surface || null,
    provider: o.provider || null,
    offer_id: o.offerId || null,
    position: o.position || 1,
    cta_variant: o.variant || null,
    city: o.city || null,
    category: o.category || null,
  };
}

/**
 * The schema-valid field set, for lib/commerce money events. Every key here MUST
 * appear in commerce.CONTEXT_FIELDS or it is dropped without error.
 */
export function hubCommerceProps(a) {
  const o = a || {};
  return {
    click_id: o.clickId || null,
    content_id: o.slug || null,
    surface: o.surface || null,
    provider: o.provider || null,
    offer_id: o.offerId || null,
    rank_bucket: rankBucket(o.position || 1),
    variant: o.variant || null,
    city_id: o.city || null,
    category: o.category || null,
  };
}

/**
 * One id per rendered CTA, shared by all four events so impression -> click
 * joins exactly. randomUUID is missing on some supported browsers, so the
 * fallback is real: a missing join key is the failure this layer exists to avoid.
 */
/**
 * Attach the client click_id to one of OUR redirect URLs, so the server-side
 * provider_redirect_started carries the same id as the client's
 * commerce_cta_clicked and the two legs join.
 *
 * Only internal paths are touched. A partner URL must never receive our id —
 * that would leak a join key off-site, and the whole point of the redirect layer
 * is that partner URLs are not in the DOM in the first place.
 *
 * Callers apply this only AFTER hydration: the id is minted per client render,
 * so putting it in the SSR href would be a hydration mismatch. Before hydration
 * the link still works — the route mints its own id, exactly as it always did.
 */
// Founder P0 (dead money handoffs, 2026-08-19): earning Book/commerce clicks
// must navigate SAME-TAB through our go routes. Detect the path on the
// RELATIVE href (or the pathname of an absolutized one) — never
// `currentTarget.href.startsWith("/api/")`, which is always false for
// `https://…/api/…` and is how /api/commerce/go minted a second UUID.
const EARNING_GO_PATH = /^\/api\/(?:commerce|viator|ticketmaster|eats)\/go(?:\?|$)/;

export function isEarningGoHref(href) {
  const raw = String(href || "").trim();
  if (!raw) return false;
  if (raw.startsWith("/")) return EARNING_GO_PATH.test(raw);
  try {
    const u = new URL(raw);
    return u.pathname === "/api/commerce/go"
      || u.pathname === "/api/viator/go"
      || u.pathname === "/api/ticketmaster/go"
      || u.pathname === "/api/eats/go";
  } catch {
    return false;
  }
}

export function withClickId(href, clickId) {
  const h = String(href || "");
  if (!h || !clickId) return href;
  if (!isEarningGoHref(h) && !h.startsWith("/api/")) return href; // never decorate an off-site URL
  // `click_id`, NOT `cid`. This branch originally sent cid and the server read
  // cid; main's route has always read click_id, and that name is the public
  // contract every analytics join and every in-flight link already uses.
  // Renaming it here would have orphaned the join between
  // commerce_cta_clicked and provider_redirect_started the moment this merged.
  if (/[?&]click_id=/.test(h)) return h;
  return h + (h.includes("?") ? "&" : "?") + "click_id=" + encodeURIComponent(clickId);
}

// ONE MINTER. This file had its own, and it produced a DIFFERENT fallback
// prefix ("c_...") from the documented one in lib/commerce.js ("wf-..."). Two
// minters means the server has to recognise two shapes, and the documented
// contract only names one — so a browser without crypto.randomUUID would emit
// an id the contract does not describe. Re-exported, not reimplemented.
export { mintClickId } from "./commerce.js";
