// v5.02 — SSR location landing pages ("Best Things to Do in Parrish, FL").
// The app's ranked lists are client-rendered, which means Google can't read
// Wayfind's best content. These pages put the SAME ranked, quality-gated data
// into real server HTML — one page per category per town — so the exact local
// queries Wayfind can win ("things to do in parrish fl") have an indexable
// answer with the ranked list in view-source.
//
// Server-only by design: this module calls the Places REST API directly with
// GOOGLE_MAPS_SERVER_KEY (never the browser key), gates every result through
// THE junk filter (lib/placeFilter — same module the app and the check-gate
// guardrail use), applies the same quality floor + Bayesian ranking, and
// degrades gracefully: with no key or no data the page still renders the
// editorial intro + internal links (a valid page), just without the list.
// ISR (revalidate = 1 day in the routes) keeps them fresh and fast.
import { wayfindScore, governedWayfindScore } from "./wayfindScore.js";
import { governedScoreOf } from "./lawfulOrder.js";
import { byTopRated } from "./ranking.js";
import DiscoveryPaths from "../app/components/DiscoveryPaths.js";
import { toDisplayScore } from "./score.js";
import { hasCreatorVideoAt } from "./creatorBoost.js";
import { attachTrendSignals } from "./trendSignal.js";
import { placeAllowed } from "./placeFilter";
import { localCategoryBoost } from "./localCategorySignals";
import { marketReviewFloor, passesMarketFloor } from "./marketFloor";
import { rankNightlife, railFloorFor, publishableWebsite } from "./nightlifeRail";
import { DISTRICTS_BY_CITY, CENSUS_TYPES, preflightTypes, sweepDistricts } from "./nightlifeCensus";
import { groupByContainment, childrenLabel } from "./venueContainment";
import IntentPartnerPick from "../app/components/IntentPartnerPick";
import { landingRailIntent } from "./railPlacement";
import { CURATED } from "./curated";
import { TOWN_PROFILES, TOWN_ALIASES, resolveMetro } from "./culture";
import { CULTURE } from "./cultureCorpus";
import { SITE_URL } from "./site";
import { socialMeta } from "./socialMeta";
import { getInsider } from "./insiderServer";
import TourStrip from "../app/components/TourStrip";
import PremiumIntentHero from "../app/components/PremiumIntentHero";
import { stockPhotoPool, fromPool } from "./stockPhoto.js";
import { atlasEditorialForPlace, rankingWhyLine } from "./rankingWhy.js";

export const LANDING_CATS = {
  "things-to-do": { label: "Things to Do", singular: "attraction", gateCat: "attractions", query: "top tourist attractions", townKey: "todo", icon: "🎡" },
  "restaurants": { label: "Restaurants", singular: "restaurant", gateCat: "food", query: "best restaurants", townKey: "food", icon: "🍽️" },
  "beaches": { label: "Beaches", singular: "beach", gateCat: "beach", query: "best beaches", townKey: "beach", icon: "🏖️" },
  "nightlife": { label: "Nightlife", singular: "bar or night spot", gateCat: "nightlife", query: "best bars and nightlife", townKey: "night", icon: "🍸" },
};

// Home markets first (launch prompt 5); v5.04 adds the Hawaii markets.
export const LANDING_CITIES = {
  "parrish": { name: "Parrish", state: "FL", lat: 27.5859, lng: -82.4254 },
  "ellenton": { name: "Ellenton", state: "FL", lat: 27.5217, lng: -82.5273 },
  "palmetto": { name: "Palmetto", state: "FL", lat: 27.5214, lng: -82.5723 },
  "bradenton": { name: "Bradenton", state: "FL", lat: 27.4989, lng: -82.5748 },
  "sarasota": { name: "Sarasota", state: "FL", lat: 27.3364, lng: -82.5307 },
  "lakewood-ranch": { name: "Lakewood Ranch", state: "FL", lat: 27.4438, lng: -82.3929 },
  "anna-maria-island": { name: "Anna Maria Island", state: "FL", lat: 27.5309, lng: -82.734 },
  "cortez": { name: "Cortez", state: "FL", lat: 27.4689, lng: -82.6867 },
  "longboat-key": { name: "Longboat Key", state: "FL", lat: 27.4125, lng: -82.659 },
  "siesta-key": { name: "Siesta Key", state: "FL", lat: 27.2665, lng: -82.546 },
  "venice": { name: "Venice", state: "FL", lat: 27.0998, lng: -82.4543 },
  "tampa": { name: "Tampa", state: "FL", lat: 27.9506, lng: -82.4572 },
  "orlando": { name: "Orlando", state: "FL", lat: 28.5384, lng: -81.3789 },
  // Hawaii — one anchor town per visitor coast: Oahu ×2, Maui ×2, Big Island ×2, Kauai ×2.
  "honolulu": { name: "Honolulu", state: "HI", lat: 21.3069, lng: -157.8583 },
  "kailua": { name: "Kailua", state: "HI", lat: 21.4022, lng: -157.7394 },
  "lahaina": { name: "Lahaina", state: "HI", lat: 20.8783, lng: -156.6825 },
  "kihei": { name: "Kihei", state: "HI", lat: 20.7644, lng: -156.445 },
  "kailua-kona": { name: "Kailua-Kona", state: "HI", lat: 19.64, lng: -155.9969 },
  "hilo": { name: "Hilo", state: "HI", lat: 19.7071, lng: -155.0885 },
  "lihue": { name: "Lihue", state: "HI", lat: 21.9811, lng: -159.3711 },
  "kapaa": { name: "Kapaa", state: "HI", lat: 22.075, lng: -159.319 },
};

const _nn = (s) => String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const CURATED_NAMES = new Set(CURATED.map((c) => _nn(c.name)));
const POI_RX = /park|beach|preserve|trail|garden|pier|marina|monument|landmark|memorial|boardwalk|island|natural_feature|playground|springs?\b|national_/;
// Same quality floor as lib/sources.qualityFloor (that module is client-only).
function floorOk(p) {
  if (!p) return false;
  if (p.name && CURATED_NAMES.has(_nn(p.name))) return true;
  if (p.status && p.status !== "OPERATIONAL") return false;
  if (p.rating != null && (p.reviews || 0) >= 15) return true;
  return POI_RX.test((((p.types || []).join(" ")) + " " + (p.name || "")).toLowerCase());
}
// THE app's blend, imported rather than restated. What used to sit here claimed
// to be "the same Bayesian blend" and was not: it returned bayes*10 (0–50)
// instead of round(bayes/5*100) (0–100), and it returned 39.0 for an UNRATED
// place where the real one returns null. On the 0–50 scale the distance penalty
// below (capped at 30) and the curated bonus (+15) — both tuned for 0–100 —
// weighed roughly DOUBLE what they were meant to, on the pages paid traffic
// lands on. See lib/wayfindScore.js.
const distMi = (aLat, aLng, bLat, bLng) => { const R = 3958.8, t = (d) => (d * Math.PI) / 180; const s = Math.sin(t(bLat - aLat) / 2) ** 2 + Math.cos(t(aLat)) * Math.cos(t(bLat)) * Math.sin(t(bLng - aLng) / 2) ** 2; return R * 2 * Math.asin(Math.sqrt(s)); };

// v5.31 — durable cache in front of the Places REST call. Every deploy used
// to re-run ~180 build-time searches (23 cities x 4 categories x 2 rounds);
// a heavy release day exhausted the key's quota (429) and EVERY landing page
// prerendered without its list — the exact crawlable content the pages exist
// for. Now: Supabase cache first (5-day TTL), Google only on a miss, and
// stale-if-error so a quota blip serves yesterday's list instead of none.
function _sb() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^http:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : (/^https:\/\//i.test(raw) ? raw : "https://" + raw)) : "";
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && k ? { url, k } : null;
}
async function _cacheRow(ck) {
  const s = _sb(); if (!s) return null;
  try {
    const r = await fetch(`${s.url}/rest/v1/wf_places_cache?k=eq.${encodeURIComponent(ck)}&select=v,exp`, { headers: { apikey: s.k, Authorization: `Bearer ${s.k}` }, next: { revalidate: 86400 } });
    if (!r.ok) return null;
    return (await r.json())[0] || null;
  } catch { return null; }
}
async function _cachePut(ck, v) {
  const s = _sb(); if (!s) return;
  try {
    await fetch(`${s.url}/rest/v1/wf_places_cache`, { method: "POST", headers: { apikey: s.k, Authorization: `Bearer ${s.k}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ k: ck, v, exp: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() }) }); // v6.09: 30d = ToS max (cost fix)
  } catch (e) {}
}

// `withPhotos` adds photos + opening hours to the field mask for the PAID
// landing route (/go/[city]) only. It rides a DIFFERENT cache key ("wfl2p|")
// on purpose: the organic SEO pages must keep hitting their existing cached
// rows untouched, and a shared key would let the richer payload overwrite
// them (or vice-versa, silently stripping photos back off the paid page).
async function searchOnce(query, city, radiusM, withCityName, withPhotos) {
  const key = (process.env.GOOGLE_MAPS_SERVER_KEY || "").trim();
  const ck = (withPhotos ? "wfl2p|" : "wfl1|") + [query, city.name, city.state, Math.round(radiusM), withCityName ? 1 : 0].join("|").toLowerCase().replace(/\s+/g, " ");
  const row = await _cacheRow(ck);
  if (row && Array.isArray(row.v) && new Date(row.exp).getTime() > Date.now()) return row.v;
  if (!key) return row && Array.isArray(row.v) ? row.v : null; // stale beats nothing
  const live = await _searchGoogle(query, city, radiusM, withCityName, key, withPhotos);
  if (live !== null) { await _cachePut(ck, live); return live; }
  return row && Array.isArray(row.v) ? row.v : null; // 429/down: serve stale
}

async function _searchGoogle(query, city, radiusM, withCityName, key, withPhotos) {
  try {
    // regularOpeningHours + utcOffsetMinutes are requested on BOTH paths now, not
    // just the paid one. businessStatus() needs both or it can only ever return
    // "unknown" — which is why these 84 prerendered pages have never had a real
    // open/closed state. Same SKU tier as the rating / userRatingCount /
    // priceLevel fields already in this mask, so the organic pages do not move
    // billing tier by asking for them.
    const mask = "places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.formattedAddress,places.types,places.businessStatus,places.priceLevel,places.regularOpeningHours,places.utcOffsetMinutes"
      // Paid route only. A conversion-focused card without a photo is a list
      // item; with one it's a decision. Same SKU tier as the rating fields
      // already requested, and the result is cached 30 days like the rest.
      + (withPhotos ? ",places.photos" : "");
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json", "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": mask,
      },
      body: JSON.stringify({ textQuery: withCityName ? query + " " + city.name + " " + city.state : query, maxResultCount: 20, locationBias: { circle: { center: { latitude: city.lat, longitude: city.lng }, radius: Math.min(radiusM, 50000) } } }),
      next: { revalidate: 86400 },
    });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.places || []).map((p) => {
      // Same SSRF-safe shape check /api/photo enforces on its ref param, applied
      // at the source so a malformed name never reaches the proxy.
      // Google orders photos for general relevance, not for a wide editorial
      // card. Prefer a sufficiently large landscape image whose aspect ratio
      // is close to our 3:2 crop. This prevents portrait signs, menus, and
      // awkward slivers from becoming the first paid impression.
      const photoChoices = (Array.isArray(p.photos) ? p.photos : [])
        .filter((x) => x && /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(x.name || ""))
        .map((x, index) => {
          const w = Number(x.widthPx || 0), h = Number(x.heightPx || 0);
          const ratio = w > 0 && h > 0 ? w / h : 0;
          const landscape = ratio >= 1.18 && ratio <= 2.2;
          const resolution = w >= 900 && h >= 600;
          const cropFit = ratio ? Math.abs(ratio - 1.5) : 5;
          return { ref: x.name, score: (landscape ? 100 : 0) + (resolution ? 35 : 0) - cropFit * 12 - index * 0.35 };
        })
        .sort((a, b) => b.score - a.score);
      const pr = photoChoices[0] && photoChoices[0].ref;
      return {
        id: p.id, name: p.displayName && p.displayName.text,
        rating: p.rating != null ? p.rating : null, reviews: p.userRatingCount || 0,
        address: p.formattedAddress || "", types: p.types || [], status: p.businessStatus || null,
        lat: p.location && p.location.latitude, lng: p.location && p.location.longitude,
        priceLevel: p.priceLevel || null,
        photoRef: pr && /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(pr) ? pr : null,
        // NOT a frozen openNow boolean. These pages are PRERENDERED, so a
        // boolean captured at build time asserts "open" for the next 24h — and
        // the Supabase cache row behind it lives up to 30 days, so it can be a
        // MONTH stale. Persist structured hours + the venue's own UTC offset and
        // let businessStatus() compute state in the browser against the viewer's
        // clock. Shape is identical to lib/google.js:529-532 so both producers
        // feed the one consumer.
        oh: p.regularOpeningHours && p.regularOpeningHours.periods
          ? { periods: p.regularOpeningHours.periods, weekdayDescriptions: p.regularOpeningHours.weekdayDescriptions || null }
          : null,
        utcOffset: p.utcOffsetMinutes != null ? p.utcOffsetMinutes : null,
      };
    }).filter((p) => p.name);
  } catch (e) { return null; }
}

// Nightlife census: sweep the city's districts, union by place_id, cache 30d.
// Rides the SAME cache the rest of this file uses, under its own key prefix so
// it can never overwrite an existing landing row.
async function nightlifePool(citySlug, city) {
  const key = (process.env.GOOGLE_MAPS_SERVER_KEY || "").trim();
  const ck = "wfnl1|" + citySlug;
  const row = await _cacheRow(ck);
  if (row && Array.isArray(row.v) && new Date(row.exp).getTime() > Date.now()) return row.v;
  if (!key) return row && Array.isArray(row.v) ? row.v : null;
  try {
    // Table A preflight: ONE unsupported type 400s the whole request, and the
    // sweep then returns nothing — indistinguishable from a thin market.
    const { usable } = await preflightTypes(CENSUS_TYPES, key);
    if (!usable.length) return row && Array.isArray(row.v) ? row.v : null;
    const { places } = await sweepDistricts(DISTRICTS_BY_CITY[citySlug], usable, key);
    const mapped = places.map((p) => ({
      id: p.id,
      name: typeof p.displayName === "string" ? p.displayName : (p.displayName && p.displayName.text) || "",
      lat: p.location && p.location.latitude, lng: p.location && p.location.longitude,
      rating: p.rating != null ? p.rating : null,
      reviews: p.userRatingCount || 0,
      address: p.formattedAddress || null,
      types: p.types || [], primaryType: p.primaryType || null,
      businessStatus: p.businessStatus || null,
      price: p.priceLevel || null,
      // AGENTS.md §7 applied on the WRITE path, per venue, so a Disney-hosted
      // site can never enter the pool regardless of which door the venue used.
      website: publishableWebsite(p.websiteUri) || null,
      oh: p.regularOpeningHours && p.regularOpeningHours.periods
        ? { periods: p.regularOpeningHours.periods, weekdayDescriptions: p.regularOpeningHours.weekdayDescriptions || null }
        : null,
      utcOffset: p.utcOffsetMinutes != null ? p.utcOffsetMinutes : null,
    })).filter((p) => p.name);
    if (mapped.length) { await _cachePut(ck, mapped); return mapped; }
  } catch (e) {}
  return row && Array.isArray(row.v) ? row.v : null;
}

// Ranked, gated list for one city+category. 17-mi default, widens once to
// 30 mi if a small market comes back thin — same honesty rule as the app.
export async function rankedFor(catSlug, citySlug, opts) {
  const cat = LANDING_CATS[catSlug], city = LANDING_CITIES[citySlug];
  if (!cat || !city) return null;
  // NIGHTLIFE: district-anchored census instead of one city-centre searchText.
  // Measured 2026-07-29 — the single-query path rendered 15 Orlando venues and
  // MISSED nine of the metro's ten highest-volume rooms (Twin Peaks 13,009,
  // House of Blues 7,546, Ole Red 5,927 ...). A 12-district sweep found 74
  // eligible. That is a retrieval defect; no ranking change can fix it.
  // Bounded to nightlife on purpose: every other category keeps its existing
  // path untouched until its own coverage is measured.
  if (catSlug === "nightlife" && DISTRICTS_BY_CITY[citySlug]) {
    const nl = await nightlifePool(citySlug, city);
    if (nl && nl.length) {
      nl.forEach((p) => { p.distMi = (p.lat != null && p.lng != null) ? distMi(city.lat, city.lng, p.lat, p.lng) : null; });
      // Market-relative floor from THIS market's own pool, not a flat constant.
      return rankNightlife(nl, railFloorFor(nl)).map((p) => ({ ...p, _s: p.prominence }));
    }
    // Census unavailable (no key / upstream down): fall through to the old path
    // rather than render an empty rail.
  }
  const withPhotos = !!(opts && opts.withPhotos);
  let pool = null;
  // Round 1 names the city in the text query (tight, town-proper results).
  // The widening round DROPS the city name and trusts the location bias —
  // "top tourist attractions Parrish FL" pins Google to the town itself and
  // returned 2 results for a town Wayfind's app fills with 20+ nearby.
  for (const [radiusM, withCityName] of [[27359, true], [48280, false]]) {
    const raw = await searchOnce(cat.query, city, radiusM, withCityName, withPhotos);
    if (raw === null) return null; // no key / upstream down — page renders without the list
    const gated = raw.filter((p) => (CURATED_NAMES.has(_nn(p.name)) || placeAllowed(cat.gateCat, null, p)) && floorOk(p));
    gated.forEach((p) => { p.distMi = (p.lat != null && p.lng != null) ? distMi(city.lat, city.lng, p.lat, p.lng) : null; });
    const round = gated.filter((p) => p.distMi == null || p.distMi <= (radiusM / 1609.34) * 1.3);
    // Merge rounds (round-1 town results stay in the pool) and dedupe by id.
    const seen = new Set((pool || []).map((p) => p.id));
    pool = [...(pool || []), ...round.filter((p) => !seen.has(p.id))];
    if (pool.length >= 8) break;
  }
  if (!pool || !pool.length) return [];
  // Second pass: drop entries far below their own market's attention level.
  const _floor = marketReviewFloor(pool);
  const _kept = pool.filter((p) => passesMarketFloor(p, _floor, CURATED_NAMES.has(_nn(p.name))));
  // Never empty the list to enforce a bar — if the floor would wipe the market,
  // the market is simply thin and the honest answer is the unfiltered pool.
  if (_kept.length >= 5) pool = _kept;
  // 2026-08-08: the UNIFIED trend signal (lib/trendSignal.js — real demand
  // data, hourly-cached popularity; no events feed on the server path, so the
  // popularity source alone decides). Attached BEFORE scoring so the governed
  // number below carries the disclosed +0.6. These pages are ISR-cached, so
  // freshness is bounded by each page's revalidate window. Fails soft.
  await attachTrendSignals(pool, {});
  // localCategoryBoost: a bounded (<=8pt) nudge for destination ARCHETYPES a
  // city is known for — springs, airboats, museum clusters, performing arts.
  // It never names a business, so it cannot function as paid placement; it
  // only reorders near-ties. See lib/localCategorySignals.js for sources.
  // An UNRATED place scores null, not a number. It used to score 39 — within
  // seven points of an excellent proven place — so unrated inventory ranked
  // against rated inventory on an invented figure. Null now sorts last by
  // construction rather than competing.
  // hasCreatorVideoAt NEEDS THE CITY (2026-08-16). Called bare it returns
  // false for EVERY place — the curated registry keys on city — so the flat
  // creator-video bonus in the governing law was never once applied here, and
  // this is the function that decides which 15 places per category survive
  // into every rail's pool. Measured that day: Tampa has 65 curated creator
  // spots, 42 of them in inventory, and the Locals Know rail rendered ZERO,
  // because the places a creator actually filmed were never lifted into the
  // top 15 the rail searches. Third site of the same one-argument bug;
  // scripts/check-rail-source-reachable.mjs now fails on all of them.
  pool.forEach((p) => {
    const mi = p.distMi || 0;
    const q = wayfindScore(p.rating, p.reviews);
    // THE GOVERNING LAW — owner, 2026-08-07, lib/wayfindScore.js: the
    // distance term is the flat −2 past 17 miles that lives IN the displayed
    // score, and a creator video is the flat +7. The per-mile model of 1.3/mi
    // past 4, cap 30, that stood here reordered against the chip the page
    // itself prints. Curated +15 and the bounded archetype nudge stay: they
    // are this surface's own owner directives and are additive context, not
    // hidden distance/evidence terms.
    p._s = q == null
      ? -Infinity
      : governedWayfindScore(q, { hasCreatorVideo: hasCreatorVideoAt(p, city.name), distanceMi: isFinite(mi) && mi > 0 ? mi : null, trending: !!p.trending }) + (CURATED_NAMES.has(_nn(p.name)) ? 15 : 0) + localCategoryBoost(p);
  });
  pool.sort((a, b) => (b._s - a._s) || ((b.reviews || 0) - (a.reviews || 0)));
  // v8.11 — THE GLOBAL RULE reaches the landing pages (owner, 2026-08-18,
  // third report of a list not reading highest-to-lowest: "i need that to be
  // the rule globally"). `_s` decides WHO SURVIVES into the top 15 — the
  // curated +15 and the archetype nudge keep doing their selection job — but
  // the page then printed the governed chip while KEEPING the boosted order,
  // so a curated 8.9 could sit above an uncurated 9.4. Stamp the governed
  // score (the ONE stamp, city-keyed so the creator +0.2 applies) and order
  // the shipped list by it with the ONE comparator. Shown == sorted, here too.
  const top = pool.slice(0, 15);
  for (const p of top) {
    if (Number.isFinite(p.governed_score)) continue;
    const g = governedScoreOf(p, city.name);
    if (Number.isFinite(g)) p.governed_score = g;
  }
  top.sort(byTopRated);
  return top;
}

// Ranked-line why. Star count is not the sentence (docs/editorial-standard.md).
// Implementation lives in lib/rankingWhy.js so guards can CALL it without
// loading this JSX module. The 🔥 trend disclosure still leads when present.
export function whyLine(p, _singular) {
  return rankingWhyLine(p);
}

export function cityProfile(citySlug) {
  const k = citySlug.replace(/-/g, " ");
  return TOWN_PROFILES[k] || TOWN_PROFILES[TOWN_ALIASES[k]] || null;
}

export function landingMetadata(catSlug, citySlug) {
  const cat = LANDING_CATS[catSlug], city = LANDING_CITIES[citySlug];
  if (!cat || !city) return { title: "Not found" };
  const url = `${SITE_URL}/${catSlug}/${citySlug}`;
  const title = `Best ${cat.label} in ${city.name}, ${city.state} (${new Date().getFullYear()}) — Ranked by Real Reviews`;
  const description = `The best ${cat.label.toLowerCase()} in ${city.name}, ${city.state}, ranked by rating and review volume with no ads and no paid placement. Live, honest picks from Wayfind.`;
  return { title, description, alternates: { canonical: url }, ...socialMeta({ title, description, url }) };
}

const S = {
  page: { maxWidth: 1080, margin: "0 auto", padding: "0 18px 72px", background: "#040810", color: "#F1F5F9", fontFamily: "var(--wf-sans)", lineHeight: 1.6 },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#F97316" },
  h1: { fontSize: 30, lineHeight: 1.2, margin: "10px 0 8px", fontWeight: 800, color: "#FFFFFF" },
  sub: { fontSize: 16, color: "#94A3B8", marginBottom: 8 },
  h2: { fontSize: 21, fontWeight: 800, color: "#FFFFFF", margin: "26px 0 10px" },
  card: { margin: "0 0 16px", padding: "18px", background: "linear-gradient(145deg,#101C2B,#0A1421)", border: "1px solid #2D3748", borderRadius: 22, boxShadow: "0 18px 45px rgba(0,0,0,.22)" },
  name: { fontSize: 17, fontWeight: 800, color: "#FFFFFF", margin: 0 },
  why: { fontSize: 14.5, color: "#CBD5E1", margin: "3px 0 0" },
  addr: { fontSize: 12.5, color: "#94A3B8", margin: "4px 0 0" },
  cta: { display: "inline-block", marginTop: 18, padding: "12px 22px", borderRadius: 999, background: "#F97316", color: "#0D1117", fontWeight: 800, fontSize: 15, textDecoration: "none" },
  link: { color: "#F97316", textDecoration: "none", fontWeight: 700 },
  note: { fontSize: 12, color: "#94A3B8", margin: "18px 0 0", padding: "10px 14px", background: "#161B22", borderRadius: 10 },
};

// v6.57 — FIX: repetitive images across every landing page (owner-reported,
// starting on /things-to-do/sarasota; source-read confirmed it hits all ~20
// cities x 4 categories, hero AND every card). Root cause: these routes never
// fetch Google photos (withPhotos is paid-route-only, see searchOnce() above),
// so photoRef is always null here and every card fell back to ONE static
// image PER CATEGORY, shared by every city and every card on the page. Now:
// stockPhotoPool() (lib/stockPhoto.js) pulls a real, city+category-matched
// pool of free Pexels photos, cycled per card by index. These four files stay
// ONLY as the last-resort fallback when PEXELS_API_KEY is unset or a fetch
// fails — never removed, so the page can never render a broken <img>.
const LANDING_HERO = {
  "things-to-do": "/brand/orlando-roller-coaster-portrait.jpg",
  restaurants: "/cards/date-night-dining-hero.jpg",
  // v8.24 (owner: "I never want to see this image ever again") — the AI neon-concert composite (night-out.jpg) is BANNED and deleted; real concert-crowd photo instead.
  nightlife: "/cards/tonight-alfonso-scarpa-unsplash.jpg",
  beaches: "/cards/beach-adobestock-216195684.jpeg",
};
const CATEGORY_PHOTO_QUERY = {
  "things-to-do": "tourist attraction",
  restaurants: "restaurant dining",
  nightlife: "nightlife bar",
  beaches: "beach coastline",
};
// City + state + category — e.g. "Sarasota, FL beach coastline" — a real,
// content-matched search per city instead of one generic image shared by all.
function landingPhotoQuery(city, catSlug) {
  return `${city.name}, ${city.state} ${CATEGORY_PHOTO_QUERY[catSlug] || catSlug}`;
}
// A place's own Google photo wins when present (not on these routes today,
// see above — kept so this function stays correct if that ever changes).
// Otherwise: cycle the city+category Pexels pool by card index, so cards on
// the SAME page differ from each other too, not only across cities. Empty
// pool (no key / fetch failure) -> the single static category image, exactly
// today's behavior.
function landingPhoto(p, catSlug, pool, index) {
  if (p && p.photoRef) return "/api/photo?ref=" + encodeURIComponent(p.photoRef) + "&w=1200";
  const stock = fromPool(pool, index || 0);
  return stock ? stock.url : LANDING_HERO[catSlug];
}

// v6.61 (owner build order #5): the ranking ROWS consume the editorial too.
// One anon in() call for the verified Wayfind cards; where one exists we render
// hook + why_here + local_tip. Atlas whyGo fills only the gap — it never
// overwrites a fleet why_here. No sourced why → the row shows no why block.
async function landingEditorials(places) {
  const list = Array.isArray(places) ? places : [];
  const ids = list.map((p) => p && p.id).filter(Boolean);
  const out = {};
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (url && anon && ids.length) {
    try {
      const r = await fetch(url + "/rest/v1/wf_editorial?verified=is.true&select=place_id,hook,why_here,local_tip&place_id=in.(" + ids.map(encodeURIComponent).join(",") + ")", { headers: { apikey: anon, Authorization: "Bearer " + anon }, next: { revalidate: 3600 } });
      if (r.ok) {
        const rows = await r.json();
        for (const e of Array.isArray(rows) ? rows : []) out[e.place_id] = e;
      }
    } catch (e) { /* fleet join is best-effort; Atlas still fills below */ }
  }
  for (const p of list) {
    if (!p || !p.id) continue;
    const prev = out[p.id];
    if (prev && prev.why_here) continue;
    const row = atlasEditorialForPlace(p);
    if (!row) continue;
    out[p.id] = {
      place_id: p.id,
      hook: (prev && prev.hook) || row.hook,
      why_here: row.why_here || null,
      local_tip: (prev && prev.local_tip) || row.local_tip,
    };
  }
  return out;
}


// v6.71 (Wave 2): the same wf_beach_water / wf_place_popularity_scored reads
// every other beach surface uses (PlaceCard, Detail sheet, Best Beaches, Best
// Nearby, Things To Do, date-night/family), server-baked here exactly like
// landingEditorials() above rather than client-hydrated — this route is a
// 1-day ISR page and the rest of its "live" content (rankings, editorials)
// already lives on that same cadence, so a client fetch would buy freshness
// this page doesn't otherwise have while adding a hydration mismatch risk to
// a page whose whole point is being crawlable server HTML. Called ONLY for
// catSlug === "beaches" below — the other three categories never have rows
// in either table, so skip the request rather than firing it for nothing.
async function landingBeachSignals(ids) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anon || !ids.length) return {};
  const idList = ids.map(encodeURIComponent).join(",");
  try {
    const [wRes, pRes] = await Promise.all([
      fetch(url + "/rest/v1/wf_beach_water?select=beach_place_id,result,advisory,sampled_at&beach_place_id=in.(" + idList + ")", { headers: { apikey: anon, Authorization: "Bearer " + anon }, next: { revalidate: 3600 } }),
      fetch(url + "/rest/v1/wf_place_popularity_scored?select=place_id,tier2_popularity&place_id=in.(" + idList + ")", { headers: { apikey: anon, Authorization: "Bearer " + anon }, next: { revalidate: 3600 } }),
    ]);
    const out = {};
    if (wRes.ok) { for (const r of await wRes.json()) out[r.beach_place_id] = { ...(out[r.beach_place_id] || {}), water: r }; }
    if (pRes.ok) { for (const r of await pRes.json()) out[r.place_id] = { ...(out[r.place_id] || {}), popularityPct: r.tier2_popularity }; }
    return out;
  } catch (e) { return {}; }
}

export async function LandingPage({ catSlug, citySlug }) {
  const cat = LANDING_CATS[catSlug], city = LANDING_CITIES[citySlug];
  if (!cat || !city) return <main style={S.page}><h1 style={S.h1}>Not found</h1><p><a href="/" style={S.link}>Back to Wayfind</a></p></main>;
  const url = `${SITE_URL}/${catSlug}/${citySlug}`;
  const list = await rankedFor(catSlug, citySlug);
  // City+category-matched photo pool (lib/stockPhoto.js) — fetched once per
  // render, cached 21d server-side (Supabase-backed, same table every other
  // list on this page rides). Empty array when PEXELS_API_KEY is unset or the
  // fetch fails; landingPhoto()/the hero both fall back to the pre-existing
  // static image in that case, so this can never break the page.
  const stockPool = await stockPhotoPool(landingPhotoQuery(city, catSlug));
  // v5.22: insider intel for the top 5 (cache-first — the model runs at most
  // once per place per month; ISR re-renders read the cache). Doubles as
  // unique indexable content no directory has.
  const insiderByIdx = {};
  if (Array.isArray(list) && list.length) {
    await Promise.all(list.slice(0, 5).map(async (p, i) => {
      try { const ins = await getInsider({ id: p.id, name: p.name, city: city.name, type: (p.types || [])[0] || "", rating: p.rating, reviews: p.reviews }); if (ins && (ins.tip || ins.special)) insiderByIdx[i] = ins; } catch (e) {}
    }));
  }
  const prof = cityProfile(citySlug);
  const metro = resolveMetro(city.name + ", " + city.state);
  // A missing server key/upstream response intentionally returns null so the
  // landing page can render its honest live-rankings fallback. Keep the
  // editorial lookup equally fail-soft during static export.
  const eds = await landingEditorials(list || []);
  const beachSignals = catSlug === "beaches" ? await landingBeachSignals((list || []).map((p) => p.id).filter(Boolean)) : {};
  const culture = metro && CULTURE[metro] ? CULTURE[metro] : null;
  const profLine = prof && prof[cat.townKey] && prof[cat.townKey].line;
  // Declared per category in lib/railPlacement.js — null for nightlife, which
  // has no bookable partner inventory in any program we hold.
  const railIntent = landingRailIntent(catSlug);
  // One destination, one card. Rides/shops inside a theme park render INSIDE
  // that park's card instead of as peer rows — a ride is not somewhere you can
  // go, it is a reason to pick the park. Ranking is untouched; this is purely
  // how the ranked list is presented.
  const grouped = (list && list.length) ? groupByContainment(list) : { groups: [], nestedIds: new Set() };
  const topLevel = grouped.groups;
  const ld = [];
  ld.push({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "Wayfind", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: cat.label, item: `${SITE_URL}/${catSlug}/${citySlug}` },
    { "@type": "ListItem", position: 3, name: city.name + ", " + city.state, item: url },
  ] });
  if (list && list.length) {
    ld.push({ "@context": "https://schema.org", "@type": "ItemList", name: `Best ${cat.label} in ${city.name}, ${city.state}`, numberOfItems: topLevel.length, itemListElement: topLevel.map(({ place: p }, i) => ({ "@type": "ListItem", position: i + 1, item: { "@type": "LocalBusiness", name: p.name, address: p.address || undefined, geo: p.lat != null ? { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng } : undefined, aggregateRating: p.rating != null && p.reviews >= 15 ? { "@type": "AggregateRating", ratingValue: p.rating, reviewCount: p.reviews } : undefined } })) });
    ld.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [
      { "@type": "Question", name: `What is the best ${cat.singular} in ${city.name}, ${city.state}?`, acceptedAnswer: { "@type": "Answer", text: `${list[0].name} currently ranks #1${list[0].rating != null ? ` with a ${list[0].rating}★ rating across ${(list[0].reviews || 0).toLocaleString()} reviews` : ""}, based on Wayfind's merit-only ranking (rating, review volume, and proximity — no ads, no paid placement).` } },
      { "@type": "Question", name: `What are the top 5 ${cat.label.toLowerCase()} in ${city.name}?`, acceptedAnswer: { "@type": "Answer", text: list.slice(0, 5).map((p, i) => `${i + 1}. ${p.name}`).join(" ") } },
    ] });
  }
  return (
    <main style={S.page}>
      {ld.map((x, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(x) }} />)}
      {/* title keeps `, ${city.state}` so the visible H1 matches landingMetadata's
          <title> and the canonical. description states the METHOD, not just the
          promise — these pages carry Viator/Ticketmaster affiliate links and the
          structured description already tells search engines the list is ranked
          by rating and review volume with no paid placement, so the visible page
          must say at least as much. Both are asserted by
          scripts/test-ranking-editorial.mjs — this regression shipped green once
          because no guard read this copy. */}
      {/* image: index -1 (last of pool), not 0 — card i=0 below also reads
          index 0, and with a shared pool that put the hero and the FIRST
          ranked card side by side wearing the identical photo. -1 wraps to
          the pool's last entry via fromPool's modulo, so hero and card #1
          never collide as long as the pool has more than one photo. */}
      <PremiumIntentHero
        eyebrow={`${cat.icon} Your ${cat.label.toLowerCase()} compass`}
        location={`${city.name}, ${city.state}`}
        title={`The best ${cat.label.toLowerCase()} in ${city.name}, ${city.state}—without the endless search.`}
        description={`Wayfind turns “${cat.query} in ${city.name}” into a small, confident shortlist. Ranked by rating weighted by review volume, then proximity — no ads, no paid placement, updated daily.`}
        image={(fromPool(stockPool, -1) || {}).url || LANDING_HERO[catSlug]}
        primaryHref={"/?intent=" + encodeURIComponent(cat.query + " in " + city.name)}
        primaryLabel="Personalize my shortlist"
        secondaryHref="#wayfind-shortlist"
        secondaryLabel="See the ranked picks"
      />
      <section style={{ maxWidth: 920, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 28, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <div style={S.kicker}>Chosen with context · Never sponsored</div>
          <h2 id="wayfind-shortlist" style={{ ...S.h1, fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 42, lineHeight: 1.04 }}>Your {city.name} shortlist.</h2>
        </div>
        <p style={{ ...S.sub, maxWidth: 410, margin: 0 }}>Wayfind weighs rating quality, review depth, proximity, and local context—then tells you why each choice belongs.</p>
      </div>
      {/* AUDIT F3 (2026-08-02) — this template had ZERO commerce. Not a thin
          rail, not a dark one: `grep -c commerceHref|experienceGoUrl|
          BookingCTA|isTicketyPlace lib/landing.js` returned 0. It renders
          /things-to-do/[city], the most commercially-intended URL shape the
          site owns, on 31 visitors in 30 days, while Orlando alone had 193
          link-checked Viator products and 10 theme-park deals behind it.

          Placed BEFORE the ranked list and outside it on purpose. These picks
          never enter rankRows(), the Wayfind Score, or the durable place
          order — they are a separate partner layer, exactly as on the intent
          pages, and the component carries its own commission disclosure. The
          intent is declared per category in lib/railPlacement.js; nightlife
          resolves to null and renders nothing, because no partner program
          sells bar inventory. */}
      {railIntent ? (
        <IntentPartnerPick
          city={city.name}
          intent={railIntent}
          inventory={[]}
          lat={city.lat}
          lng={city.lng}
          couponIntent={cat.townKey === "food" ? "cheapeats" : null}
        />
      ) : null}
      {profLine ? <p style={{ fontSize: 15, color: "#CBD5E1", padding: "15px 18px", borderRadius: 16, background: "#1C2230", border: "1px solid #2D3748" }}><b style={{ color: "#F97316" }}>{city.name}, decoded:</b> {profLine}</p> : null}
      {prof && prof.one ? <p style={{ fontSize: 14, color: "#CBD5E1", padding: "15px 18px", borderRadius: 16, background: "#1C2230", border: "1px solid #2D3748" }}><b style={{ color: "#FBBF24" }}>The one thing to know:</b> {prof.one}</p> : null}
      {list === null ? (
        <p style={{ fontSize: 15, color: "#CBD5E1" }}>Live rankings are loading — open <a href="/" style={S.link}>Wayfind</a> for the current list near you.</p>
      ) : list.length === 0 ? (
        <p style={{ fontSize: 15, color: "#CBD5E1" }}>{city.name} is a thin market for {cat.label.toLowerCase()} — <a href="/" style={S.link}>Wayfind</a> widens the search honestly and labels every distance.</p>
      ) : (
        <>
          <h2 style={S.h2}>The ranked list</h2>
          {topLevel.map(({ place: p, children }, i) => (
            <div key={p.id || i} style={S.card}>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 260px", minHeight: 230, borderRadius: 16, overflow: "hidden", background: "#1C2230" }}>
                <img src={landingPhoto(p, catSlug, stockPool, i)} alt="" style={{ width: "100%", height: "100%", minHeight: 230, display: "block", objectFit: "cover" }} />
              </div>
              <div style={{ flex: "1.65 1 380px", minWidth: 0 }}>
              <div style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: "1.7px", textTransform: "uppercase", color: "#F97316" }}>{i === 0 ? "Best match" : "More strong matches"}</div>
                  <p style={{ ...S.name, marginTop: 5, fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 28, lineHeight: 1.08 }}>{p.name}</p>
                </div>
                {(() => {
                  // v8.11 — the chip reads the STAMPED score the row was
                  // SORTED by (rankedFor stamps it, city-keyed). The inline
                  // recompute that stood here called hasCreatorVideoAt with
                  // ONE argument — the same returns-false-for-everything form
                  // that emptied the locals rail — so a creator place's chip
                  // could read 0.2 under the number it was ranked by.
                  const _q = wayfindScore(p.rating, p.reviews);
                  const _mi = p.distMi || 0;
                  const _shown = Number.isFinite(p.governed_score)
                    ? toDisplayScore(p.governed_score)
                    : _q == null ? null : toDisplayScore(governedWayfindScore(_q, { hasCreatorVideo: hasCreatorVideoAt(p, city.name), distanceMi: isFinite(_mi) && _mi > 0 ? _mi : null, trending: !!p.trending }));
                  return (
                    // v8.17 (owner, live screenshot: "no wayfind score — what
                    // is going on"). The chip painted its text in its OWN
                    // BACKGROUND COLOR (#1C2230 on #1C2230) — the score was
                    // rendered and invisible on every landing row. Green badge
                    // chrome now matches the iconic card's score badge; locked
                    // by scripts/check-invisible-text.mjs.
                    <div style={{ minWidth: 58, padding: "9px 8px", borderRadius: 14, background: "linear-gradient(135deg,#16A34A,#0E7A38)", color: "#FFFFFF", textAlign: "center", fontWeight: 900, lineHeight: 1, boxShadow: "0 6px 16px rgba(22,163,74,.25)" }}>
                      {_shown != null ? <>{_shown}<span style={{ fontSize: 9, fontWeight: 700 }}>/10</span></> : <span style={{ fontSize: 10, fontWeight: 700 }}>Score<br />pending</span>}
                      <div style={{ marginTop: 5, fontSize: 7.5, letterSpacing: "1.2px" }}>WAYFIND</div>
                    </div>
                  );
                })()}
              </div>
              {(() => {
                const sig = beachSignals[p.id];
                // 2026-08-08: the 🔥 is the UNIFIED trend signal (lib/trendSignal.js,
                // attached in rankedFor) and the disclosure for the +0.6 governed
                // component; the beach-only popularity flame is folded into it.
                // Water quality stays a beach-signal read.
                // v8.19 — the same plain-language vocabulary as lib/beachChip.js
                // WATER_PLAIN (owner: a first-time reader must know what the
                // band MEANS for a swim; bare "Moderate" told them nothing).
                const wq = sig && sig.water ? (sig.water.advisory ? { t: "Water advisory — no swimming today", c: "#EF4444" } : sig.water.result === "Good" ? { t: "Water: clear — great for swimming", c: "#22C55E" } : sig.water.result === "Moderate" ? { t: "Water: fair — fine for a swim", c: "#FBBF24" } : sig.water.result ? { t: "Water: poor — skip the swim", c: "#EF4444" } : null) : null;
                const trending = !!(p.trending && p.trend_reason);
                if (!wq && !trending) return null;
                return (
                  <p style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 13, fontWeight: 700, margin: "4px 0 0" }}>
                    {trending ? <span style={{ color: "#FB923C" }} title={"Trending — " + p.trend_reason}>🔥 {p.trend_reason}</span> : null}
                    {wq ? <span style={{ color: wq.c }}>🏖️ {wq.t}</span> : null}
                  </p>
                );
              })()}
              {eds[p.id] && eds[p.id].hook ? <p style={{ fontSize: 14.5, fontWeight: 700, color: "#FBBF24", margin: "2px 0 4px", lineHeight: 1.4 }}>{eds[p.id].hook}</p> : null}
              {(() => {
                const why = eds[p.id] && eds[p.id].why_here ? eds[p.id].why_here : whyLine(p, cat.singular);
                if (!why) return null;
                return (
                  <div style={{ borderLeft: "3px solid #FF7A1A", paddingLeft: 14, marginTop: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "1.7px", textTransform: "uppercase", color: "#8797AA" }}>Why it fits</div>
                    <p style={{ ...S.why, fontSize: 15, marginTop: 5 }}>{why}</p>
                  </div>
                );
              })()}
              {(() => { const tip = (eds[p.id] && eds[p.id].local_tip) || (insiderByIdx[i] && (insiderByIdx[i].tip || insiderByIdx[i].special)); return tip ? <p style={{ fontSize: 13.5, color: "#F1F5F9", margin: "6px 0 0", lineHeight: 1.5 }}>🗝️ <b>Insider:</b> {tip}</p> : null; })()}
              {p.address ? <p style={S.addr}>{p.address}</p> : null}
              {/* 2026-08-26: the delivery link that lived here is gone with
                  the Uber Eats removal (owner directive; lib/affiliates.js
                  REMOVED note) — it redirected to an untracked partner search. */}
              {children && children.length ? (
                <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid #21262D" }}>
                  <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", color: "#94A3B8", margin: "0 0 7px" }}>
                    {childrenLabel(p, children)}
                  </p>
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                    {children.map((c) => (
                      <span key={c.id || c.name} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#0D1117", border: "1px solid #21262D", borderRadius: 999, padding: "5px 10px", fontSize: 12.5, color: "#CBD5E1" }}>
                        {c.name}
                        {c.rating != null ? <span style={{ color: "#F2C14E", fontWeight: 700 }}>{c.rating}{"\u2605"}</span> : null}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
                <a href={"/?q=" + encodeURIComponent(p.name || "")} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 42, padding: "8px 18px", borderRadius: 12, background: "#1A273A", border: "1px solid #3A4B61", color: "#FFFFFF", textDecoration: "none", fontWeight: 800, fontSize: 13.5 }}>See the details →</a>
                <a href={"/?q=" + encodeURIComponent(p.name || "")} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 42, padding: "8px 18px", borderRadius: 12, background: "transparent", border: "1px solid #9B4D27", color: "#FF9A62", textDecoration: "none", fontWeight: 800, fontSize: 13.5 }}>+ Add to my plan</a>
              </div>
              </div>
              </div>
            </div>
          ))}
        </>
      )}
      {/* Tours mount ONLY where the tour inventory genuinely matches the page.
          things-to-do: attractions are what Viator sells. beaches: the same
          waterOnly strip already live on /best-beaches/[metro]. Restaurants get
          Order In per card instead (above); nightlife gets NOTHING — a generic
          day-tour rail on a bar page is the entity mismatch we refuse to ship,
          and a wrong recommendation costs more than the click is worth. */}
      {catSlug === "things-to-do" ? <TourStrip lat={city.lat} lng={city.lng} title={"Book an experience in " + city.name} subtitle="Bookable, top-reviewed things to do nearby — ranked by the same Wayfind Score." /> : null}
      {catSlug === "beaches" ? <TourStrip lat={city.lat} lng={city.lng} title={"Make it a beach day in " + city.name} subtitle="Bookable on-the-water experiences near these beaches — ranked by the same Wayfind Score." waterOnly /> : null}
      <a href="/" style={S.cta}>See live hours, photos &amp; today&apos;s picks on Wayfind →</a>
      <h2 style={S.h2}>More in {city.name}</h2>
      <p style={{ fontSize: 14.5 }}>
        {Object.keys(LANDING_CATS).filter((c) => c !== catSlug).map((c, i, arr) => (<span key={c}><a href={`/${c}/${citySlug}`} style={S.link}>Best {LANDING_CATS[c].label} in {city.name}</a>{i < arr.length - 1 ? " · " : ""}</span>))}
        {culture ? <> · <a href={`/culture/${metro}`} style={S.link}>What {culture.title} is known for</a></> : null}
      </p>
      <h2 style={S.h2}>Best {cat.label} in nearby cities</h2>
      <p style={{ fontSize: 14.5 }}>
        {Object.keys(LANDING_CITIES).filter((c) => c !== citySlug).map((c, i, arr) => (<span key={c}><a href={`/${catSlug}/${c}`} style={S.link}>{LANDING_CITIES[c].name}</a>{i < arr.length - 1 ? " · " : ""}</span>))}
      </p>
      <div style={S.note}>Rankings are merit-based and recomputed daily from live data. Wayfind never sells placement on this list.</div>
      {/* The rail intents were reachable from the homepage and nowhere
          else — 0 intent links on every page type, measured. */}
      <DiscoveryPaths region={metro === "orlando" ? "orlando" : "fl"} citySlug={citySlug} cityLabel={city.name} />
      </section>
    </main>
  );
}
