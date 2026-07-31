// v5.07 — Wayfind Coupons. Owner-curated local deals: Gabe loads coupons here
// (through Claude) and they appear on the Coupons tab immediately on the next
// release. The tab ALSO merges rows from the Supabase `offers` table, so
// deals can be added from the dashboard without a deploy. Editorial rules,
// same as everything else on Wayfind: REAL offers only — never invent a code,
// a discount, or an expiration. An expired coupon disappears on its own.
//
// Shape:
//   id       — stable unique id ("cpn-" + slug). Saved coupons key off this.
//   business — the place offering the deal (shown big on the card)
//   title    — the deal itself ("10% off any two entrées")
//   details  — fine print worth knowing (optional)
//   code     — the code to show/copy at checkout (optional — some deals are
//              "mention Wayfind" or link-only)
//   url      — where to redeem/claim online (optional; opens in a NEW tab —
//              affiliate links welcome, tracking params included)
//   expires  — "YYYY-MM-DD" (optional; the card auto-hides after this date)
//   area     — town label so users know where it applies (optional)
//
// v6.17 additions (deals lifecycle, July 2026):
//   intents  — mood/experience keys (EXPERIENCES ids in app/home.js, e.g.
//              "outdoors", "familyfun") this deal surfaces under. Powers the
//              deals strip on those list pages. Optional.
//   match    — place-name variants Google may return, so the 🏷️ pill can
//              attach to the matching place card. Optional.
// Every deal here also lives in the project registry
// (claude/wayfind-deals-registry.md) with a scheduled deletion reminder —
// the code auto-hides on expiry; the robots clean up the data.
import { siteTodayStr } from "./siteTime.js";
import { commerceHref } from "./commerce.js";
import { CLIPP_MARKETS } from "./clippOffers.js";

// ── Clipp dining deals (2026-07-29) ─────────────────────────────────────────
// The first DINING monetization on the site. Everything above earns on tickets,
// tours, hotels and attractions; PostHog says real users open cafes, bakeries and
// kid spots, almost none of which are ticketed inventory. Clipp (formerly Local
// Flavor, via CJ, 12% on the sale) sells prepaid restaurant certificates and free
// coupons in exactly those categories.
//
// These two cards are the CITY-PAGE entries — the whole verified market, not a
// per-merchant offer. Per-merchant matching needs an inventory read clipp.com
// blocks to every non-browser fetcher, so it is deliberately not attempted here.
//
// The url goes through commerceHref → /api/commerce/go, NEVER a clipp.com URL:
// lib/commerce.js rule 2 is that the UI never constructs a partner URL, and the
// route is what guarantees no clipp.com destination leaves without our PID.
//
// `expires` is the next-but-one Monday so the weekly deals audit has to look at
// the card and re-verify rather than let it ride — the same convention the Viator
// special offers below use, and the reason is the same: Clipp's inventory rotates
// weekly and neither the page nor CJ publishes an end date. The card auto-hides on
// its own if the audit does not happen, which is the safe direction.
const CLIPP_AUDIT_EXPIRY = "2026-08-10";
// ── the owner's curated dining photography (2026-08-01) ─────────────────────
// Real photographs, 1600x1067 (exactly the card band's 3:2), EXIF stripped,
// subject weighted off-centre so the seal and title have somewhere to sit.
//
// THESE REPLACE GENERATED ART. The previous Sarasota banner was
// /cards/where-to-eat.jpg, one of a set of five 1200x630 images with a neon
// map-pin graphic baked in and a dark right third — Open Graph share cards, not
// card art. That set is 1.90:1, so it was also being cover-cropped into a 3:2
// band. Every asset here is 1.50:1 and needs no crop.
//
// WHY THIS SET IS FOR CITY-MARKET CARDS ONLY. A Clipp city card is one card
// standing for a whole market (36 merchants behind it), so there is no single
// merchant to photograph — the merchant-photo rule cannot reach it, and forcing
// it would strip the image. A card for ONE venue must use that venue's own
// Google photo_ref instead; these are not a substitute for that.
const CLIPP_DINING_ART = Object.freeze([
  "/cards/coupon-dining-group-restaurant.jpeg",
  "/cards/coupon-dining-outdoor-table.jpeg",
  "/cards/coupon-dining-cafe-solo.jpeg",
  "/cards/coupon-dining-pizza-couple.jpeg",
  "/cards/coupon-dining-dessert-couple.jpeg",
]);

// FNV-1a, 32-bit. Not for security — just a cheap, stable, well-mixed integer so
// that different ids start at different photos instead of clustering.
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < String(s).length; i++) {
    h ^= String(s).charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Assign one photo per market, DETERMINISTICALLY AND DISTINCTLY.
 *
 * The owner's requirement has two halves: the cards must not "all look the same
 * all the time", and a given card must not shuffle between renders. So this is a
 * pure function of the id set — no Math.random, no Date, no wall-clock anything.
 *
 * WHY NOT A PLAIN `hash % 5`. That is what this started as, and it is stable and
 * insertion-proof, but measured against the real ids it produced only TWO distinct
 * photos across four markets — Sarasota and Bradenton identical, Tampa and Orlando
 * identical. Adjacent money cards wearing the same photograph is precisely the
 * "all look the same" the owner was objecting to, so a bare hash fails the actual
 * requirement while passing a naive reading of it.
 *
 * So: hash gives each market a PREFERRED photo, then a linear probe takes the next
 * free one when two markets want the same. Iteration is over SORTED ids, which is
 * what keeps the result stable — the assignment depends only on the set of ids, not
 * on their order in CLIPP_MARKETS, so re-ordering that array changes nothing.
 *
 * THE TRADE-OFF, STATED: probing means adding a market CAN move another market's
 * photo. That is a real cost, and it is the right way round — distinctness is what
 * the owner can see on the rail; insertion-stability is a maintenance nicety. With
 * more markets than photos the probe wraps and reuse resumes, which is unavoidable
 * and still deterministic.
 */
export function clippArtAssignment(offerIds) {
  const ids = [...new Set((offerIds || []).map(String))].sort();
  const n = CLIPP_DINING_ART.length;
  const out = new Map();
  const used = new Set();
  for (const id of ids) {
    const start = fnv1a(id) % n;
    let pick = start;
    for (let step = 0; step < n; step++) {
      const cand = (start + step) % n;
      if (!used.has(cand)) { pick = cand; break; }
    }
    used.add(pick);
    if (used.size === n) used.clear(); // more markets than photos: wrap and reuse
    out.set(id, CLIPP_DINING_ART[pick]);
  }
  return out;
}

const _CLIPP_ART = clippArtAssignment(CLIPP_MARKETS.map((m) => m.offerId));
/** This market's photo. Stable for a given set of markets. */
export function clippArtFor(offerId) {
  return _CLIPP_ART.get(String(offerId || "")) || CLIPP_DINING_ART[0];
}
const CLIPP_ART_FALLBACK = CLIPP_DINING_ART[0];
const CLIPP_COUPONS = CLIPP_MARKETS.map((m) => ({
  id: "cpn-" + m.offerId,
  business: "Clipp",
  area: m.area,
  title: `Half-price dining certificates in ${m.city}`,
  details: `Prepaid restaurant certificates — typically $15 for $30 of food — plus free clip-and-redeem coupons at ${m.city}-area spots. Buy on Clipp, redeem at the restaurant. Inventory rotates weekly.`,
  code: null,
  url: commerceHref({ provider: "clipp", offerId: m.offerId, surface: "coupons", contentId: m.offerId }),
  expires: CLIPP_AUDIT_EXPIRY,
  cta: "See deals",
  // OUR OWN committed asset, never a partner or merchant image. Two reasons it is
  // not one of Clipp's five CJ banner creatives (link ids 15884800/02/04/05/18):
  // they are IAB display-ad units — 320x50, 160x600, 300x250, 728x90, 300x600 —
  // so none of them is a wide banner and every one would have to be cropped or
  // letterboxed into an 88px strip; and a display ad inside a Wayfind card reads
  // AS an ad slot, which is the same low-trust look the imagery is meant to fix.
  //
  // where-to-eat.jpg is the honest choice for this inventory specifically: it
  // shows pizza, tacos and casual street dining, which is what Clipp actually
  // sells here (Marco's Pizza, Guac Shop, Five-O Donut, Geckos Grill). The
  // date-night hero would promise white tablecloths and deliver a donut shop.
  // Per-market art, because the two cards render adjacent and one shared banner
  // twice in a row reads as a template rather than a curated menu. Both assets are
  // casual-dining scenes; neither is a category hero that already means something
  // else on the Coupons tab.
  image: clippArtFor(m.offerId) || CLIPP_ART_FALLBACK,
  // Understates deliberately. Clipp's certificates are uniformly half face value
  // ($15 for $30, $10 for $20, $40 for $80 — verified across both markets), while
  // the "Price Drop" items ran to 65% off. A badge that claims the best case goes
  // stale silently when inventory rotates; one that claims the structural case
  // stays true for as long as the product exists.
  badge: "50% off",
  // eatnow is the dining intent; datenight and familyfun are the two moods whose
  // list pages are mostly restaurants. Deliberately NOT tagged onto outdoors or
  // cozyindoor — a certificate for a taco shop is not an answer to "what's a good
  // hike", and a deals strip that shows up everywhere is an ad, not a deal.
  intents: ["eatnow", "datenight", "familyfun"],
  match: [],
  // Marks the card as commerce-instrumented so the Coupons tab knows to emit the
  // commerce_impression that gives the click a denominator.
  commerce: { provider: "clipp", offerId: m.offerId },
}));

export const COUPONS = [
  ...CLIPP_COUPONS,

  // ── Klook partner promo codes (v6.42, 2026-07-17) — harvested VERBATIM from
  // Wayfind's Klook affiliate dashboard (authorized-codes list). Two-way
  // attribution: the ?aid=127667 click AND the code itself (Klook pays a
  // revenue share on orders placed with an authorized code). Only audience-
  // relevant codes ship; expiries are Klook's own; cards auto-hide on expiry.
  // Registry: claude/wayfind-deals-registry.md (weekly deals audit re-verifies).
  { id: "cpn-klook-us-attractions-5", business: "Klook", area: "United States",
    title: "5% off selected U.S. attraction tickets", details: "Applies to selected United States attractions on Klook — theme parks, observation decks, museums and more. Enter the code at checkout.",
    code: "S3USATT", url: "https://www.klook.com/?aid=127667", expires: "2026-08-02",
    cta: "Book on Klook", intents: ["familyfun", "outdoors"], match: [] },

  // ── Local standing offers (2026-07-30, registry-verified at source 2026-07-29)
  // All five are NON-AFFILIATE: plain links to the operator's own page, no
  // commerce redirect, and the card carries "Not an affiliate offer — just a good
  // one." The Deal Sheet routes them to the ledger on their own cadence — none is
  // hand-placed (lib/dealSheet.js isStandingOffer).
  { id: "cpn-geckos-19th-hole", business: "Gecko's Grill & Pub — all locations (incl. SR70 Lakewood Ranch, SR64 Braden River)", area: "Sarasota-Manatee",
    title: "19th Hole", details: "Free well drink, domestic draft, or house wine with any appetizer or entr\u00e9e + a same-day golf scorecard",
    code: null, url: "https://geckosgrill.com/specials-and-events/", expires: "2026-12-31",
    intents: ["eatnow", "nightout"], match: ["Gecko's Grill & Pub", "Geckos Grill & Pub"] },

  { id: "cpn-geckos-happy-hour", business: "Gecko's Grill & Pub — all locations", area: "Sarasota-Manatee",
    title: "Ultimate Happy Hour", details: "Daily 3\u20136pm \u2014 $1 off drafts, wells & wines, $5 off 750ml bottles, $5 small plates",
    code: null, url: "https://geckosgrill.com/specials-and-events/", expires: null,
    intents: ["nightout", "eatnow"], match: ["Gecko's Grill & Pub", "Geckos Grill & Pub"] },

  { id: "cpn-geckos-bar-bingo-hillview", business: "Gecko's Grill & Pub, Hillview (Sarasota)", area: "Sarasota",
    title: "Bar Bingo", details: "Mondays 7\u20139pm, free to play",
    code: null, url: "https://www.visitsarasota.com/deals/bar-bingo-geckos-hillview", expires: "2027-01-01",
    intents: ["nightout"], match: ["Gecko's Grill & Pub Hillview"] },

  { id: "cpn-pie-on-main-lunch", business: "Pie On Main, 1507 Main St, Sarasota", area: "Sarasota",
    title: "Weekday lunch special", details: "Lunch special + sub of the day, weekdays",
    code: null, url: "https://www.visitsarasota.com/dining/pie-main", expires: "2026-12-31",
    intents: ["eatnow"], match: ["Pie On Main"] },

  { id: "cpn-ringling-museums-for-all", business: "The Ringling", area: "Sarasota",
    title: "Museums for All", details: "Free admission with SNAP/WIC/EBT (up to 4 guests, +$5 Ca' d'Zan); college students $5; FSU/USF/SCF/NCF/RCAD free",
    code: null, url: "https://www.ringling.org/tickets-admission/", expires: null,
    intents: ["familyfun", "cozyindoor", "hiddengems"], match: ["The Ringling"] },

  { id: "cpn-discover-sarasota-local-20", business: "Discover Sarasota Tours", area: "Sarasota",
    title: "20% off any city tour", details: "Trolley, tiki-boat and walking tours. Locals' summer special — apply the code at checkout.",
    code: "LOCAL", url: "https://www.visitsarasota.com/deals/summer-special", expires: "2026-07-31",
    intents: ["outdoors", "familyfun"], match: ["Discover Sarasota Tours"] },

  { id: "cpn-zootampa-heroes-summer", business: "ZooTampa at Lowry Park", area: "Tampa",
    title: "Free summer admission for military & community heroes", details: "Active-duty U.S. military +3 dependents, plus Hillsborough County teachers and government employees. Valid ID required. Through Labor Day.",
    code: null, url: "https://zootampa.org/zootampa-honors-local-community-heroes-and-u-s-military-members-with-complimentary-summer-admission/", expires: "2026-09-07",
    intents: ["familyfun", "outdoors"], match: ["ZooTampa at Lowry Park", "ZooTampa"] },

  { id: "cpn-ringling-free-mondays", business: "The Ringling", area: "Sarasota",
    title: "Free admission every Monday", details: "Museum of Art, Bayfront Gardens and the Glass Pavilion are free on Mondays. Circus Museum and Ca' d'Zan are regular price. Register on arrival.",
    code: null, url: "https://www.ringling.org/tickets-admission/", expires: null,
    intents: ["familyfun", "cozyindoor", "outdoors"], match: ["The Ringling", "The John and Mable Ringling Museum of Art", "Ringling Museum of Art"] },

  { id: "cpn-ringling-bluestar-military", business: "The Ringling", area: "Sarasota",
    title: "Active-duty military free all summer", details: "Blue Star Museums: free admission with active military ID, through Labor Day.",
    code: null, url: "https://www.ringling.org/tickets-admission/", expires: "2026-09-07",
    intents: ["familyfun", "cozyindoor"], match: ["The Ringling", "The John and Mable Ringling Museum of Art", "Ringling Museum of Art"] },

  { id: "cpn-mote-military-free", business: "Mote Marine Laboratory & Aquarium", area: "Sarasota",
    title: "Active-duty military: free admission", details: "For the service member with a current active-duty U.S. military ID. Purchase in person on site.",
    code: null, url: "https://mote.org/aquarium/sea-visitor-information/pricing-faq/", expires: null,
    intents: ["familyfun", "cozyindoor"], match: ["Mote Marine Laboratory & Aquarium", "Mote Marine Laboratory", "Mote SEA", "Mote Marine Aquarium"] },

  { id: "cpn-marauders-thirsty-thursday", business: "Bradenton Marauders", area: "Bradenton",
    title: "Thirsty Thursday at LECOM Park", details: "Beer, soda and hot-dog specials on select Thursday home games.",
    code: null, url: "https://www.milb.com/bradenton/tickets/promotions", expires: "2026-09-05",
    // SELECT Thursdays, not every Thursday — the standing copy error, corrected
    // 2026-07-30 against the official 2026 promo PDF. The dates are the remaining
    // home games; dealSchedule() renders them rather than inventing a cadence.
    dates: ["2026-08-06", "2026-08-20", "2026-09-03"],
    intents: ["nightout", "familyfun"], match: ["LECOM Park", "Bradenton Marauders"] },

  { id: "cpn-agave-bandido-taco-tuesday", business: "Agave Bandido", area: "Lakewood Ranch",
    title: "Taco Tuesday specials", details: "Weekly Taco Tuesday at the modern Mexican spot on Main Street.",
    code: null, url: "https://www.visitsarasota.com/special-offers-deals", expires: "2026-09-29",
    intents: ["eatnow"], match: ["Agave Bandido"] },

  { id: "cpn-sarasota-art-museum-second-sundays", business: "Sarasota Art Museum", area: "Sarasota",
    title: "Free Second Sundays", details: "Free admission on the second Sunday of every month.",
    code: null, url: "https://www.visitsarasota.com/special-offers-deals", expires: "2028-04-09",
    intents: ["cozyindoor", "familyfun", "hiddengems"], match: ["Sarasota Art Museum", "Sarasota Art Museum of Ringling College"] },

  // ── Affiliate deals (v6.17.1) — real Viator "Special Offer" discounts; the
  // links carry Wayfind's partner tracking (pid P00308545), so bookings pay a
  // commission at no cost to the user (disclosure already in the tab footer).
  // Viator promo end dates aren't published: expires is set to the next-but-one
  // Monday so the weekly deals audit re-verifies the discount and extends or
  // drops it. cta overrides the button label ("Claim deal" → "Book now").
  { id: "cpn-viator-manatee-walk-bradenton", business: "Manatee Watching Walking Tour", area: "Bradenton",
    title: "Manatee watching with guaranteed sighting — $16 (reg. $19)", details: "30-minute guided walk. Free cancellation. Viator special offer — price at checkout.",
    code: null, url: "https://www.viator.com/tours/Sarasota/Guided-Manatee-Watching-With-Guaranteed-Manatee-Sighting/d25738-5560271P1?pid=P00308545&mcid=42383&medium=link", expires: "2026-08-10",
    cta: "Book now", intents: ["familyfun", "outdoors"], match: [] },
];

// ── Helpers (v6.17) ─────────────────────────────────────────────────────────
// One live-rule everywhere: no expiry, or expiry today-or-later, local date.
// Same rule CouponsScreen applies; kept here so list pages and place cards
// can't drift from the tab.

export function couponIsLive(c, todayIso) {
  // C1: "today" is the VENUE-local (US Eastern) day, not the server's UTC day —
  // otherwise a coupon on its last valid day vanishes ~4h early for FL users.
  const today = todayIso || siteTodayStr();
  return !!(c && c.id && c.title && (!c.expires || String(c.expires).slice(0, 10) >= today));
}

export const liveCoupons = (todayIso) => COUPONS.filter((c) => couponIsLive(c, todayIso));

/** Live coupons tagged for a mood/experience key — soonest-ending first. */
export function couponsForIntent(intentId, todayIso) {
  if (!intentId) return [];
  return liveCoupons(todayIso)
    .filter((c) => Array.isArray(c.intents) && c.intents.includes(intentId))
    .sort((a, b) => String(a.expires || "9999").localeCompare(String(b.expires || "9999")));
}

const _cpnNorm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const _CPN_BY_NAME = (() => {
  const m = new Map();
  for (const c of COUPONS) {
    for (const n of [c.business, ...(Array.isArray(c.match) ? c.match : [])]) {
      const k = _cpnNorm(n);
      if (k && !m.has(k)) m.set(k, c);
    }
  }
  return m;
})();

/** The live coupon attached to a place name (exact normalized match), or null. */
export function couponForPlaceName(name, todayIso) {
  const c = _CPN_BY_NAME.get(_cpnNorm(name));
  return c && couponIsLive(c, todayIso) ? c : null;
}

/** "Ends Jul 31" / "Ends Apr 9, 2028" / null for open-ended offers. */
export function couponEndsLabel(c) {
  if (!c || !c.expires) return null;
  const [y, mo, d] = String(c.expires).slice(0, 10).split("-").map(Number);
  if (!y || !mo || !d) return null;
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const thisYear = new Date().getFullYear();
  return "Ends " + M[mo - 1] + " " + d + (y !== thisYear ? ", " + y : "");
}

// ── Supabase `offers` row → coupon/offer shape (v6.17 schema fix) ───────────
// offers.sql defines coupon_code / affiliate_url / direct_url / offer_title /
// offer_description / expiration_date / city, but both consumers in home.js
// read code / url / title / description / expires — so dashboard-entered rows
// could never render. Normalize ONCE here; both loaders share it.
export function normalizeOfferRow(o) {
  if (!o) return null;
  const title = o.offer_title || o.title || o.deal || null;
  if (!title) return null;
  return {
    id: "offer:" + (o.id || o.google_place_id || title),
    google_place_id: o.google_place_id || null,
    normalized_business_name: o.normalized_business_name || _cpnNorm(o.business_name || o.name),
    business: o.business_name || o.name || "",
    title: String(title),
    description: o.offer_description || o.description || "",
    details: o.offer_description || o.description || "",
    offer_type: o.offer_type || null,
    source: o.source || null,
    code: o.coupon_code || o.code || null,
    url: o.affiliate_url || o.direct_url || o.url || null,
    cta: o.cta || null,
    expires: o.expiration_date || o.expires_at || o.expires || null,
    area: o.city || o.area || null,
  };
}
