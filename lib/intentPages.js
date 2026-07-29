// lib/intentPages.js — data spine for the hero-card destination pages
// (date-night, family — stamped from the /best-beaches standard). Queries
// per intent + daypart mirror the in-app EXPERIENCES definitions; results
// come from our own guarded /api/places/search, are floored on REAL rating
// depth (family = the not-hidden-gems rule: proven, high-volume places),
// ranked by the ONE Bayesian score, and never decorated with claims the
// data doesn't carry. Pure helpers exported for the lock test.
// v6.57: the seasonal entry below derives its label, colour, hero photo and
// queries from the live season, so the page states the season it is showing.
// .js extension is required: the guard suite imports this module directly under
// Node ESM (scripts/test-intent-pages.mjs), which does not resolve extensionless
// specifiers the way the bundler does. Same convention as ./envAudit.js.
import { SEASON_META, currentSeason, seasonQueries } from "./seasons.js";

export const INTENT_PAGES = {
  "date-night": {
    eyebrow: "Date night, decided",
    accent: "#F472B6",
    art: "/cards/date-night-adobestock-190984224.jpeg",
    floor: { rating: 4.4, reviews: 150 },
    // Owner (2026-07-21, follow-up): the same distance rule as family —
    // -0.2 per started 5-mile block beyond 17 mi, rank order only.
    distancePenalty: { freeMi: 17, per: 5, deduct: 0.2 },
    queries: (h) => (h >= 15 || h < 4)
      ? [{ cat: "food", q: "romantic dinner intimate" }, { cat: "nightlife", q: "wine bar cocktail lounge" }, { cat: "food", q: "waterfront dinner sunset views" }, { cat: "attractions", q: "scenic sunset spot" }]
      : [{ cat: "food", q: "romantic cafe brunch" }, { cat: "attractions", q: "botanical garden scenic walk" }, { cat: "food", q: "wine tasting winery" }, { cat: "food", q: "romantic restaurant" }],
    title: (h, city) => (h >= 5 && h < 10.5 ? "Morning date" : h < 14 ? "Lunch date" : h < 18 ? "Afternoon date" : "Tonight"),
    sub: (city) => "The best of " + city + " for two — ranked by the Wayfind Score, tuned to right now.",
  },
  family: {
    eyebrow: "Memories for life",
    accent: "#22C55E",
    art: "/cards/family-adobestock-794890098.jpeg",
    // NOT hidden gems: proven crowd-pleasers only — the ≥500-review floor is
    // the same threshold "Locals Actually Recommend" rides on.
    floor: { rating: 4.5, reviews: 500 },
    // Owner rule, THIS list only: -0.2 (on the /10 scale) per started 5-mile
    // block beyond 17 mi — far places sink dynamically; nothing else changes.
    distancePenalty: { freeMi: 17, per: 5, deduct: 0.2 },
    queries: (h) => [
      { cat: "attractions", q: "family theme park attractions things to do kids" },
      { cat: "attractions", q: "aquarium zoo wildlife" },
      { cat: "attractions", q: "science museum children discovery" },
      { cat: "food", q: "ice cream unique dessert experience" },
    ],
    title: (h, city) => "Family day",
    sub: (city) => "The most-loved family spots in " + city + " — proven by thousands, ranked by the Wayfind Score.",
  },
  // v6.57 — Seasonal Picks joins this template.
  //
  // It previously opened a SHEET (openExpSheet("seasonal")): a hero card, a sort
  // control and one detail card. Every other list surface renders this template,
  // so it now does too — same eyebrow, headline, subhead, Share action, ranked
  // rows as /date-night and /family.
  //
  // Season-derived fields come from lib/seasons.js so the page names the season
  // it is ACTUALLY showing. The old copy read "pumpkin patches and vineyards in
  // fall, holiday lights in winter, beaches and water parks in summer" — in July
  // that is noise about two seasons the user is not in.
  //
  // No hardcoded count or temperature in `sub`: list length is dynamic per
  // location and the weather is live, so "16 places" or "94°" would be numbers
  // we cannot keep. The constraint is stated; the count renders from real rows.
  //
  // floor 4.0 matches the in-app EXPERIENCES.seasonal filter exactly, so the
  // page and the sheet cannot disagree about what qualifies.
  seasonal: {
    eyebrow: SEASON_META[currentSeason()].label + " picks",
    accent: SEASON_META[currentSeason()].color,
    art: SEASON_META[currentSeason()].heroImage || "/cards/summer-seasonal-adobestock-62707647.jpeg",
    floor: { rating: 4.0, reviews: 40 },
    distancePenalty: { freeMi: 17, per: 5, deduct: 0.2 },
    queries: () => seasonQueries(currentSeason()).map((q) => ({ cat: q.cat, q: q.keyword || "" })),
    title: (h, city) => SEASON_META[currentSeason()].label + " picks near you",
    sub: (city) => "Ranked for " + currentSeason() + " in " + city + " — water, shade, and somewhere cool to wait out the afternoon. We left off anything with no cover.",
  },
  // v6.58 — "Perfect for tonight". The tile used to call setScreen("events"),
  // which is a WRONG DESTINATION, not a styling problem: a tile promising places
  // for tonight landed the user on the events calendar.
  //
  // COPY HONESTY: the approved subhead was "Filtered on live hours and drive
  // time. Anything closing within the hour is out." IntentPageClient does NOT
  // filter on hours — it floors on rating/reviews and applies distancePenalty
  // (verified: no openNow/isOpenNow/hours reference in the component). Claiming
  // an hours filter would be a claim about code that does not exist, which is
  // the exact failure the copy rules prevent. The subhead states what the page
  // actually does; if live-hours filtering ships later, the copy can grow into
  // it.
  tonight: {
    eyebrow: "Perfect for tonight",
    accent: "#818CF8",
    art: "/cards/night-out.jpg",
    floor: { rating: 4.4, reviews: 150 },
    distancePenalty: { freeMi: 17, per: 5, deduct: 0.2 },
    queries: (h) => (h >= 15 || h < 4)
      ? [
          { cat: "nightlife", q: "live music tonight" },
          { cat: "food", q: "dinner open late" },
          { cat: "nightlife", q: "cocktail bar lounge" },
          { cat: "attractions", q: "evening activity things to do tonight" },
        ]
      : [
          { cat: "attractions", q: "things to do today" },
          { cat: "food", q: "lunch highly rated" },
          { cat: "attractions", q: "indoor activity" },
          { cat: "nightlife", q: "early evening drinks" },
        ],
    title: (h, city) => (h >= 15 || h < 4) ? "Tonight, ranked" : "Today, ranked",
    sub: (city) => "The highest-scoring places in " + city + " within a short drive. We left off anything under 150 reviews — too thin to trust on a night out.",
  },
  // v6.58 — "Best of {city}". The tile called openCurated("today"); it now has a
  // page. Floor is the highest on the template deliberately: this list claims to
  // be the best in the market, so the depth requirement has to back that.
  "best-of": {
    eyebrow: "Best of",
    accent: "#FBBF24",
    art: "/cards/hidden-gems-adobestock-321810820.jpeg",
    floor: { rating: 4.3, reviews: 200 },
    distancePenalty: { freeMi: 17, per: 5, deduct: 0.2 },
    queries: (h) => [
      { cat: "attractions", q: "top attractions must see" },
      { cat: "food", q: "best restaurants" },
      { cat: "attractions", q: "iconic landmark" },
      { cat: "nightlife", q: "best bars" },
    ],
    title: (h, city) => "The highest-scoring places in " + city,
    sub: (city) => "Ranked by the Wayfind Score across every review we have. Nothing under 4.3, nothing under 200 reviews.",
  },
  // v6.58 — "Worth the drive". The tile opened openExpSheet("entertainment") with
  // a road-trip photo. The 110km radius mirrors EXPERIENCES.bucketlist, which is
  // the existing worth-the-drive class; the distancePenalty is DELIBERATELY
  // absent here — penalising distance on a list whose whole premise is "worth
  // the drive" would rank against its own thesis.
  "worth-the-drive": {
    eyebrow: "Worth the drive",
    accent: "#38BDF8",
    art: "/cards/worth-the-drive-roadtrip-hero.jpg",
    floor: { rating: 4.6, reviews: 300 },
    queries: (h) => [
      { cat: "attractions", q: "attractions things to do" },
      { cat: "attractions", q: "day trip worth the drive" },
      { cat: "attractions", q: "iconic landmark tradition" },
    ],
    title: (h, city) => "Better than anything close to " + city,
    sub: (city) => "4.6+ with 300+ reviews, out past the usual radius. We left off anything you could reach in ten minutes.",
  },
  // v6.58 — "Big fun, small budget". COPY: no dollar figure. priceLevel is a
  // coarse enum ($, $$, $$$) and $$ maps to no specific amount, so "under $25 a
  // head" would be a number we do not have — on a page about money.
  budget: {
    eyebrow: "Big fun, small budget",
    accent: "#34D399",
    art: "/cards/hidden-gems-adobestock-321810820.jpeg",
    floor: { rating: 4.4, reviews: 100 },
    distancePenalty: { freeMi: 17, per: 5, deduct: 0.2 },
    queries: (h) => [
      { cat: "attractions", q: "free cheap affordable things to do" },
      { cat: "attractions", q: "free admission park museum" },
      { cat: "food", q: "cheap eats highly rated" },
    ],
    title: (h, city) => "Still rated 4.4+, without the price tag",
    sub: (city) => "Free and low-cost places in " + city + ", ranked by the Wayfind Score. We left off anything under 100 reviews.",
  },
  "hidden-gems": {
    eyebrow: "Hidden gems",
    accent: "#A78BFA",
    art: "/cards/date-night.jpg",
    // THE GEM RULE: genuinely loved (4.6+) but NOT famous — a review CEILING of
    // 3000 is what keeps the tourist-magnets out. Chains are excluded downstream.
    floor: { rating: 4.6, reviews: 60, maxReviews: 3000 },
    heroFromList: true,
    queries: (h) => [
      { cat: "food", q: "hidden gem restaurant local favorite" },
      { cat: "food", q: "unique cafe tucked away" },
      { cat: "nightlife", q: "speakeasy hidden bar" },
      { cat: "attractions", q: "off the beaten path unique spot" },
      { cat: "attractions", q: "secret garden overlook lesser known" },
    ],
    title: (h, city) => "Hidden gems",
    sub: (city) => "The spots locals keep to themselves in " + city + " — loved, but not overrun. Ranked by the Wayfind Score.",
  },
};

export function distanceDeduction(distMi, cfg) {
  if (!cfg || !isFinite(distMi) || distMi <= cfg.freeMi) return 0;
  return Math.ceil((distMi - cfg.freeMi) / cfg.per) * cfg.deduct;
}
const R = 3958.8;
export function distMi(aLat, aLng, bLat, bLng) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const m = 60, C0 = 3.9;
export const bayes = (rating, reviews) => (Number(rating) > 0 ? ((reviews || 0) / ((reviews || 0) + m)) * Number(rating) + (m / ((reviews || 0) + m)) * C0 : 0);

// REST place JSON (our /api/places/search) -> the row the shell renders.
export function toRow(p) {
  if (!p) return null;
  const name = (p.displayName && p.displayName.text) || p.name;
  const reviews = p.userRatingCount != null ? p.userRatingCount : p.reviews;
  const photoRef = p.photos && p.photos[0] && p.photos[0].name;
  if (!name || !p.id || !(Number(p.rating) > 0)) return null;
  const la = p.location && (p.location.latitude != null ? p.location.latitude : p.lat);
  const ln = p.location && (p.location.longitude != null ? p.location.longitude : p.lng);
  return {
    id: p.id, name, rating: Number(p.rating), reviews: Number(reviews) || 0,
    lat: isFinite(la) ? Number(la) : null, lng: isFinite(ln) ? Number(ln) : null,
    photoRef: photoRef && /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(photoRef) ? photoRef : null,
    editorial: (p.editorialSummary && p.editorialSummary.text) || null,
    // v6.71 (Wave 2): date-night/family queries never search FOR beaches, but
    // a text query like "waterfront dinner sunset views" or "scenic sunset
    // spot" can still surface an actual beach from Google (types carries it —
    // FIELD_MASK on /api/places/search already requests places.types, this
    // just stops toRow from dropping it). The caller uses this only to decide
    // which ids are worth a beach-signal lookup; the DB read is the real gate
    // (a name/type false-positive just gets an empty result, never a wrong one).
    types: Array.isArray(p.types) ? p.types : [],
  };
}

export function rankRows(rows, floor, opts) {
  const seen = new Set();
  const seenBrand = new Set(); // owner (2026-07-22): one card per brand — three Melt N Dips is one Melt N Dip
  const brandKey = (r) => String(r.name || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
  const origin = opts && opts.origin;
  const pen = opts && opts.penalty;
  const withDist = (rows || []).filter(Boolean).map((r) => {
    const d = origin && isFinite(r.lat) ? distMi(origin.lat, origin.lng, r.lat, r.lng) : null;
    return { ...r, distMi: d, deduction: pen && d != null ? distanceDeduction(d, pen) : 0 };
  });
  // rank key = display-scale score minus the distance deduction; the shown
  // Score stays canonical, the why-line carries the explanation
  const key = (r) => (bayes(r.rating, r.reviews) / 5) * 10 - r.deduction;
  return withDist
    .filter((r) => r.rating >= floor.rating && r.reviews >= floor.reviews && (floor.maxReviews == null || r.reviews <= floor.maxReviews))
    .filter((r) => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
    .sort((a, b) => (key(b) - key(a)) || (b.reviews - a.reviews))
    .filter((r) => { const k = brandKey(r); if (seenBrand.has(k)) return false; seenBrand.add(k); return true; })
    .slice(0, 12);
}
