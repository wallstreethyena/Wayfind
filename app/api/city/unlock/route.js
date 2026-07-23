// app/api/city/unlock/route.js — the on-demand city fetch (spec STEP 3 #10). A
// SIGNED-IN user tapped "Unlock {city}" in an uncovered area; this pulls Google
// Places for that city into wf_inventory. The moment inventory lands near the
// coords, wf_gate_status flips to 'live' (it checks for a fresh wf_inventory row
// within 75mi), so the whole app populates — the feed, and the experiences rail
// which already live-fetches Viator for uncovered cities (#317/#318).
//
// Guarded: requires a valid Supabase user token (only signed-in users trigger
// the paid Google calls), skips if the city is already covered, and is bounded
// (a fixed set of category searches, capped inserts). Same-origin guarded in
// middleware. Fail-soft: never throws to the client. Needs GOOGLE_MAPS_SERVER_KEY
// + the Supabase service env; verified against a real unlock.
import { sbEnv } from "../../../../lib/serverCache";
import { pullViatorCityRows } from "../../../../lib/viatorIngest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Global hourly cost cap: with any location (signed in or not) able to trigger a
// pull, this bounds how many NEW cities we ingest per hour so a burst of
// coordinates can never run up the Google/Viator bill. Per-city 90-day dedup
// (below) keeps steady-state cost to one pull per place.
const HOURLY_CAP = 80;
const EXP_FRESH_DAYS = 90;

const FIELD_MASK = ["places.id", "places.displayName", "places.location", "places.rating", "places.userRatingCount", "places.types", "places.businessStatus"].join(",");
// Category searches that establish coverage for a new city (query → app category).
const PULLS = [
  { q: "best restaurants", cat: "food" },
  { q: "things to do and attractions", cat: "attractions" },
  { q: "coffee shops and cafes", cat: "food" },
  { q: "bars and breweries", cat: "nightlife" },
  { q: "parks and outdoor spots", cat: "attractions" },
  { q: "top rated hotels", cat: "hotels" },
];
const MAX_INSERT = 90;
const SERVICE_TYPE = /gas_station|^atm$|parking|storage|car_repair|car_wash|electrician|plumber|lawyer|insurance_agency|finance|real_estate_agency|moving_company|post_office/;

const slugify = (s, lat, lng) => (String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)) || ("city-" + lat.toFixed(2) + "-" + lng.toFixed(2));

async function pool(items, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, async () => { while (i < items.length) { const j = i++; await fn(items[j]); } }));
}

// Flip the freshest matching wf_city_requests rows (same ~35mi box) to a status.
async function setStatus(s, h, lat, lng, status) {
  const box = 0.5;
  const q = `lat=gte.${(lat - box).toFixed(4)}&lat=lte.${(lat + box).toFixed(4)}&lng=gte.${(lng - box).toFixed(4)}&lng=lte.${(lng + box).toFixed(4)}&status=neq.live`;
  try { await fetch(`${s.url}/rest/v1/wf_city_requests?${q}`, { method: "PATCH", headers: { ...h, Prefer: "return=minimal" }, body: JSON.stringify({ status }), cache: "no-store" }); } catch (e) {}
}

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch (e) {}
  const lat = Number(body.lat), lng = Number(body.lng);
  if (!isFinite(lat) || !isFinite(lng)) return Response.json({ ok: false, error: "bad coords" }, { status: 200 });
  const s = sbEnv();
  if (!s) return Response.json({ ok: false, error: "no service env" }, { status: 200 });
  const svcH = { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json" };

  // AUTH is OPTIONAL now (owner: coverage should fill for ANY location — the
  // user's searched OR default location — signed in or not). We still read the
  // token when present (for the gate check + attribution), but a signed-out
  // visitor triggers a pull too. Cost is bounded NOT by a sign-in wall but by:
  // same-origin (middleware) + the global hourly cap + per-city 90-day dedup.
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  let userId = null;
  try {
    if (token && anon) { const ur = await fetch(`${s.url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } }); if (ur.ok) { const u = await ur.json(); userId = u && u.id; } }
  } catch (e) {}

  // Global hourly cost cap (abuse / runaway guard).
  try {
    const since = new Date(Date.now() - 3600e3).toISOString();
    const cr = await fetch(`${s.url}/rest/v1/wf_city_requests?requested_at=gte.${since}&status=in.(fetching,live)&select=id`, { headers: { ...svcH, Prefer: "count=exact", Range: "0-0" }, cache: "no-store" });
    const total = parseInt(((cr.headers.get("content-range") || "").split("/")[1] || "0"), 10);
    if (isFinite(total) && total >= HOURLY_CAP) return Response.json({ ok: false, status: "busy", error: "hourly pull cap" }, { status: 200 });
  } catch (e) {}

  // Already covered? (someone else may have unlocked it) — skip the Google spend,
  // but STILL top up experiences below if this city has none yet (a city unlocked
  // before Viator ingest existed has inventory but no "Things to do").
  let covered = false;
  try {
    const gr = await fetch(`${s.url}/rest/v1/rpc/wf_gate_status`, { method: "POST", headers: svcH, body: JSON.stringify({ p_lat: lat, p_lng: lng, p_user_id: userId }), cache: "no-store" });
    if (gr.ok && (await gr.json()) === "live") covered = true;
  } catch (e) {}

  const gkey = (process.env.GOOGLE_MAPS_SERVER_KEY || "").trim();
  await setStatus(s, svcH, lat, lng, "fetching");
  const metro = slugify(body.city, lat, lng);
  const cityNorm = String(body.city || metro).split(",")[0].trim().slice(0, 80);

  // 1) Google Places → wf_inventory (opens the gate). Skipped when already
  //    covered, or when the Google key is absent (Viator can still run below).
  const byId = new Map();
  if (!covered && gkey) {
    await pool(PULLS, 3, async (pl) => {
      try {
        const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Goog-Api-Key": gkey, "X-Goog-FieldMask": FIELD_MASK },
          body: JSON.stringify({ textQuery: pl.q, maxResultCount: 20, locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 30000 } } }),
        });
        if (!r.ok) return;
        const d = await r.json();
        for (const p of (d.places || [])) {
          if (!p || !p.id || p.businessStatus === "CLOSED") continue;
          const types = Array.isArray(p.types) ? p.types : [];
          if (types.some((t) => SERVICE_TYPE.test(t))) continue;      // skip service places
          if (!byId.has(p.id)) byId.set(p.id, { p, cat: pl.cat });     // first category wins
        }
      } catch (e) {}
    });
  }

  // 2) Insert into wf_inventory via the shared add function (sets refreshed_at=now
  //    → flips the gate to live). Bounded.
  const rows = [...byId.values()].filter(({ p }) => p.displayName && p.displayName.text && p.location).slice(0, MAX_INSERT);
  let added = 0;
  await pool(rows, 5, async ({ p, cat }) => {
    try {
      const r = await fetch(`${s.url}/rest/v1/rpc/wf_add_inventory_place`, {
        method: "POST", headers: svcH, cache: "no-store",
        body: JSON.stringify({
          p_place_id: p.id, p_name: String(p.displayName.text).slice(0, 200), p_metro: metro,
          p_category: cat, p_primary_type: (p.types && p.types[0]) || null,
          p_lat: p.location.latitude, p_lng: p.location.longitude,
          p_rating: typeof p.rating === "number" ? p.rating : null,
          p_reviews: typeof p.userRatingCount === "number" ? p.userRatingCount : 0,
          p_google_types: Array.isArray(p.types) ? p.types : [], p_source: "unlock",
        }),
      });
      if (r.ok) added += 1;
    } catch (e) {}
  });

  // 2.5) Viator experiences for THIS city (ANY destination on earth) → the
  //      "Things to do" rail + verified booking buttons (wf_place_products matches
  //      as rows land). Quality gated (>= 7.5), PERSISTED so it's table-fast and
  //      guardian-checked. Per-city 90-day dedup: skip when this city already has
  //      fresh Viator rows, so we resolve+pull at most once per city per season.
  let exp = 0;
  const vkey = (process.env.VIATOR_API_KEY || "").trim();
  if (vkey && cityNorm) {
    let expFresh = false;
    try {
      const since = new Date(Date.now() - EXP_FRESH_DAYS * 864e5).toISOString();
      const er = await fetch(`${s.url}/rest/v1/wf_experiences?provider=eq.viator&city=eq.${encodeURIComponent(cityNorm)}&refreshed_at=gte.${since}&select=product_code&limit=1`, { headers: svcH, cache: "no-store" });
      const arr = er.ok ? await er.json() : [];
      expFresh = Array.isArray(arr) && arr.length > 0;
    } catch (e) {}
    if (!expFresh) {
      try {
        const { rows: expRows } = await pullViatorCityRows(body.city || cityNorm, vkey);
        if (expRows.length) {
          const h2 = { ...svcH, Prefer: "resolution=merge-duplicates,return=minimal" };
          for (let i = 0; i < expRows.length; i += 500) {
            const chunk = expRows.slice(i, i + 500);
            const r = await fetch(`${s.url}/rest/v1/wf_experiences?on_conflict=product_code`, { method: "POST", headers: h2, body: JSON.stringify(chunk), cache: "no-store" });
            if (r.ok) exp += chunk.length; else break;
          }
        }
      } catch (e) {}
    }
  }

  // 3) Coverage established → mark the request(s) live.
  const live = covered || added > 0;
  await setStatus(s, svcH, lat, lng, live ? "live" : "fetching");
  return Response.json({ ok: live || exp > 0, status: live ? "live" : "fetching", metro, found: rows.length, added, experiences: exp }, { headers: { "Cache-Control": "no-store" } });
}
