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
import { placeAllowed } from "./placeFilter";
import { localCategoryBoost } from "./localCategorySignals";
import { marketReviewFloor, passesMarketFloor } from "./marketFloor";
import { groupByContainment, childrenLabel } from "./venueContainment";
import { CURATED } from "./curated";
import { CULTURE, TOWN_PROFILES, TOWN_ALIASES, resolveMetro } from "./culture";
import { SITE_URL } from "./site";
import { socialMeta } from "./socialMeta";
import { getInsider } from "./insiderServer";
import TourStrip from "../app/components/TourStrip";
import PremiumIntentHero from "../app/components/PremiumIntentHero";
import { TRENDING_POPULARITY_THRESHOLD } from "../app/components/kit";

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
// Same Bayesian blend the app ranks with (m=60, C=3.9) + distance penalty.
const wfScore = (r, n) => (((n || 0) / ((n || 0) + 60)) * (r || 0) + (60 / ((n || 0) + 60)) * 3.9) * 10;
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

// Ranked, gated list for one city+category. 17-mi default, widens once to
// 30 mi if a small market comes back thin — same honesty rule as the app.
export async function rankedFor(catSlug, citySlug, opts) {
  const cat = LANDING_CATS[catSlug], city = LANDING_CITIES[citySlug];
  if (!cat || !city) return null;
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
  // localCategoryBoost: a bounded (<=8pt) nudge for destination ARCHETYPES a
  // city is known for — springs, airboats, museum clusters, performing arts.
  // It never names a business, so it cannot function as paid placement; it
  // only reorders near-ties. See lib/localCategorySignals.js for sources.
  pool.forEach((p) => { const mi = p.distMi || 0; p._s = wfScore(p.rating, p.reviews) - (mi <= 4 ? 0 : Math.min(30, (mi - 4) * 1.3)) + (CURATED_NAMES.has(_nn(p.name)) ? 15 : 0) + localCategoryBoost(p); });
  pool.sort((a, b) => (b._s - a._s) || ((b.reviews || 0) - (a.reviews || 0)));
  return pool.slice(0, 15);
}

// Honest one-line "why", built only from the place's own stats.
export function whyLine(p, singular) {
  const bits = [];
  if (p.rating != null && p.reviews >= 500) bits.push(`${p.rating}★ across ${p.reviews.toLocaleString()} reviews — a proven local favorite`);
  else if (p.rating != null && p.reviews >= 15) bits.push(`${p.rating}★ from ${p.reviews.toLocaleString()} reviews`);
  else bits.push(`a true local ${singular}`);
  if (p.distMi != null) bits.push(`${p.distMi.toFixed(1)} mi from the town center`);
  return bits.join(" · ") + ".";
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
  page: { maxWidth: 1080, margin: "0 auto", padding: "0 18px 72px", background: "#050B14", color: "#E6EDF3", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", lineHeight: 1.6 },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#F97316" },
  h1: { fontSize: 30, lineHeight: 1.2, margin: "10px 0 8px", fontWeight: 800, color: "#FFFFFF" },
  sub: { fontSize: 16, color: "#8B949E", marginBottom: 8 },
  h2: { fontSize: 21, fontWeight: 800, color: "#FFFFFF", margin: "26px 0 10px" },
  card: { margin: "0 0 16px", padding: "18px", background: "linear-gradient(145deg,#101C2B,#0A1421)", border: "1px solid #26384B", borderRadius: 22, boxShadow: "0 18px 45px rgba(0,0,0,.22)" },
  name: { fontSize: 17, fontWeight: 800, color: "#FFFFFF", margin: 0 },
  why: { fontSize: 14.5, color: "#C9D1D9", margin: "3px 0 0" },
  addr: { fontSize: 12.5, color: "#8B949E", margin: "4px 0 0" },
  cta: { display: "inline-block", marginTop: 18, padding: "12px 22px", borderRadius: 999, background: "#F97316", color: "#0D1117", fontWeight: 800, fontSize: 15, textDecoration: "none" },
  link: { color: "#F97316", textDecoration: "none", fontWeight: 700 },
  note: { fontSize: 12, color: "#8B949E", margin: "18px 0 0", padding: "10px 14px", background: "#161B22", borderRadius: 10 },
};

const LANDING_HERO = {
  "things-to-do": "/brand/orlando-roller-coaster-portrait.jpg",
  restaurants: "/cards/date-night-dining-hero.jpg",
  nightlife: "/cards/night-out.jpg",
  beaches: "/cards/beach-adobestock-216195684.jpeg",
};
const landingPhoto = (p, catSlug) => p && p.photoRef
  ? "/api/photo?ref=" + encodeURIComponent(p.photoRef) + "&w=1200"
  : LANDING_HERO[catSlug];

// v6.61 (owner build order #5): the ranking ROWS consume the editorial too.
// One anon in() call for the verified Wayfind cards; where one exists we render
// hook + why_here + local_tip and DROP the Google-number sentence (honesty).
async function landingEditorials(ids) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anon || !ids.length) return {};
  try {
    const r = await fetch(url + "/rest/v1/wf_editorial?verified=is.true&select=place_id,hook,why_here,local_tip&place_id=in.(" + ids.map(encodeURIComponent).join(",") + ")", { headers: { apikey: anon, Authorization: "Bearer " + anon }, next: { revalidate: 3600 } });
    if (!r.ok) return {};
    const rows = await r.json();
    const out = {};
    for (const e of Array.isArray(rows) ? rows : []) out[e.place_id] = e;
    return out;
  } catch (e) { return {}; }
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
  const eds = await landingEditorials((list || []).map((p) => p.id).filter(Boolean));
  const beachSignals = catSlug === "beaches" ? await landingBeachSignals((list || []).map((p) => p.id).filter(Boolean)) : {};
  const culture = metro && CULTURE[metro] ? CULTURE[metro] : null;
  const profLine = prof && prof[cat.townKey] && prof[cat.townKey].line;
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
      <PremiumIntentHero
        eyebrow={`${cat.icon} Your ${cat.label.toLowerCase()} compass`}
        location={`${city.name}, ${city.state}`}
        title={`The best ${cat.label.toLowerCase()}—without the endless search.`}
        description={`Wayfind turns “${cat.query} in ${city.name}” into a small, confident shortlist. Every choice earns its place through real reviews, distance, and what it is genuinely best for.`}
        image={LANDING_HERO[catSlug]}
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
      {profLine ? <p style={{ fontSize: 15, color: "#C9D1D9", padding: "15px 18px", borderRadius: 16, background: "#0D1724", border: "1px solid #203044" }}><b style={{ color: "#FF8A3D" }}>{city.name}, decoded:</b> {profLine}</p> : null}
      {prof && prof.one ? <p style={{ fontSize: 14, color: "#C9D1D9", padding: "15px 18px", borderRadius: 16, background: "#0D1724", border: "1px solid #203044" }}><b style={{ color: "#E8C97A" }}>The one thing to know:</b> {prof.one}</p> : null}
      {list === null ? (
        <p style={{ fontSize: 15, color: "#C9D1D9" }}>Live rankings are loading — open <a href="/" style={S.link}>Wayfind</a> for the current list near you.</p>
      ) : list.length === 0 ? (
        <p style={{ fontSize: 15, color: "#C9D1D9" }}>{city.name} is a thin market for {cat.label.toLowerCase()} — <a href="/" style={S.link}>Wayfind</a> widens the search honestly and labels every distance.</p>
      ) : (
        <>
          <h2 style={S.h2}>The ranked list</h2>
          {topLevel.map(({ place: p, children }, i) => (
            <div key={p.id || i} style={S.card}>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 260px", minHeight: 230, borderRadius: 16, overflow: "hidden", background: "#172536" }}>
                <img src={landingPhoto(p, catSlug)} alt="" style={{ width: "100%", height: "100%", minHeight: 230, display: "block", objectFit: "cover" }} />
              </div>
              <div style={{ flex: "1.65 1 380px", minWidth: 0 }}>
              <div style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: "1.7px", textTransform: "uppercase", color: "#FF8A3D" }}>{i === 0 ? "Best match" : `Alternative ${String(i).padStart(2, "0")}`}</div>
                  <p style={{ ...S.name, marginTop: 5, fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 28, lineHeight: 1.08 }}>{p.name}</p>
                </div>
                <div style={{ minWidth: 58, padding: "9px 8px", borderRadius: 14, background: "#F7F1E7", color: "#0D1724", textAlign: "center", fontWeight: 900, lineHeight: 1 }}>{p.rating != null ? p.rating : "—"}<div style={{ marginTop: 5, fontSize: 7.5, letterSpacing: "1.2px" }}>WAYFIND</div></div>
              </div>
              {(() => {
                const sig = beachSignals[p.id];
                if (!sig) return null;
                const wq = sig.water ? (sig.water.advisory ? { t: "Advisory — check before swimming", c: "#EF4444" } : sig.water.result === "Good" ? { t: "Water quality: Good", c: "#22C55E" } : sig.water.result === "Moderate" ? { t: "Water quality: Moderate", c: "#E8B84B" } : sig.water.result ? { t: "Water quality: Poor", c: "#EF4444" } : null) : null;
                const trending = sig.popularityPct != null && sig.popularityPct >= TRENDING_POPULARITY_THRESHOLD;
                if (!wq && !trending) return null;
                return (
                  <p style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 13, fontWeight: 700, margin: "4px 0 0" }}>
                    {trending ? <span style={{ color: "#FB923C" }}>🔥 Popular</span> : null}
                    {wq ? <span style={{ color: wq.c }}>🏖️ {wq.t}</span> : null}
                  </p>
                );
              })()}
              {eds[p.id] && eds[p.id].hook ? <p style={{ fontSize: 14.5, fontWeight: 700, color: "#E8C97A", margin: "2px 0 4px", lineHeight: 1.4 }}>{eds[p.id].hook}</p> : null}
              <div style={{ borderLeft: "3px solid #FF7A1A", paddingLeft: 14, marginTop: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "1.7px", textTransform: "uppercase", color: "#8797AA" }}>Why it fits</div>
                <p style={{ ...S.why, fontSize: 15, marginTop: 5 }}>{eds[p.id] && eds[p.id].why_here ? eds[p.id].why_here : whyLine(p, cat.singular)}</p>
              </div>
              {(() => { const tip = (eds[p.id] && eds[p.id].local_tip) || (insiderByIdx[i] && (insiderByIdx[i].tip || insiderByIdx[i].special)); return tip ? <p style={{ fontSize: 13.5, color: "#E6EDF3", margin: "6px 0 0", lineHeight: 1.5 }}>🗝️ <b>Insider:</b> {tip}</p> : null; })()}
              {p.address ? <p style={S.addr}>{p.address}</p> : null}
              {catSlug === "restaurants" ? (() => {
                // Order In, the exact-store contract (/api/eats/go 302s into the
                // restaurant's real Uber Eats page, or an honest tracked search on
                // any resolution failure). Restaurants get an ordering path rather
                // than a tours strip — see the CTA note below the list.
                const q = new URLSearchParams({ name: p.name || "", city: city.name || "" });
                if (p.lat != null) q.set("lat", String(p.lat));
                if (p.lng != null) q.set("lng", String(p.lng));
                return (
                  <a href={"/api/eats/go?" + q.toString()} target="_blank" rel="noreferrer nofollow sponsored"
                    style={{ display: "inline-block", marginTop: 8, fontSize: 12.5, fontWeight: 800, color: "#06C167", textDecoration: "none" }}>
                    Order on Uber Eats ↗
                  </a>
                );
              })() : null}
              {children && children.length ? (
                <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid #21262D" }}>
                  <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", color: "#8B949E", margin: "0 0 7px" }}>
                    {childrenLabel(p, children)}
                  </p>
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                    {children.map((c) => (
                      <span key={c.id || c.name} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#0D1117", border: "1px solid #21262D", borderRadius: 999, padding: "5px 10px", fontSize: 12.5, color: "#C9D1D9" }}>
                        {c.name}
                        {c.rating != null ? <span style={{ color: "#F2C14E", fontWeight: 700 }}>{c.rating}\u2605</span> : null}
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
      </section>
    </main>
  );
}
