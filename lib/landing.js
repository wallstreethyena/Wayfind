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
import { CURATED } from "./curated";
import { CULTURE, TOWN_PROFILES, TOWN_ALIASES, resolveMetro } from "./culture";
import { SITE_URL } from "./site";
import { socialMeta } from "./socialMeta";
import { getInsider } from "./insiderServer";
import TourStrip from "../app/components/TourStrip";

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

async function searchOnce(query, city, radiusM, withCityName) {
  const key = (process.env.GOOGLE_MAPS_SERVER_KEY || "").trim();
  const ck = "wfl1|" + [query, city.name, city.state, Math.round(radiusM), withCityName ? 1 : 0].join("|").toLowerCase().replace(/\s+/g, " ");
  const row = await _cacheRow(ck);
  if (row && Array.isArray(row.v) && new Date(row.exp).getTime() > Date.now()) return row.v;
  if (!key) return row && Array.isArray(row.v) ? row.v : null; // stale beats nothing
  const live = await _searchGoogle(query, city, radiusM, withCityName, key);
  if (live !== null) { await _cachePut(ck, live); return live; }
  return row && Array.isArray(row.v) ? row.v : null; // 429/down: serve stale
}

async function _searchGoogle(query, city, radiusM, withCityName, key) {
  try {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json", "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.formattedAddress,places.types,places.businessStatus,places.priceLevel",
      },
      body: JSON.stringify({ textQuery: withCityName ? query + " " + city.name + " " + city.state : query, maxResultCount: 20, locationBias: { circle: { center: { latitude: city.lat, longitude: city.lng }, radius: Math.min(radiusM, 50000) } } }),
      next: { revalidate: 86400 },
    });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.places || []).map((p) => ({
      id: p.id, name: p.displayName && p.displayName.text,
      rating: p.rating != null ? p.rating : null, reviews: p.userRatingCount || 0,
      address: p.formattedAddress || "", types: p.types || [], status: p.businessStatus || null,
      lat: p.location && p.location.latitude, lng: p.location && p.location.longitude,
      priceLevel: p.priceLevel || null,
    })).filter((p) => p.name);
  } catch (e) { return null; }
}

// Ranked, gated list for one city+category. 17-mi default, widens once to
// 30 mi if a small market comes back thin — same honesty rule as the app.
export async function rankedFor(catSlug, citySlug) {
  const cat = LANDING_CATS[catSlug], city = LANDING_CITIES[citySlug];
  if (!cat || !city) return null;
  let pool = null;
  // Round 1 names the city in the text query (tight, town-proper results).
  // The widening round DROPS the city name and trusts the location bias —
  // "top tourist attractions Parrish FL" pins Google to the town itself and
  // returned 2 results for a town Wayfind's app fills with 20+ nearby.
  for (const [radiusM, withCityName] of [[27359, true], [48280, false]]) {
    const raw = await searchOnce(cat.query, city, radiusM, withCityName);
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
  pool.forEach((p) => { const mi = p.distMi || 0; p._s = wfScore(p.rating, p.reviews) - (mi <= 4 ? 0 : Math.min(30, (mi - 4) * 1.3)) + (CURATED_NAMES.has(_nn(p.name)) ? 15 : 0); });
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
  page: { maxWidth: 760, margin: "0 auto", padding: "28px 18px 60px", background: "#0D1117", color: "#E6EDF3", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", lineHeight: 1.6 },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#F97316" },
  h1: { fontSize: 30, lineHeight: 1.2, margin: "10px 0 8px", fontWeight: 800, color: "#FFFFFF" },
  sub: { fontSize: 16, color: "#8B949E", marginBottom: 8 },
  h2: { fontSize: 21, fontWeight: 800, color: "#FFFFFF", margin: "26px 0 10px" },
  card: { margin: "0 0 14px", padding: "13px 16px", background: "#161B22", borderRadius: 12 },
  name: { fontSize: 17, fontWeight: 800, color: "#FFFFFF", margin: 0 },
  why: { fontSize: 14.5, color: "#C9D1D9", margin: "3px 0 0" },
  addr: { fontSize: 12.5, color: "#8B949E", margin: "4px 0 0" },
  cta: { display: "inline-block", marginTop: 18, padding: "12px 22px", borderRadius: 999, background: "#F97316", color: "#0D1117", fontWeight: 800, fontSize: 15, textDecoration: "none" },
  link: { color: "#F97316", textDecoration: "none", fontWeight: 700 },
  note: { fontSize: 12, color: "#8B949E", margin: "18px 0 0", padding: "10px 14px", background: "#161B22", borderRadius: 10 },
};

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
  const eds = await landingEditorials(list.map((p) => p.id).filter(Boolean));
  const culture = metro && CULTURE[metro] ? CULTURE[metro] : null;
  const profLine = prof && prof[cat.townKey] && prof[cat.townKey].line;
  const ld = [];
  ld.push({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "Wayfind", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: cat.label, item: `${SITE_URL}/${catSlug}/${citySlug}` },
    { "@type": "ListItem", position: 3, name: city.name + ", " + city.state, item: url },
  ] });
  if (list && list.length) {
    ld.push({ "@context": "https://schema.org", "@type": "ItemList", name: `Best ${cat.label} in ${city.name}, ${city.state}`, numberOfItems: list.length, itemListElement: list.map((p, i) => ({ "@type": "ListItem", position: i + 1, item: { "@type": "LocalBusiness", name: p.name, address: p.address || undefined, geo: p.lat != null ? { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng } : undefined, aggregateRating: p.rating != null && p.reviews >= 15 ? { "@type": "AggregateRating", ratingValue: p.rating, reviewCount: p.reviews } : undefined } })) });
    ld.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [
      { "@type": "Question", name: `What is the best ${cat.singular} in ${city.name}, ${city.state}?`, acceptedAnswer: { "@type": "Answer", text: `${list[0].name} currently ranks #1${list[0].rating != null ? ` with a ${list[0].rating}★ rating across ${(list[0].reviews || 0).toLocaleString()} reviews` : ""}, based on Wayfind's merit-only ranking (rating, review volume, and proximity — no ads, no paid placement).` } },
      { "@type": "Question", name: `What are the top 5 ${cat.label.toLowerCase()} in ${city.name}?`, acceptedAnswer: { "@type": "Answer", text: list.slice(0, 5).map((p, i) => `${i + 1}. ${p.name}`).join(" ") } },
    ] });
  }
  return (
    <main style={S.page}>
      {ld.map((x, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(x) }} />)}
      <div style={S.kicker}>{cat.icon} Ranked by real reviews · No ads · No paid placement</div>
      <h1 style={S.h1}>Best {cat.label} in {city.name}, {city.state}</h1>
      <p style={S.sub}>Ranked by rating weighted by review volume, then proximity — the same merit-only engine that powers the Wayfind app. Updated daily.</p>
      {profLine ? <p style={{ fontSize: 15, color: "#C9D1D9" }}><b style={{ color: "#FFFFFF" }}>{city.name} in one line:</b> {profLine}</p> : null}
      {prof && prof.one ? <p style={{ fontSize: 14, color: "#C9D1D9" }}><b style={{ color: "#F2C14E" }}>⭐ The one thing to know:</b> {prof.one}</p> : null}
      {list === null ? (
        <p style={{ fontSize: 15, color: "#C9D1D9" }}>Live rankings are loading — open <a href="/" style={S.link}>Wayfind</a> for the current list near you.</p>
      ) : list.length === 0 ? (
        <p style={{ fontSize: 15, color: "#C9D1D9" }}>{city.name} is a thin market for {cat.label.toLowerCase()} — <a href="/" style={S.link}>Wayfind</a> widens the search honestly and labels every distance.</p>
      ) : (
        <>
          <h2 style={S.h2}>The ranked list</h2>
          {list.map((p, i) => (
            <div key={p.id || i} style={S.card}>
              <p style={S.name}>{i + 1}. {p.name}</p>
              {eds[p.id] && eds[p.id].hook ? <p style={{ fontSize: 14.5, fontWeight: 700, color: "#E8C97A", margin: "2px 0 4px", lineHeight: 1.4 }}>{eds[p.id].hook}</p> : null}
              <p style={S.why}>{eds[p.id] && eds[p.id].why_here ? eds[p.id].why_here : whyLine(p, cat.singular)}</p>
              {(() => { const tip = (eds[p.id] && eds[p.id].local_tip) || (insiderByIdx[i] && (insiderByIdx[i].tip || insiderByIdx[i].special)); return tip ? <p style={{ fontSize: 13.5, color: "#E6EDF3", margin: "6px 0 0", lineHeight: 1.5 }}>🗝️ <b>Insider:</b> {tip}</p> : null; })()}
              {p.address ? <p style={S.addr}>{p.address}</p> : null}
            </div>
          ))}
        </>
      )}
      {catSlug === "things-to-do" ? <TourStrip lat={city.lat} lng={city.lng} title={"Book an experience in " + city.name} subtitle="Bookable, top-reviewed things to do nearby — ranked by the same Wayfind Score." /> : null}
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
    </main>
  );
}
