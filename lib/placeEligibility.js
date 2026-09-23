// lib/placeEligibility.js — SERVER-ONLY, pure. THE single predicate for
// whether a /places/{id} page is DURABLY eligible to index.
//
// THE PROBLEM THIS CLOSES (2026-09-23 SEO recovery). isIndexable() used to
// require p.hasDetails, and hasDetails was true whenever a Google Place
// Details call had ever landed (skel && !cached -> getPlaceDetails, cached
// in the pd1| key for 30 days). That ties indexability to Google's cache
// clock: a page indexes when the cache happens to be warm and flips back to
// noindex the day it expires, with nothing about the PLACE having changed.
// Measured: 43% of sitemap place URLs were noindex on any given day, and
// the indexable set churned month to month with nothing but the cache TTL
// driving it.
//
// THE FIX. Indexability is now a function of content WAYFIND ITSELF HOLDS
// and controls the freshness of — an Atlas editorial card, a GUIDES pick's
// own researched blurb, or a verified wf_editorial_servable row — never of
// whatever Google happened to return on the last cache miss. Google Place
// Details may still ENRICH a rendered page (a nicer address, hours, a
// rating) when shouldCallGooglePlaceDetails() decides to spend a call for
// an indexed skeleton with no Atlas/guide copy, but it is NEVER an input to
// this predicate. Ratings, review counts, and a one-line hook/knownFor
// string are NOT "substantive text" either — a card with a rating and
// nothing else is a doorway page (Google's own definition, restated in
// lib/guidePlaceIndex.js next to GUIDE_DETAIL_MIN_BLURB_LEN), not real
// content.
//
// Pure: no fetches, no env, no fs. Every input is a plain value the caller
// (lib/atlasPlaceAllowlist.js mergePlacePage) already holds or has just
// fetched from Supabase.
import { guidePlaceHasSubstantiveDetail } from "./guidePlaceIndex.js";

// Same bar lib/guidePlaceIndex.js's GUIDE_DETAIL_MIN_BLURB_LEN uses for a
// guide blurb: below this length a line reads as a stub ("Great spot!"),
// not real editorial content. Kept as its own named constant (rather than
// importing GUIDE_DETAIL_MIN_BLURB_LEN) because it gates a DIFFERENT
// column on a different table — a future change to one bar must not
// silently move the other.
export const EDITORIAL_WHY_MIN_LEN = 80;

const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const finite = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Identity we can actually STATE: a real name, plus either coordinates or a
 * real street address. A rating and a Place ID are not identity — they are
 * metadata about a place whose location we may not even be able to print.
 */
export function hasStatableIdentity({ name, lat, lng, address } = {}) {
  if (!str(name)) return false;
  const hasLatLng = finite(lat) != null && finite(lng) != null;
  const hasAddress = !!str(address);
  return hasLatLng || hasAddress;
}

/**
 * At least one substantive, Wayfind-held text source. Any ONE qualifies:
 *   - atlas.description  — lib/atlasPlaceAllowlist.js atlasPageDescription()
 *     already returns null unless the publish-ready card carries a real
 *     sourced knownFor/whyGo line; nothing here re-derives that bar.
 *   - guide               — a GUIDES pick's own blurb, gated by
 *     lib/guidePlaceIndex.js guidePlaceHasSubstantiveDetail() (>=80 chars).
 *   - editorial.why_here  — a verified wf_editorial_servable row's why_here,
 *     >=EDITORIAL_WHY_MIN_LEN chars.
 * Google Place Details (`d` in mergePlacePage) is deliberately NOT a
 * parameter here — see the module header.
 */
export function hasSubstantiveWayfindText({ atlas, guide, editorial } = {}) {
  if (atlas && str(atlas.description)) return true;
  if (guidePlaceHasSubstantiveDetail(guide)) return true;
  if (editorial && str(editorial.why_here) && editorial.why_here.trim().length >= EDITORIAL_WHY_MIN_LEN) return true;
  return false;
}

/**
 * THE predicate. A /places/{id} page is durably eligible to index only when
 * both halves hold: we can state where/what it is, AND we hold real,
 * sourced copy about it — never a Google cache alone, never a rating alone.
 */
export function placeDurableEligibility({ name, lat, lng, address, atlas, guide, editorial } = {}) {
  return hasStatableIdentity({ name, lat, lng, address }) && hasSubstantiveWayfindText({ atlas, guide, editorial });
}
