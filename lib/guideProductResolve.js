// lib/guideProductResolve.js — resolve a guide pick to an EXACT Viator product
// at render time, through the same hard invariant the redirect route uses.
//
// WHY THIS EXISTS (2026-08-05). Measured against the live registry, all nine
// tour-intent guides resolved to a generic Viator SEARCH — not one had an exact
// product. Twenty readers saw that CTA and none clicked. #599 made the label
// honest about it ("Find tours in Orlando" rather than "Check tours & tickets");
// this is the other half: actually find the product, so the honest label can
// become "See tickets for The Ringling" and the click lands on something
// bookable.
//
// WHICH GATE, AND WHY IT MATTERS
// There were already two server-side ways to turn a query into a product URL:
//
//   /api/viator/go   fetches candidates, then applies resolveVerified() — the
//                    scored, DEFAULT-DENY resolver whose geoConfirms() is what
//                    stopped the Dali->Barcelona and Ringling->Houston
//                    redirects. This is the strong one.
//   lib/viatorServer.resolveViatorProduct  fetches candidates and takes the
//                    first whose title or URL merely MENTIONS a region token.
//                    That is the "Explore Los Angeles" fix, and it is weaker:
//                    a token appearing in a product's marketing copy is not
//                    evidence the product is in that place.
//
// A guide bakes its CTA into static HTML for a day, so a wrong-place product
// here is worse than the same mistake at click time — it is cached and served
// to everyone. So this uses resolveVerified(), NOT the weaker token check. The
// predicate is shared, not copied: this module supplies candidates, and the one
// exported resolver in lib/bookingResolver.js decides.
//
// FAIL-SOFT AND HONEST. Anything short of a confident, geo-confirmed match
// returns null, and the caller keeps #599's honest search label. A guide that
// cannot prove it has a product says so, rather than guessing.
import { resolveVerified } from "./bookingResolver.js";
import { credential } from "./envPlaceholder.js";

const getKey = () => credential(process.env["VIATOR_API_KEY"]);

// Same pool size as /api/viator/go. Phase 2a widened it 3 -> 10 because the real
// venue product for Mote/Selby/Ca' d'Zan sat below Viator's generic city tours,
// so a top-3 pool never even saw it. The resolver still default-denies, so a
// wider pool can only add correct hits, never wrong ones.
const POOL = 10;

/**
 * A guide pick adapted to the `place` shape resolveVerified expects.
 *
 * `types` deliberately does NOT include tourist_attraction for a pick the guide
 * marks as nature/beach: the beach exclusion is what keeps free sand out of the
 * booking funnel, and baking a tour CTA onto a preserve would reintroduce it on
 * a cached page.
 */
export function pickAsPlace(pick, region) {
  return {
    id: "guide:" + String((pick && pick.name) || "").slice(0, 60),
    name: (pick && (pick.bookQuery || pick.name)) || "",
    address: ", " + (region || "") + ", FL",
  };
}

/**
 * The label for an upgraded CTA. Pure, so the honesty rule can be DRIVEN in a
 * guard rather than waiting for a production API key to happen to resolve one.
 *
 * Names the PRODUCT, not the pick. A geo-confirmed product is often a related
 * experience rather than the attraction itself — "Winter Park Scenic Boat Tour"
 * resolves to "Clear Kayak Sunset Tour through The Winter Park chain" — so
 * naming the pick would over-promise exactly the way the pre-#599 label did.
 *
 * Truncates on a word boundary so the button stays one line at 390px.
 */
export function productCtaLabel(title, _place, max = 44) {
  // ONLY a real product title may be named. The second argument is accepted and
  // ignored on purpose: it used to be a fallback, and because guide picks are
  // section headings rather than venues, that fallback shipped
  // "See tickets: What the hour actually covers" to production. With no title we
  // say what we can stand behind and name nothing.
  const full = String(title || "").trim();
  if (!full) return "See tickets & availability";
  const short = full.length <= max ? full : full.slice(0, max).replace(/\s+\S*$/, "") + "\u2026";
  return "See tickets: " + short;
}

/**
 * Resolve ONE guide pick to a verified product URL, or null.
 *
 * @param {object} pick   a guide pick ({ name, bookQuery, ... })
 * @param {string} region the guide's region, used as the geo evidence
 * @param {object} [deps] { fetchImpl } — injected so the guard can drive real
 *                        candidate shapes without a network or an API key.
 * @returns {Promise<{url: string, productCode: string|null, confidence: number}|null>}
 */
export async function resolveGuideProduct(pick, region, deps = {}) {
  const name = (pick && (pick.bookQuery || pick.name)) || "";
  if (!name || !region) return null;

  const doFetch = deps.fetchImpl || globalThis.fetch;
  const KEY = deps.fetchImpl ? "injected" : getKey();
  if (!KEY || typeof doFetch !== "function") return null;

  const searchTerm = name.toLowerCase().includes(String(region).toLowerCase())
    ? name
    : name + " " + region;

  let candidates = [];
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4500);
    let res;
    try {
      res = await doFetch("https://api.viator.com/partner/search/freetext", {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "exp-api-key": KEY,
          "Accept": "application/json;version=2.0",
          "Accept-Language": "en-US",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          searchTerm,
          currency: "USD",
          searchTypes: [{ searchType: "PRODUCTS", pagination: { start: 1, count: POOL } }],
        }),
        // ISR-friendly: a day, matching the guide page's own revalidate.
        next: { revalidate: 86400 },
      });
    } finally { clearTimeout(timer); }
    if (!res || !res.ok) return null;
    const d = await res.json();
    const results = (d && d.products && Array.isArray(d.products.results)) ? d.products.results : [];
    candidates = results.filter((r) => r && r.productUrl && r.title);
  } catch (e) {
    return null; // network, abort, bad JSON — never break a page render
  }
  if (!candidates.length) return null;

  // THE shared predicate. Default-deny, geo-confirmed, ambiguity-rejecting.
  const offer = resolveVerified(pickAsPlace(pick, region), candidates, { region, kind: "entertainment" });
  if (!offer || !offer.productUrl) return null;

  // The TITLE is not decoration — it is what makes the label honest. A resolved
  // product is frequently a RELATED experience rather than the pick itself:
  // "Winter Park Scenic Boat Tour" resolves to "Clear Kayak Sunset Tour through
  // The Winter Park chain", which is geo-confirmed and genuinely bookable, but
  // is a different operator on the same lakes. Labelling that "See tickets for
  // Winter Park Scenic Boat Tour" would repeat, one level down, exactly the
  // over-promise #599 removed. So the caller names the PRODUCT.
  // toOffer() (lib/bookingResolver) builds its offer from productCode/productUrl
  // and does NOT carry the title, so offer.title is always undefined. Read the
  // title off the ORIGINAL candidate instead. Shipped without this the label
  // fell through to the pick name — and a guide pick name is a section heading
  // ("What the hour actually covers"), which produced
  // "See tickets: What the hour actually covers" in production.
  const src = candidates.find(
    (c) => (offer.productCode && c.productCode === offer.productCode) || c.productUrl === offer.productUrl
  ) || null;

  return {
    url: offer.productUrl,
    productCode: offer.productCode || null,
    title: String((src && src.title) || offer.title || "").trim() || null,
    confidence: typeof offer.confidence === "number" ? offer.confidence : 0,
  };
}
