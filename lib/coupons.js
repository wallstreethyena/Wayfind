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
import { CLIPP_MARKETS, CLIPP_MERCHANT_OFFERS } from "./clippOffers.js";
import { CITYPASS_MARKETS } from "./cityPassOffers.js";
import { PARTNER_DEAL_COUPONS } from "./partnerDeals.js";

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
  // v1.00 (2026-08-08): a plain query string, NOT a fetch — lib/coupons.js is
  // imported by several "use client" screens, so it must stay free of async
  // module-load work and server secrets. app/components/screens/Coupons.js
  // uses this (via /api/market-photo) to give the card's small identity tile
  // a real Sarasota/Tampa dining photo instead of rendering nothing, which is
  // what happens today (this row sets neither venuePhotoRef nor icon). Does
  // NOT touch `image` above — that stays the separate, guarded, local-only
  // asset this market's card would use if the poster-band system above it
  // were ever re-enabled (it currently is not; see Coupons.js v6.90).
  marketPhotoQuery: `${m.city}, ${m.state} restaurant dining`,
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

// ── Clipp PER-MERCHANT certificates (2026-08-07) ────────────────────────────
// Owner directive 2026-08-07: "fill the coupon tab with these Clipps, and if we
// have a place card for the coupon make sure they are aligned." One card per
// browser-verified merchant offer in lib/clippOffers.js CLIPP_MERCHANT_OFFERS —
// the Parrish/Tampa/St. Pete harvest. Unlike the city cards above, these name a
// single venue, so:
//   • business is the MERCHANT (which is what couponForPlaceName keys on — this
//     is the place-card alignment, plus each row's `match` variants);
//   • NO image: the city-market art set is city-card-only by its own rule, and
//     dealArtwork renders an imageless card with no band rather than a wrong
//     photo. A future pass can wire the venue's own Google photo_ref.
//   • intents split by kind — dining gets the dining moods, activities get
//     familyfun/nightout. Neither ships on outdoors/cozyindoor (same "a strip
//     that shows up everywhere is an ad" rule as the city cards).
//
// Expiry is ONE shared re-verify date, a week out, same convention and same
// reason as CLIPP_AUDIT_EXPIRY: certificates rotate weekly ("Almost Gone" /
// "Sold Out" observed on the live pages 2026-08-07) and Clipp publishes no end
// dates. All the merchant cards auto-hide together if nobody re-verifies —
// safe direction.
const CLIPP_MERCHANT_AUDIT_EXPIRY = "2026-08-17";
const CLIPP_MERCHANT_COUPONS = CLIPP_MERCHANT_OFFERS.map((o) => ({
  id: "cpn-" + o.offerId,
  business: o.merchant,
  area: o.area,
  title: o.title,
  details: `Prepaid Clipp certificate — buy on Clipp, redeem at ${o.merchant}. Inventory rotates weekly; certificates can sell out.`,
  code: null,
  url: commerceHref({ provider: "clipp", offerId: o.offerId, surface: "coupons", contentId: o.offerId }),
  expires: CLIPP_MERCHANT_AUDIT_EXPIRY,
  cta: "Get certificate",
  badge: o.badge,
  intents: o.kind === "activity" ? ["familyfun", "nightout"] : ["eatnow", "datenight", "familyfun"],
  match: Array.isArray(o.match) ? [...o.match] : [],
  // The card's visual identity (owner ask 2026-08-07 — text-only cards were
  // unreadable at a glance). Both come from the registry row, never inferred:
  // venuePhotoRef is the venue's OWN Google photo (location-verified rows only),
  // rendered via the same-origin cached /api/photo proxy; icon is the explicit
  // category emoji fallback. This is a THUMB, not the dealArtwork poster band —
  // dealArtwork's rules (local /cards/ only, no inference) are untouched.
  icon: o.icon || null,
  venuePhotoRef: o.photoRef || null,
  commerce: { provider: "clipp", offerId: o.offerId },
}));

// ── CityPASS bundled attraction tickets (2026-07-31) ────────────────────────
// The first ORLANDO-area coupon inventory that is not Clipp. It exists because
// geo-scoping the deal sheet correctly left an Orlando visitor with almost
// nothing: the honest fix for "the coupons are all gone" is more inventory in
// that metro, not a looser filter.
//
// One card per VERIFIED destination, derived from lib/cityPassOffers.js — the
// screen cannot mint one, and a destination outside the enumerated allowlist has
// no path onto the page.
//
// NO EXPIRY, deliberately. CityPASS bundles are standing products, not dated
// promotions; inventing an `expires` would either hide a live offer or make a
// false claim about a deadline. dealEndsLabel() already renders honest
// open-endedness for a null expiry.
//
// NO PRICE IN THE COPY. The bundle price varies by how many parks the user
// picks, so a fixed "from $366" would go stale silently the moment CityPASS
// repriced. The structural claim is the one that stays true.
const CITYPASS_COUPONS = CITYPASS_MARKETS.map((m) => ({
  id: "cpn-" + m.offerId,
  // CityPASS's partner style guide requires the destination before the brand
  // on first reference, plus the registered mark and one-word spelling.
  business: m.metro === "tampa" ? "Tampa Bay CityPASS®" : `${m.city} CityPASS®`,
  area: m.area,
  title: m.headline,
  details: m.detail,
  code: null,
  // OUR redirect path, never the CJ link itself (2026-08-02, audit F5). This
  // used to be cityPassTrackedUrl(...) — a live anrdoezrs.net href rendered
  // straight into crawlable DOM, which is the exact shape that produced ~144
  // bot clicks/day against ~50 human visitors on the deals rail before that
  // rail was moved behind this same redirect. A crawler that renders JS and
  // follows the link IS a billable CJ click, and a sustained 0% conversion
  // rate on automated clicks is account risk, not noise.
  //
  // The per-surface sub-id is preserved rather than lost: /api/commerce/go
  // hands its `surface` down as the CJ sub-id (see PROVIDERS.citypass), so
  // these clicks still report separately from the intent rail's.
  url: commerceHref({ provider: "citypass", offerId: m.offerId, surface: "coupon_citypass_" + m.metro, contentId: m.offerId }),
  expires: null,
  cta: "See CityPASS",
  // OUR OWN committed asset, never a partner image — same rule as the Clipp
  // cards. Set explicitly rather than letting dealArtwork fall back by intent,
  // because the familyfun fallback is the ferris-wheel illustration the owner
  // called out, and these are real ticketed attractions.
  image: "/cards/best-things-market-hero.jpg",
  // v1.00 (2026-08-08): see the matching comment on CLIPP_COUPONS above —
  // same mechanism, this row's actual attraction (Walt Disney World / Busch
  // Gardens Tampa Bay) beats a generic ferris-wheel query.
  marketPhotoQuery: `${m.city} theme park attraction`,
  badge: "Bundle",
  intents: ["familyfun", "outdoors"],
  match: [],
}));

export const COUPONS = [
  ...CLIPP_COUPONS,
  ...CLIPP_MERCHANT_COUPONS,
  ...CITYPASS_COUPONS,
  ...PARTNER_DEAL_COUPONS,

  // ── Klook partner promo codes (v6.42, 2026-07-17) — harvested VERBATIM from
  // Wayfind's Klook affiliate dashboard (authorized-codes list). Only
  // audience-relevant codes ship; expiries are Klook's own; cards auto-hide on
  // expiry. Registry: claude/wayfind-deals-registry.md (weekly deals audit).
  //
  // ONE KLOOK PATH, AND IT IS TRAVELPAYOUTS (owner decision, 2026-08-02:
  // "standardize on whichever affiliate path we intend to support long-term
  // rather than keeping two mechanisms alive").
  //
  // This card used to carry "https://www.klook.com/?aid=127667" for what the
  // old comment called two-way attribution: the aid click AND the code. That
  // was a SECOND, competing mechanism against the program we actually operate
  // — Klook runs through Travelpayouts (promoId 4110 / campaignId 137, marker
  // 750791, approved 2026-07-15, isTpProgramLive("klook") === true), which is
  // what PROVIDERS.klook and /api/commerce/go already use everywhere else. It
  // was also the last raw monetized partner URL rendered into crawlable DOM.
  //
  // The aid link is retired rather than converted, because converting it needs
  // a destination Travelpayouts can wrap and there is none to point at:
  // PROVIDERS.klook resolves only EXACT curated products ("no provider-wide
  // search or homepage escape hatch"), this was a homepage, and Klook 403s
  // every fetcher so no landing page for this code can be verified from here.
  // A 403 is not evidence a page exists.
  //
  // The card keeps the thing that actually earns: the CODE. Klook pays a
  // revenue share on orders placed with an authorized code regardless of how
  // the user arrived, and Coupons.js already renders the code, Clip and Share
  // with no CTA button when url is falsy. To give it a button back, add a
  // browser-verified Klook product to lib/partnerOfferRegistry.js and set
  // url: commerceHref({ provider: "klook", offerId: <that id>, ... }) — which
  // routes through Travelpayouts, the one path.
  //
  // grep 'aid=[0-9]' across app/ lib/ returns nothing but comments now.
  // PURGED 2026-08-07: cpn-klook-us-attractions-5 (code S3USATT). Expired
  // 2026-08-02, robot fired 08-03, auto-hidden since - the entry was dead
  // weight. The comment above remains the documented path to a future Klook
  // card; no live Klook code cards exist until the next dashboard harvest.

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
    // Day corrected 2026-08-07: geckosgrill.com listed Bar Bingo SUNDAYS
    // (Hillview 7:30-9pm) on two consecutive reads (08-03, 08-05); only the
    // aggregator still said Mondays. Operator site outranks aggregator, and the
    // url now points at the operator so the next drift is visible at source.
    title: "Bar Bingo", details: "Sundays 7:30\u20139pm, free to play",
    code: null, url: "https://geckosgrill.com/specials-and-events/", expires: "2027-01-01",
    intents: ["nightout"], match: ["Gecko's Grill & Pub Hillview"] },

  { id: "cpn-pie-on-main-lunch", business: "Pie On Main, 1507 Main St, Sarasota", area: "Sarasota",
    title: "Weekday lunch special", details: "Lunch special + sub of the day, weekdays",
    code: null, url: "https://www.visitsarasota.com/dining/pie-main", expires: "2026-12-31",
    intents: ["eatnow"], match: ["Pie On Main"] },

  { id: "cpn-ringling-museums-for-all", business: "The Ringling", area: "Sarasota",
    title: "Museums for All", details: "Free admission with SNAP/WIC/EBT (up to 4 guests, +$5 Ca' d'Zan); college students $5; FSU/USF/SCF/NCF/RCAD free",
    code: null, url: "https://www.ringling.org/tickets-admission/", expires: null,
    intents: ["familyfun", "cozyindoor", "hiddengems"], match: ["The Ringling"] },

  // PURGED 2026-08-07: cpn-discover-sarasota-local-20 (code LOCAL). Expired
  // 2026-07-31, robot fired 08-01, flagged three audits running. No August
  // successor exists - Discover Sarasota is absent from visitsarasota's deals
  // page entirely (re-checked 2026-08-05).

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

  // ── Affiliate deals (v6.17.1) — real Viator "Special Offer" discounts.
  // Viator promo end dates aren't published: expires is set to the next-but-one
  // Monday so the weekly deals audit re-verifies the discount and extends or
  // drops it. cta overrides the button label ("Claim deal" → "Book now").
  //
  // 2026-08-02 (audit F5) — this was the full viator.com product URL with
  // `pid=P00308545` visible in the markup: a live, monetized partner link in
  // crawlable DOM, with our partner id readable by anyone who viewed source.
  // It is now the product CODE behind our own redirect, which re-applies the
  // same tracking server-side (PROVIDERS.viator). Verified by CALLING
  // resolveOffer("viator","5560271P1") — it resolves to the identical
  // destination, and a bogus code returns offer-not-found rather than
  // degrading to a generic Viator page.
  // PURGED 2026-08-07, pre-expiry and deliberately so: the source ended the
  // promo (TripAdvisor same-product page showed $19.00 flat, no discount, on
  // 2026-08-03) while the card was still LIVE claiming "$16 (reg. $19)" until
  // its Aug 10 window - a price claim the source no longer supported. DO NOT
  // RENEW (registry ruling). After this purge, zero Viator special-offer cards
  // remain on the Coupons tab; ordinary Viator tour links elsewhere unaffected.
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
