// v5.02 — SSR location landing pages ("Best Things to Do in Parrish, FL").
// The app's ranked lists are client-rendered, which means Google can't read
// Wayfind's best content. These pages put the SAME ranked, quality-gated data
// into real server HTML — one page per category per town — so the exact local
// queries Wayfind can win ("things to do in parrish fl") have an indexable
// answer with the ranked list in view-source.
//
// Server-only by design. Lists prefer owned wf_inventory (same library-serve
// home chips use after #955). Identity-before-rank: if inventory returns rows,
// searchText is not called. During `next build` / SSG, Places is never called
// — missing inventory env renders the editorial shell with an empty list.
// Runtime ISR may still fall through to Places when the library is empty.
// Ranking is never for sale. ISR (revalidate = 1 day) keeps them fresh.
import { wayfindScore, governedWayfindScore } from "./wayfindScore.js";
import { gateShut, spendAllowCapped, textEnterpriseCap } from "./spendGate.js";
import { governedScoreOf } from "./lawfulOrder.js";
import { byTopRated } from "./ranking.js";
import { hasCreatorVideoAt } from "./creatorBoost.js";
import { attachTrendSignals } from "./trendSignal.js";
import { placeAllowed } from "./placeFilter";
import { localCategoryBoost } from "./localCategorySignals";
import { marketReviewFloor, passesMarketFloor } from "./marketFloor";
import { rankNightlife, railFloorFor, publishableWebsite } from "./nightlifeRail";
import { DISTRICTS_BY_CITY, CENSUS_TYPES, preflightTypes, sweepDistricts } from "./nightlifeCensus";
import { CURATED } from "./curated";
import { TOWN_PROFILES, TOWN_ALIASES } from "./culture";
import { SITE_URL } from "./site";
import { socialMeta } from "./socialMeta";
import { rankingWhyLine } from "./rankingWhy.js";
import { fetchDeadline, NET_DEADLINE_MS, DB_DEADLINE_MS } from "./fetchDeadline.js";
import { isSsgBuild, placesCallsForbidden, fetchLandingInventory, landingIdentityOk, nightlifeLandingEligible } from "./landingInventory.js";
import { isNotPublicPlace } from "./notPublicPlaces.js";
// SEO recovery (2026-09-23) — internal links INTO the durable /places/{id}
// pages. Search Console shows zero /places/{id} pages indexed and nothing
// linking to one except guides; these hub pages link their places only to
// /p/{id} (noindex share URL) or /?q= (the app). listIndexedIds() is the
// SAME durable-eligible set the sitemap and generateStaticParams use — never
// every place on the page, only the ones Google is actually being told to
// index. Async + fail-soft (see lib/placeIndex.js header): a Supabase hiccup
// returns [], and the nav below simply renders nothing rather than 500ing a
// page whose card markup and ranking are otherwise untouched.
// v8.99 (2026-09-06) — see the LANDING_CITIES re-export below for why this is
// a real IMPORT (a local binding), not folded into that `export ... from`
// line: this file's own code (rankedFor, below) reads the bare identifier
// LANDING_CITIES, and `export { X } from "spec"` does NOT bind X locally —
// it only forwards X to a consumer that imports THIS module. Shipping that
// as a pure re-export threw "ReferenceError: LANDING_CITIES is not defined"
// from inside rankedFor() the moment it ran for real (caught silently by
// lib/railsData.js's buildDrivePool, which empties the "drive" rail rather
// than surfacing the error) — caught by scripts/check-rail-compute-budget.mjs
// (EQUIVALENCE FAILED: drive) before this ever reached production.
import { LANDING_CITIES } from "./landingCities.js";
import { evergreenCityFor, evergreenSlugsFor } from "./evergreenCities.js";

export const LANDING_CATS = {
  "things-to-do": { label: "Things to Do", singular: "attraction", gateCat: "attractions", query: "top tourist attractions", townKey: "todo", icon: "🎡" },
  "restaurants": { label: "Restaurants", singular: "restaurant", gateCat: "food", query: "best restaurants", townKey: "food", icon: "🍽️" },
  "beaches": { label: "Beaches", singular: "beach", gateCat: "beach", query: "best beaches", townKey: "beach", icon: "🏖️" },
  "nightlife": { label: "Nightlife", singular: "bar or night spot", gateCat: "nightlife", query: "best bars and nightlife", townKey: "night", icon: "🍸" },
};

// Home markets first (launch prompt 5); v5.04 adds the Hawaii markets.
//
// v8.99 (2026-09-06) — MOVED to lib/landingCities.js, imported above (as a
// real local binding — see that import's own comment for why) and
// re-exported here unchanged, so every existing import of LANDING_CITIES out
// of this file (lib/landing.js) keeps working exactly as before.
//
// DO NOT write the word "from" immediately followed by a quoted relative
// path anywhere in THIS FILE's comments, this one included. scripts/lib/
// jsxLoad.mjs rewrites local imports by regex over raw TEXT, comments and
// all, with no notion of "this is inside a comment" — that exact five-
// character keyword plus a quoted dot-relative path, wherever it appears,
// reads as a real import to it. A comment once spelled out that pattern
// naming this very file as the target, which made jsxLoad resolve the
// relative path straight back to lib/landing.js itself and recurse on it
// forever: RangeError: Maximum call stack size exceeded, straight out of
// scripts/check-rail-compute-budget.mjs (2026-09-06). This file is
// "Server-only by design" (see the header above) and app/components/
// DaypartRail.js ("use client") needs exactly this table, with none of the
// React this file pulls in at module scope. See that file's "WHY THE CITY IS
// RESOLVED HERE" comment and lib/landingCities.js's own header.
// scripts/check-rails-geo-grid.mjs asserts this stays imported-then-re-exported
// from that file, not a second literal copy that could drift from the one the
// client reads.
export { LANDING_CITIES };

// EVERGREEN LANDING CITIES (2026-09-30) — landing-page-only towns, published
// per category (lib/evergreenCities.js explains why they are NOT in
// LANDING_CITIES: rails, photo-warm and the other crons walk that table).
// Everything below resolves a (cat, city) pair to its row through ONE
// function so a withheld pair can never half-render.
//
// Returns { city, evergreen } or null. A LANDING_CITIES slug always wins and
// behaves exactly as it did before this existed.
export function landingPair(catSlug, citySlug) {
  if (!LANDING_CATS[catSlug]) return null;
  if (Object.prototype.hasOwnProperty.call(LANDING_CITIES, citySlug)) return { city: LANDING_CITIES[citySlug], evergreen: false };
  const ev = evergreenCityFor(catSlug, citySlug);
  return ev ? { city: ev, evergreen: true } : null;
}

/** generateStaticParams for /{catSlug}/[city]: every LANDING_CITIES slug plus the published evergreen ones. */
export function landingCityParams(catSlug) {
  return [...Object.keys(LANDING_CITIES), ...evergreenSlugsFor(catSlug)].map((city) => ({ city }));
}

/** Every published landing URL path (sitemap). */
export function landingPaths() {
  return Object.keys(LANDING_CATS).flatMap((cat) => landingCityParams(cat).map(({ city }) => `/${cat}/${city}`));
}

// The ranking entry point for landing PAGES. A LANDING_CITIES slug keeps
// rankedFor() byte-for-byte (its optional runtime fallback included). An
// evergreen pair is INVENTORY-ONLY, always: an empty or cold cell renders the
// honest thin-market copy, it never turns a reader view or an ISR regen into
// a Places Text Search or a nightlife census. `opts` is for guards
// (inventoryRows / serveFromInventory); routes never pass it.
// The same "tight" radius the inventory read starts from (27359 m = 17.0 mi).
export const EVERGREEN_MAX_MI = 27359 / 1609.34;
export async function landingRanked(catSlug, citySlug, opts) {
  const pair = landingPair(catSlug, citySlug);
  if (!pair) return null;
  if (!pair.evergreen) return rankedFor(catSlug, citySlug, opts);
  return rankedForCenter(catSlug, pair.city, { ...(opts || {}), inventoryOnly: true, maxMi: EVERGREEN_MAX_MI }, citySlug);
}

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
    const r = await fetchDeadline(`${s.url}/rest/v1/wf_places_cache?k=eq.${encodeURIComponent(ck)}&select=v,exp`, { headers: { apikey: s.k, Authorization: `Bearer ${s.k}` }, next: { revalidate: 86400 } });
    if (!r.ok) return null;
    return (await r.json())[0] || null;
  } catch { return null; }
}
async function _cachePut(ck, v) {
  const s = _sb(); if (!s) return;
  try {
    await fetchDeadline(`${s.url}/rest/v1/wf_places_cache`, { method: "POST", headers: { apikey: s.k, Authorization: `Bearer ${s.k}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ k: ck, v, exp: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() }) }, DB_DEADLINE_MS); // v6.09: 30d = ToS max (cost fix)
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
  // SSG / next build: never wait on Places. Cache miss → empty, not a 60s hang.
  if (isSsgBuild()) return row && Array.isArray(row.v) ? row.v : null;
  const live = await _searchGoogle(query, city, radiusM, withCityName, key, withPhotos);
  if (live !== null) { await _cachePut(ck, live); return live; }
  return row && Array.isArray(row.v) ? row.v : null; // 429/down: serve stale
}

async function _searchGoogle(query, city, radiusM, withCityName, key, withPhotos) {
  if (isSsgBuild() || !key) return null;
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
    // COST GUARD (2026-09-04): this searchText call reached Google with NO gate
    // and NO ledger — found by check-spend-guard once its file list became a
    // DISCOVERY instead of a hardcoded array. The mask carries rating /
    // userRatingCount / priceLevel, so it bills at the Enterprise tier.
    // 2026-09-16: a DENIED grant returns null, not []. searchOnce() treats
    // `live !== null` as an answer and caches it for 30 days, so a denial
    // (gate shut, free budget spent) used to write an EMPTY list over the
    // city's organic page for a month. null means "no answer today": the
    // stale row is served if there is one, nothing is written, and the next
    // request after the ledger resets asks Google once.
    // 2026-09-30: the grant is text_enterprise, not text_pro. The comment above
    // always said this mask bills Enterprise ($35/1k, 1,000 free) — the ledger
    // was debiting the Pro row (4,800 free) instead, so every organic/paid
    // landing miss read as free-tier spend while Google billed it Enterprise.
    // Same row and operator ceiling as /api/places/search's rich path; absent
    // GOOGLE_TEXT_ENTERPRISE_MONTH_CAP = denied = stale row served (see above).
    if (gateShut() || !(await spendAllowCapped("text_enterprise", textEnterpriseCap()))) return null;
    const r = await fetchDeadline("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json", "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": mask,
      },
      body: JSON.stringify({ textQuery: withCityName ? query + " " + city.name + " " + city.state : query, maxResultCount: 20, locationBias: { circle: { center: { latitude: city.lat, longitude: city.lng }, radius: Math.min(radiusM, 50000) } } }),
      next: { revalidate: 86400 },
    }, NET_DEADLINE_MS);
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
  if (!key || isSsgBuild()) return row && Array.isArray(row.v) ? row.v : null;
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

// Identity, then the ONE landing ranker. Shared by inventory-first and the
// runtime Places fallback so a library row and a searchText row cannot
// disagree about score. Affiliate/payout never enter.
async function rankLandingPool(catSlug, cat, city, rawPool) {
  const { chipIdentity } = await import("./chipIdentity.js");
  // Nightlife's primary owned inventory must use the same strict venue
  // eligibility as its census fallback. Apply it before the generic chip gate:
  // restaurant-primary live-music rooms are legitimate nightlife even when
  // chipIdentity does not recognize them, while wine-bar amenity tags are not.
  const eligiblePool = catSlug === "nightlife"
    ? nightlifeLandingEligible(rawPool)
    : (rawPool || []);
  let pool = eligiblePool.filter((p) => {
    if (!p || !p.name) return false;
    // Exact place_id registry (lib/notPublicPlaces.js): a place that is not
    // open to the public is on NO landing list, curated-name bypass included.
    if (isNotPublicPlace(p)) return false;
    if (catSlug === "nightlife") return floorOk(p);
    if (CURATED_NAMES.has(_nn(p.name))) return floorOk(p);
    return landingIdentityOk(catSlug, p, chipIdentity) && floorOk(p);
  });
  for (const p of pool) {
    if (p.distMi == null && p.lat != null && p.lng != null) {
      p.distMi = distMi(city.lat, city.lng, p.lat, p.lng);
    }
  }
  if (!pool.length) return [];
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

// Ranked, gated list for one city+category. 17-mi default, widens once to
// 30 mi if a small market comes back thin — same honesty rule as the app.
//
// Lane B (2026-09-06) — this is the COMPATIBILITY WRAPPER. The ranking path
// itself lives in rankedForCenter below and is keyed on a CENTRE
// ({name,state,lat,lng}), not on a LANDING_CITIES slug, so a non-indexed
// drive-source centre (lib/driveSourceCenters.js) can be ranked through the
// exact same governed path — same inventory read, same cache, same score,
// same gates — without becoming a landing city. Every existing caller keeps
// this signature and gets byte-identical results: the slug resolves to the
// same row it always did, and `null` for an unknown slug is unchanged.
export async function rankedFor(catSlug, citySlug, opts) {
  const city = LANDING_CITIES[citySlug];
  if (!city) return null;
  return rankedForCenter(catSlug, city, opts, citySlug);
}

/**
 * The centre-aware ranking path. `center` is any {name,state,lat,lng} row —
 * a LANDING_CITIES entry or a DRIVE_SOURCE_CENTERS entry. `citySlug` is
 * only consulted by the nightlife district census (DISTRICTS_BY_CITY is
 * keyed by landing slug); a drive-source centre passes none and therefore
 * never enters the census branch. Nothing in here knows whether the centre
 * is indexed; publication is LANDING_CITIES' concern, not ranking's.
 */
export async function rankedForCenter(catSlug, center, opts, citySlug) {
  const cat = LANDING_CATS[catSlug], city = center;
  if (!cat || !city) return null;
  // OWNED LIBRARY FIRST — same identity-before-rank rule home chips got in
  // #955. If wf_inventory returns rows, searchText is not called. During
  // `next build` a miss renders the editorial shell (empty list), never a
  // 60s Places hang. Ranking is never for sale.
  const invAll = await fetchLandingInventory(catSlug, city, opts);
  // opts.maxMi (evergreen landing pairs only; no other caller sets it): the
  // inventory read is a lat/lng BOX, whose corners reach ~1.4x the radius — so a
  // venue in the next metro (an escape room in Jacksonville, 18 mi up the road)
  // could rank #1 on a St. Augustine page. Clamp to true haversine miles.
  const maxMi = opts && Number.isFinite(opts.maxMi) ? opts.maxMi : null;
  const inv = maxMi == null ? invAll : invAll.filter((p) => p.lat == null || p.lng == null || distMi(city.lat, city.lng, p.lat, p.lng) <= maxMi);
  if (inv.length) {
    return rankLandingPool(catSlug, cat, city, inv, opts);
  }
  // Reader-facing rails are latency-bounded owned-inventory products. A cold
  // or thin cell must never turn a page request into live Google discovery;
  // scouting and promotion own that asynchronous work. Landing pages retain
  // their existing optional runtime fallback unless they opt into this flag.
  if (opts && opts.inventoryOnly === true) return [];
  if (placesCallsForbidden({ inventoryCount: inv.length, build: isSsgBuild() })) {
    return [];
  }
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
    // No answer this round (no key / upstream down / ledger denied). Round 1
    // with nothing: the page renders without the list. A WIDENING round with
    // nothing must not discard what round 1 already found — with the
    // Enterprise ceiling absent (blocking mode, PR #1582) round 2 is denied on
    // every cold cell, and a thin stale cached list used to vanish here
    // (scripts/test-enterprise-search-blocking.mjs, fallback 4b).
    if (raw === null) {
      if (pool && pool.length) break;
      return null;
    }
    const gated = raw.filter((p) => (CURATED_NAMES.has(_nn(p.name)) || placeAllowed(cat.gateCat, null, p)) && floorOk(p));
    gated.forEach((p) => { p.distMi = (p.lat != null && p.lng != null) ? distMi(city.lat, city.lng, p.lat, p.lng) : null; });
    const round = gated.filter((p) => p.distMi == null || p.distMi <= (radiusM / 1609.34) * 1.3);
    // Merge rounds (round-1 town results stay in the pool) and dedupe by id.
    const seen = new Set((pool || []).map((p) => p.id));
    pool = [...(pool || []), ...round.filter((p) => !seen.has(p.id))];
    if (pool.length >= 8) break;
  }
  if (!pool || !pool.length) return [];
  return rankLandingPool(catSlug, cat, city, pool);
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

// SEO recovery (2026-09-23) — low-CTR fix. High impressions, near-zero
// clicks (e.g. /restaurants/sarasota: 2,963 impr / 1 click) traced to a title
// that buried the ranking claim after an em dash and a description that
// named no real places. Now async: it reuses rankedFor() — the SAME
// Supabase-cached search the page itself calls (see the cache note above,
// searchOnce/_cacheRow) — to name real top picks when they're already warm.
// No new Google call: a cache miss just returns null/[] and the generic,
// still-honest description below is used instead. Fail-soft end to end.
export async function landingMetadata(catSlug, citySlug) {
  const pair = landingPair(catSlug, citySlug);
  const cat = LANDING_CATS[catSlug], city = pair && pair.city;
  if (!cat || !city) return { title: "Not found" };
  const url = `${SITE_URL}/${catSlug}/${citySlug}`;
  // Title keeps the exact `Best ${cat.label} in ${city.name}, ${city.state}`
  // lead-in scripts/test-ranking-editorial.mjs asserts against the H1 — only
  // the trailing claim changed (em dash -> "|", no public-copy dash).
  const title = `Best ${cat.label} in ${city.name}, ${city.state} (${new Date().getFullYear()}) | Real Reviews`;
  const genericDescription = `The best ${cat.label.toLowerCase()} in ${city.name}, ${city.state}, ranked by rating and review volume with no ads and no paid placement. Live, honest picks from Wayfind.`;
  let description = genericDescription;
  try {
    // inventoryOnly: metadata must never be the thing that triggers a live
    // Places searchText on a cold cell; owned wf_inventory rows only.
    const ranked = await landingRanked(catSlug, citySlug, { inventoryOnly: true });
    const names = (Array.isArray(ranked) ? ranked : []).slice(0, 3).map((p) => p && p.name).filter(Boolean);
    if (names.length) {
      const withNames = `Best ${cat.label.toLowerCase()} in ${city.name}, ${city.state}, ranked by rating and review volume, no ads, no paid placement: ${names.join(", ")} lead the list.`;
      // Real names only make it in when the line still clears the 155-char
      // budget — a long venue name never gets to push the page over it.
      if (withNames.length <= 155) description = withNames;
    }
  } catch (e) { /* fail-soft: keep the generic, still-accurate description */ }
  return { title, description, alternates: { canonical: url }, ...socialMeta({ title, description, url }) };
}
