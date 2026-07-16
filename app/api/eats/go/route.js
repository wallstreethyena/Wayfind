// app/api/eats/go/route.js — v6.38 EXACT-STORE redirect for Order In.
// Every "Order on Uber Eats" click routes through here; we resolve the
// restaurant's ACTUAL Uber Eats store page server-side and 302 the user into
// it — the same integrity pattern as /api/viator/go (exact product, never a
// guess). Uber has no public store-lookup API, so resolution reads Uber's own
// search page for the first /store/ link that shares a distinctive token with
// the restaurant name. Successes cache for 30 days (store URLs are stable);
// ANY failure — bot challenge, timeout, no match — falls back to the tracked
// search deep link, so this can never be worse than v6.37 behavior.
export const runtime = "nodejs";

import { cget, cset, DAY } from "../../../../lib/serverCache";

// Bracket-notation env read at call time (see /api/viator/go): dot-access
// NEXT_PUBLIC_* gets inlined at build and a later-added value would bake out.
const TEMPLATE = () => ((process.env["NEXT_PUBLIC_UBEREATS_TEMPLATE"] || "").trim());

const mem = new Map(); // warm-instance: key -> { url, exp }
const TTL = 24 * 3600 * 1000;

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function wrap(url) {
  const t = TEMPLATE();
  if (!t || t.indexOf("{url}") < 0) return url;
  try { return t.replace("{url}", encodeURIComponent(url)); } catch { return url; }
}

function searchUrl(name, city) {
  return "https://www.ubereats.com/search?diningMode=DELIVERY&q=" + encodeURIComponent(name + (city ? " " + city : ""));
}

async function resolveStore(name, city, lat, lng) {
  const k = "eatsgo|v1|" + norm(name) + "|" + norm(city);
  const hit = mem.get(k);
  if (hit && hit.exp > Date.now()) return hit.url;
  try {
    const c = await cget(k, { staleMs: 30 * DAY });
    if (c && typeof c.v === "string" && c.v.indexOf("/store/") > 0) { mem.set(k, { url: c.v, exp: Date.now() + TTL }); return c.v; }
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
    if (!r.ok) return null;
    const html = await r.text();
    // Prefer the first store link sharing a distinctive (≥4-char) name token;
    // fall back to the first store link at all (Uber already ranked by query).
    const toks = norm(name).split(" ").filter((w) => w.length >= 4);
    let first = null, matched = null;
    const re = /href="(\/store\/[^"?#]+)/g;
    let m;
    while ((m = re.exec(html))) {
      const href = m[1];
      if (!first) first = href;
      const slug = norm(decodeURIComponent(href));
      if (toks.length && toks.some((t) => slug.indexOf(t) >= 0)) { matched = href; break; }
    }
    const best = matched || first;
    if (!best) return null;
    const url = "https://www.ubereats.com" + best;
    mem.set(k, { url, exp: Date.now() + TTL });
    try { await cset(k, url, 30 * DAY); } catch (e) {}
    return url;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req) {
  const u = new URL(req.url);
  const name = String(u.searchParams.get("name") || "").slice(0, 120).trim();
  const city = String(u.searchParams.get("city") || "").slice(0, 60).trim();
  const lat = parseFloat(u.searchParams.get("lat"));
  const lng = parseFloat(u.searchParams.get("lng"));
  const fallback = wrap(searchUrl(name || "food delivery", city));
  if (!name) return Response.redirect(fallback, 302);
  const store = await resolveStore(name, city, lat, lng);
  return Response.redirect(wrap(store || fallback), 302);
}
