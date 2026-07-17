// app/api/eats/check/route.js — Uber Eats presence VERIFIER (v6.42).
// Answers "is this restaurant actually on Uber Eats?" BEFORE Order In shows the
// green CTA. Reuses the exact resolver + 30-day cache KEY as /api/eats/go, so a
// verification warms the click (and vice versa) — one scrape serves both.
//
// Returns JSON, never a redirect:
//   POST { places:[{id,name,city,lat,lng}] } -> { results: { [id]: {ok,url} } }
//   GET  ?name=&city=&lat=&lng=              -> { ok, url }
// ok=false means "not confirmed" (either not on Uber Eats OR the scrape was
// blocked) — the caller treats that as "Find on Uber Eats" (a search), never a
// false promise of a specific store.
export const runtime = "nodejs";

import { cget, cset, DAY } from "../../../../lib/serverCache";

const mem = new Map(); // warm-instance: key -> { url|null, exp }
const OK_TTL = 24 * 3600 * 1000;      // confirmed store: long
const MISS_TTL = 30 * 60 * 1000;      // unconfirmed: short, so a transient block retries soon

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const searchUrl = (name, city) => "https://www.ubereats.com/search?diningMode=DELIVERY&q=" + encodeURIComponent(name + (city ? " " + city : ""));

// Same key + resolution as /api/eats/go. Returns the store URL, or null if we
// cannot confirm a store. Only CONFIRMED stores are written to the durable cache
// (a transient Uber block must never negative-cache a real store for 30 days).
async function resolveStore(name, city, lat, lng) {
  // B8: include a coarse ~1km geo bucket so two locations of the same chain in one
  // city don't collide on a single cached store (shares the key with /api/eats/go).
  const k = "eatsgo|v1|" + norm(name) + "|" + norm(city) + "|" + (isFinite(lat) ? (+lat).toFixed(2) : "") + "," + (isFinite(lng) ? (+lng).toFixed(2) : "");
  const hit = mem.get(k);
  if (hit && hit.exp > Date.now()) return hit.url;
  try {
    const c = await cget(k, { staleMs: 30 * DAY });
    if (c && typeof c.v === "string" && c.v.indexOf("/store/") > 0) { mem.set(k, { url: c.v, exp: Date.now() + OK_TTL }); return c.v; }
  } catch (e) {}
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    let su = searchUrl(name, city);
    if (isFinite(lat) && isFinite(lng)) {
      const pl = Buffer.from(JSON.stringify({ address: city || "nearby", latitude: +lat, longitude: +lng, reference: "", referenceType: "uber_places" })).toString("base64");
      su += "&pl=" + encodeURIComponent(pl);
    }
    const r = await fetch(su, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!r.ok) { mem.set(k, { url: null, exp: Date.now() + MISS_TTL }); return null; }
    const html = await r.text();
    // B1: ok=true (green "Order on Uber Eats") requires a real name-token match, not
    // just "Uber returned some store". The old `matched || first` marked ANY result
    // verified, so a restaurant not on Uber Eats could still show the confirmed CTA
    // and 302 to a different store. No token match -> null -> the card stays "Find".
    const toks = norm(name).split(" ").filter((w) => w.length >= 4);
    let matched = null;
    const re = /href="(\/store\/[^"?#]+)/g;
    let m;
    while ((m = re.exec(html))) {
      const href = m[1];
      const slug = norm(decodeURIComponent(href));
      if (toks.length && toks.some((t) => slug.indexOf(t) >= 0)) { matched = href; break; }
    }
    const best = matched;
    const url = best ? "https://www.ubereats.com" + best : null;
    mem.set(k, { url, exp: Date.now() + (url ? OK_TTL : MISS_TTL) });
    try { if (url) await cset(k, url, 30 * DAY); } catch (e) {}
    return url;
  } catch (e) {
    mem.set(k, { url: null, exp: Date.now() + MISS_TTL });
    return null;
  } finally { clearTimeout(timer); }
}

// bounded-concurrency map (same shape as the experiences engine's pool()).
async function pooled(items, worker, size = 4) {
  const out = new Array(items.length);
  let i = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const idx = i++; try { out[idx] = await worker(items[idx], idx); } catch (e) { out[idx] = null; } }
  });
  await Promise.all(runners);
  return out;
}

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch (e) {}
  const places = Array.isArray(body.places) ? body.places.slice(0, 24) : [];
  const resolved = await pooled(places, async (p) => {
    const url = await resolveStore(String(p && p.name || ""), String(p && p.city || ""), Number(p && p.lat), Number(p && p.lng));
    return { id: p && p.id, ok: !!url, url: url || null };
  }, 4);
  const results = {};
  for (const r of resolved) { if (r && r.id != null) results[r.id] = { ok: r.ok, url: r.url }; }
  return Response.json({ results }, { headers: { "Cache-Control": "private, max-age=0" } });
}

export async function GET(req) {
  const u = new URL(req.url);
  const name = String(u.searchParams.get("name") || "").slice(0, 120).trim();
  const city = String(u.searchParams.get("city") || "").slice(0, 60).trim();
  const lat = parseFloat(u.searchParams.get("lat"));
  const lng = parseFloat(u.searchParams.get("lng"));
  if (!name) return Response.json({ ok: false, url: null });
  const url = await resolveStore(name, city, lat, lng);
  return Response.json({ ok: !!url, url: url || null });
}
