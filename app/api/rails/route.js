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
import { dedupeWire, windowRailData } from "../../../lib/railsWire.js";
import { LANDING_CITIES } from "../../../lib/landing";
import { railMenuData } from "../../../lib/railsData";
import { DAYPART_IDS } from "../../../lib/dayparts";
import { nearestCoveredCity, COVERAGE_MI } from "../../../lib/railCoverage";
import { completeAnswersOnly, fastCachedRail, geoCell } from "../../../lib/railFastCache.js";

export const revalidate = 3600;
// The platform's own ceiling, one layer outside railsData's 9s deadline and
// DaypartRail's 10s client budget. Nothing should ever reach this — it is here
// so that a stall in code neither of those two bound still ends in a response
// rather than in a lambda that runs until the platform's silent default kills
// it with nothing written to the CDN.
export const maxDuration = 12;

// Past this, the reader is not in a market Wayfind has ranked inventory for and
// the honest answer is the flagship, not the nearest-by-arithmetic town 400
// miles away. Same spirit as the beach rule: near means near.
//
// COVERAGE_MI now lives in lib/railCoverage.js (2026-09-06) — DaypartRail.js
// needs the identical value client-side, and a route file cannot be imported
// there. See that constant's own comment for why.

/** Nearest LANDING_CITIES slug to a point, or null when nothing is close. */
export function nearestCity(lat, lng) {
  return nearestCoveredCity(LANDING_CITIES, lat, lng, COVERAGE_MI);
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
  // v=2 sends every DELIVERED place once in `placeIndex` and each rail as ids.
  // The first response is windowed; ordered per-rail pages deliver the rest.
  // It is opt-in on purpose rather than a straight shape change: a tab that was
  // opened before this deploy is still running the old client, and the CDN keys
  // on the query string, so v1 and v2 cache independently and an old tab keeps
  // getting the shape it understands until VersionWatch reloads it. Nobody sees
  // an empty rail during a rollout.
  const wire = sp.get("v") === "2" ? 2 : 1;
  const requestedRail = String(sp.get("rail") || "").trim();
  const offset = Math.max(0, Number.parseInt(sp.get("offset") || "0", 10) || 0);
  const pageLimit = Math.max(1, Math.min(48, Number.parseInt(sp.get("limit") || (requestedRail ? "24" : "12"), 10) || 12));
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
    // Creator provenance is part of the answer schema; an older cached answer
    // cannot recover it client-side. Version the answer, not the refresh clock.
    const key = `menu:v2:${slug}:${geoCell(la)}:${geoCell(ln)}:${band || "all"}`;
    const answerIsComplete = completeAnswersOnly((value) => value.complete === true && value.failed === false);
    const cached = await fastCachedRail(
      key,
      () => railMenuData(slug, { origin, requireOrigin: true, band }),
      { name: "homepage-rails", usable: answerIsComplete },
    );
    const data = cached.value;
    // A DEGRADED ANSWER MUST NOT BE CACHED AS THE TRUTH (v8.74). railMenuData
    // now returns `failed: true` when the build did not complete — but this
    // route was about to hand that empty payload to the CDN with an hour of
    // s-maxage, which would have pinned "nothing near you clears this bar" on
    // one transient stall for every reader in that cell for the next hour, and
    // is exactly why the owner's report was "sometimes it shows up, sometimes
    // it doesn't" rather than a clean outage.
    //
    // no-store on the degraded path means the very next request rebuilds, so
    // the cell self-heals instead of latching. The successful answer keeps the
    // hour it earned.
    const degraded = !answerIsComplete(data);
    // A FAILED BUILD IS NOT A COVERED CITY (v9.0, owner's phone 2026-09-07
    // 09:19, "Showing Best Breakfast Picks near Cortez" over two empty rails
    // reading "No nearby place clearly qualifies for this rail yet").
    //
    // v8.73 taught railMenuData to carry `failed: true` out when the 9s
    // inventory deadline blew, and v8.74 stopped this route from caching that
    // answer. Neither changed the one field the client actually reads: this
    // response still said `covered: true` and handed over a payload whose
    // rails were empty and whose cityLabel was the reader's town. The
    // browser's liveFromRailsResponse saw covered:true + data and adopted it
    // as a successful ranking of Cortez — so every composer rail printed its
    // "nothing qualifies" sentence, and the reader was told his town had no
    // breakfast while Supabase was timing out (/api/birthday logged "All
    // owned inventory reads failed: timeout" at 08:51 the same morning).
    //
    // Now the top level says what happened: `failed: true`, `covered: false`,
    // no data. The client maps `failed` to LOAD_FAILED ("we couldn't reach the
    // ranking service", with Try again) — not to "uncovered" ("Wayfind isn't
    // live here yet"), which would be a second lie about the same outage.
    // scripts/test-rails-failed-is-not-covered.mjs pins the whole chain.
    if (degraded) {
      const noStore = { "Cache-Control": "no-store", "x-wayfind-fast-cache": cached.state };
      return NextResponse.json({ covered: false, failed: true, data: null }, { status: 503, headers: noStore });
    }
    // v=2 is a compact, lossless delivery protocol. The first response carries
    // only the first ranked window for every poster rail. A swipe near the end
    // asks for one ordered page with `rail=<id>&offset=<n>`; `railTotals` keeps
    // the full qualified count visible throughout. v1 remains full for tabs
    // opened before this deploy.
    const delivered = wire === 2
      ? dedupeWire(windowRailData(data, {
        railId: requestedRail || null,
        offset,
        limit: pageLimit,
      }))
      : data;
    return NextResponse.json({ covered: true, data: delivered }, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "x-wayfind-fast-cache": cached.state,
      },
    });
  } catch (e) {
    // Fail-closed: the client must NOT keep the SSR flagship as the visitor's
    // city. An empty rail is honest; Sarasota-as-you is not.
    // Same rule as the degraded path above: an exception is not a fact about
    // the reader's town, so it must never be cached as one. This response
    // previously carried no Cache-Control at all, which left the decision to
    // whatever default the edge applied. `failed: true` for the same reason
    // the degraded branch carries it — a throw is an outage, not a coverage
    // fact, and the client must say "couldn't reach", never "not live here".
    return NextResponse.json({ covered: false, failed: true, data: null }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
