// app/api/rails/route.js — the rail menu's places, for a location.
//
// WHY THIS EXISTS. The homepage is ONE prerendered document, so its rails are
// server-ranked for the flagship metro. That is a real answer at first paint
// and the wrong answer for a reader in Orlando — and it breaks a rule the owner
// set explicitly (2026-07-28, beach hero): "we dont show a beach hero card for
// someone who is currently not within 23 miles from a beach OR SEARCH FOR A
// PLACE that is not 23 miles from a beach". scripts/test-beach-geo.mjs pins it.
// So the rail follows `center` — the one piece of state both geolocation and
// the search box write — by asking this route for the nearest covered metro.
//
// COST. Every ranked pool behind railMenuData() is Supabase-cached for 30 days
// (lib/landing.js) and this response is CDN-cached for an hour, so a metro that
// has been asked for once costs nothing to ask for again. There is no metered
// upstream on the hot path: this is not the shape lib/apiGuard.js exists for,
// and it is not in the middleware matcher for the same reason /api/events is
// not. It also takes no free-text — only two numbers, snapped to a fixed list
// of ~21 cities, plus one of four band names — so there is no novel-parameter
// space to iterate over.
//
// v8.30 — WHY THE BAND IS A PARAMETER. The today card now serves the owner's
// handpicked board for the reader's town, and the hour FILTERS it: the morning
// board at 8am, the night board at 8pm. The band is corrected in the reader's
// browser, so if it did not reach the server this response would freeze
// whichever band the CDN happened to warm in — every reader all day getting the
// 3am answer because that is when the cache filled. Four extra keys per
// location, and in practice roughly zero extra misses: the bands are disjoint
// in time, so at any moment every reader in a metro asks for the same one. An
// unrecognised value is IGNORED rather than honoured, so there is still no
// novel-key space to iterate over.
import { NextResponse } from "next/server";
import { dedupeWire } from "../../../lib/railsWire.js";
import { LANDING_CITIES } from "../../../lib/landing";
import { railMenuData } from "../../../lib/railsData";
import { DAYPART_IDS } from "../../../lib/dayparts";

export const revalidate = 3600;

const R_EARTH_MI = 3958.8;
const rad = (d) => (d * Math.PI) / 180;
function miBetween(aLat, aLng, bLat, bLng) {
  const s = Math.sin(rad(bLat - aLat) / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return R_EARTH_MI * 2 * Math.asin(Math.sqrt(s));
}

// Past this, the reader is not in a market Wayfind has ranked inventory for and
// the honest answer is the flagship, not the nearest-by-arithmetic town 400
// miles away. Same spirit as the beach rule: near means near.
const COVERAGE_MI = 90;

/** Nearest LANDING_CITIES slug to a point, or null when nothing is close. */
export function nearestCity(lat, lng) {
  const la = Number(lat), ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  let best = null, bestMi = Infinity;
  for (const [slug, c] of Object.entries(LANDING_CITIES)) {
    const mi = miBetween(la, ln, c.lat, c.lng);
    if (mi < bestMi) { bestMi = mi; best = slug; }
  }
  return bestMi <= COVERAGE_MI ? best : null;
}

export async function GET(req) {
  const sp = req.nextUrl.searchParams;
  // ABSENT MEANS ABSENT: Number(null) is 0, not NaN, so a bare ?city=
  // request coerced to origin (0,0) — a point 5,715 miles off the coast of
  // Africa — and every distance-gated rail (beach ≤23, break ≤8) shipped
  // thin. Caught on the preview deploy before merge. Parse only params that
  // are actually present.
  const parseCoord = (k) => { const v = sp.get(k); return v == null || v === "" ? NaN : Number(v); };
  const la = parseCoord("lat"), ln = parseCoord("lng");
  const origin = Number.isFinite(la) && Number.isFinite(ln) ? { lat: la, lng: ln } : null;
  // Near-me is the visitor's point. No lat/lng → honest empty, never a
  // city snap (and never LANDING_CITIES.sarasota) wearing "near me".
  if (!origin) {
    return NextResponse.json({ covered: false, data: null }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  }
  // ── WIRE VERSION ───────────────────────────────────────────────────────────
  // v8.33.1. With no card ceiling one Sarasota response carries 1,885 rows and
  // Vercel served it at 524KB — but there are only about 450 DISTINCT places
  // behind those rows. `eat`, `best`, `today` and `datenight` all legitimately
  // contain the same restaurant, and each one was shipping a full copy of it.
  //
  // v=2 sends every place ONCE in `placeIndex` and each rail as a list of ids.
  // It is opt-in on purpose rather than a straight shape change: a tab that was
  // opened before this deploy is still running the old client, and the CDN keys
  // on the query string, so v1 and v2 cache independently and an old tab keeps
  // getting the shape it understands until VersionWatch reloads it. Nobody sees
  // an empty rail during a rollout.
  const wire = sp.get("v") === "2" ? 2 : 1;
  const askedBand = String(sp.get("band") || "");
  const band = DAYPART_IDS.includes(askedBand) ? askedBand : undefined;
  const asked = String(sp.get("city") || "");
  const slug = LANDING_CITIES[asked] ? asked : nearestCity(la, ln);
  if (!slug) {
    // Out of coverage. 200 with a null payload, not a 404: the client must
    // empty the flagship rails (honest empty / CityGate), never keep Sarasota
    // as the visitor's city. A 404 in the console would read as a broken page.
    return NextResponse.json({ covered: false, data: null }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  }
  try {
    // Pools stay per-metro cached; distances, distance gates and the
    // creators pool re-origin on the visitor. The client snaps coordinates
    // to a coarse grid before asking, so the CDN cache keys stay countable.
    const data = await railMenuData(slug, { origin, requireOrigin: true, band });
    return NextResponse.json({ covered: true, data: wire === 2 ? dedupeWire(data) : data }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (e) {
    // Fail-closed: the client must NOT keep the SSR flagship as the visitor's
    // city. An empty rail is honest; Sarasota-as-you is not.
    return NextResponse.json({ covered: false, data: null }, { status: 200 });
  }
}
