// lib/guideDeals.js — which registry offers a guide shows, when nobody typed
// them in by hand.
//
// THE BUG THIS FIXES (owner, 2026-08-19, on the Bradenton birthday-freebies
// guide): "we definitely have an opportunity to add clipp coupons in an article
// like this — why is it that you can not link that as a smart idea".
//
// He is describing a wiring gap, not a missing feature. All the parts already
// exist and none of them are connected:
//
//   · lib/coupons.js holds 69 verified registry rows, every one of them tagged
//     with an `area` and an `intents` list.
//   · Twenty-one of those are in the Bradenton/Sarasota market, including the
//     Clipp half-price dining certificates for that exact city.
//   · The guide knows its own `region`, and lib/guideCta.js already classifies
//     what a guide IS via guideIntent().
//   · app/guides/[slug]/page.js renders deal cards from `g.dealCards` — A
//     HAND-TYPED ARRAY OF IDS. Two guides out of thirty-nine have one.
//
// So thirty-seven guides showed no local offers, not because none matched, but
// because the match was a human's job and nobody did it. That is the whole
// defect: an editorial step standing where a resolver belongs.
//
// WHAT THIS DOES NOT DO, and must not:
//
//   · It does not mint offers. Every id it returns is a REGISTRY row, so the
//     "an unregistered offer has no way to appear" rule in GuideDealCards is
//     untouched — this module only chooses among rows that already exist.
//   · It does not override an editor. A guide that declares dealCards keeps
//     exactly what it declares, in that order. Hand-curation always wins.
//   · It does not stretch geography. A Key West guide gets nothing rather than
//     Tampa's offers, because "near you" has to stay true — the same rule the
//     beach hero and the rail coverage radius run on.
//   · It does not show an expired certificate. Clipp merchant rows rotate
//     weekly and most of the Bradenton set lapsed on 2026-08-17; couponIsLive
//     is applied here so a stale week renders fewer cards, never a dead one.
import { COUPONS, couponIsLive } from "./coupons.js";
import { guideIntent } from "./guideCta.js";

// A guide's region -> the registry areas that are genuinely ITS market, nearest
// first. Ordering is load-bearing: it is the tie-breaker below, so a Bradenton
// guide prefers a Bradenton offer over a Sarasota one that scores the same.
//
// Only markets we actually carry inventory for appear. A region that is not a
// key here resolves nothing, deliberately — see the geography note above.
export const GUIDE_MARKET_AREAS = Object.freeze({
  Bradenton: Object.freeze(["Bradenton", "Sarasota-Manatee", "Palmetto", "Lakewood Ranch", "Sarasota"]),
  Parrish: Object.freeze(["Bradenton", "Palmetto", "Sarasota-Manatee", "Lakewood Ranch", "Sarasota"]),
  Sarasota: Object.freeze(["Sarasota", "Sarasota-Manatee", "Lakewood Ranch", "Osprey", "Bradenton", "Palmetto"]),
  Tampa: Object.freeze(["Tampa", "Brandon", "Riverview", "Valrico", "Lithia", "Ruskin", "Plant City", "Land O' Lakes"]),
  "St. Petersburg": Object.freeze(["St. Petersburg", "Pinellas Park", "Clearwater", "Tierra Verde"]),
  Orlando: Object.freeze(["Orlando"]),
});

// Three is the cap and it is a judgement, not a shrug: the block sits ABOVE the
// guide's one monetized CTA (GuideConversion), and a wall of offers there turns
// the page into the choice wall the whole guide format exists to replace.
export const GUIDE_DEAL_MAX = 3;

/** Every area string that belongs to a guide's market. Empty for an unmapped region. */
export function areasForRegion(region) {
  const a = GUIDE_MARKET_AREAS[String(region || "").trim()];
  return a ? a.slice() : [];
}

/**
 * Score a registry row against a guide. Higher is better; null means "do not
 * show this one at all", which is different from "show it last".
 */
export function scoreDealForGuide(coupon, { areas, intent }) {
  const c = coupon;
  if (!c || !c.id) return null;
  const areaRank = areas.indexOf(String(c.area || ""));
  if (areaRank < 0) return null;                       // not this market
  const intents = Array.isArray(c.intents) ? c.intents : [];
  if (!intents.length) return null;                    // cannot be placed honestly
  let score = 0;
  // The guide's own classified intent is the strongest signal we have for
  // whether an offer belongs on THIS page rather than merely in this town.
  if (intent && intents.includes(intent)) score += 100;
  // Distance from the guide's own town, in market-order steps.
  score += Math.max(0, 40 - areaRank * 8);
  // A tracked commerce row earns; an untracked one is a courtesy link. Both are
  // honest, but when they tie on relevance the one that pays should lead —
  // that is the entire point of the surface.
  if (c.commerce) score += 12;
  // A row with a real venue photo renders a card rather than a coloured box.
  if (c.venuePhotoRef || c.placeId) score += 4;
  return score;
}

/**
 * The ids a guide should render.
 *
 * @param {object} g       a GUIDES entry
 * @param {string} today   siteTodayStr()
 * @returns {string[]}     registry ids, best first, at most GUIDE_DEAL_MAX
 */
export function guideDealIds(g, today) {
  if (!g) return [];
  // AN EDITOR'S CHOICE IS FINAL. Returned verbatim, unfiltered and unsorted:
  // page.js already drops expired rows, and reordering someone's deliberate
  // sequence would be this module quietly overruling them.
  if (Array.isArray(g.dealCards) && g.dealCards.length) return g.dealCards.slice();
  const areas = areasForRegion(g.region);
  if (!areas.length) return [];
  let intent = null;
  try { intent = guideIntent(g); } catch (e) { intent = null; }
  const scored = [];
  for (const c of COUPONS) {
    if (!c || !couponIsLive(c, today)) continue;
    const s = scoreDealForGuide(c, { areas, intent });
    if (s == null) continue;
    scored.push({ id: c.id, business: String(c.business || ""), score: s });
  }
  // Deterministic to the last tie: a build that reorders these between two runs
  // would change what a cached page shows for no reason anyone could explain.
  scored.sort((a, b) => (b.score - a.score) || a.business.localeCompare(b.business) || a.id.localeCompare(b.id));
  // ONE CARD PER MERCHANT. Gecko's alone has three live offers in this market,
  // and three cards for one pub reads as an advert rather than as a shortlist.
  const seen = new Set();
  const out = [];
  for (const row of scored) {
    const key = row.business.toLowerCase();
    if (key && seen.has(key)) continue;
    seen.add(key);
    out.push(row.id);
    if (out.length >= GUIDE_DEAL_MAX) break;
  }
  return out;
}

/** True when the ids were resolved here rather than declared by an editor. */
export function guideDealsAreAuto(g) {
  return !(g && Array.isArray(g.dealCards) && g.dealCards.length);
}
