export const runtime = "nodejs";

// app/api/intent-candidates/route.js — an OWNED-INVENTORY candidate feed for
// client-composed intent rails (Night Out today; any future rail that needs
// the same shape).
//
// THE BUG THIS EXISTS TO FIX (owner screenshot, Parrish 27.5876,-82.4237,
// 2026-09-02). app/components/DaypartRail.js built `nightOutPlaces` — the
// input to composeNightOutRails() — from `Object.values(shown.places)`, the
// UNION of rows OTHER home rails already happened to have loaded client-side.
// Night Out has no home rail of its own, so its composer never saw real
// inventory: it saw whatever breakfast/family/beach/trending picked for
// THEIR OWN axes. Result: "No verified event or venue within 27 miles clears
// this intent yet" for Dinner + Entertainment while wf_inventory held 4,412
// places within 27mi of that point (1,963 food, 1,278 rated ≥4.3★/150+
// reviews) — the Creator-Finds pool-starvation class from August, same shape,
// new surface: a composer with a real quality bar starved of real candidates
// reads identically to an honest "nothing qualifies", and only one of those
// is true.
//
// NOT A NEW QUERY PATH. serveFromInventory (lib/inventoryServe.js) already
// does exactly what this route needs — geo-boxed wf_inventory read
// (cache:"no-store", the repo's cron-fetch law, baked in), isOperational +
// !excluded + rating-present filtering, wayfindScore-ranked — and is already
// the fetch behind /api/date-night (see buildDateNightAnswer there). This
// route is a thin, generic wrapper: several categories, merged, deduped,
// re-ranked by the ONE governed score, capped, normalized through
// toDateNightPlace (lib/dateNightIntent.js) — which despite its name is a
// GENERIC Google-Places-shape → wire-shape mapper with nothing date-night-
// specific in it (id/name/rating/reviews/lat/lng/distMi/types/primaryType/
// priceNum/priceLevel/photo/editorial/status). Reusing it here rather than
// writing a second normalizer is the same "one decision, shared" rule
// CLAUDE.md's #486 postmortem exists to enforce.
//
// NO GOOGLE. Every row here is wf_inventory. $0 per request, same as
// /api/date-night and /api/rails.
import { serveFromInventory } from "../../../lib/inventoryServe.js";
import { toDateNightPlace } from "../../../lib/dateNightIntent.js";
import { wayfindScore } from "../../../lib/wayfindScore.js";
import { BROWSE_INVENTORY_N } from "../../../lib/browseInventory.js";
import { fastCachedRail, geoCell } from "../../../lib/railFastCache.js";

// Night Out's own bound (lib/nightOutIntent.js NIGHT_OUT_MAX_MI) is the
// default so a caller that forgets ?radiusMi gets the right answer, not a
// silently different one. HARD_MAX_MI is a cost/abuse ceiling on the ?radiusMi
// override, not a product decision — widening the box this far reads ~5,700
// square miles of inventory per category.
const DEFAULT_RADIUS_MI = 27;
const HARD_MAX_MI = 60;
const DEFAULT_CATS = ["food", "nightlife", "attractions"];
const ALLOWED_CATS = new Set(["food", "nightlife", "attractions", "beach", "hotels", "shopping"]);
// The per-category DB cost bound serveFromInventory already uses elsewhere
// (lib/browseInventory.js, /api/date-night) — not reinvented here. The final
// response is capped separately, after the merge (see LIMIT below), so one
// dominant category (food is always the biggest pool) cannot crowd out a
// thinner one before the client-side identity gates ever run.
const PER_CAT_N = BROWSE_INVENTORY_N;
const LIMIT_DEFAULT = 400;
const LIMIT_MAX = 600;

function parseCats(raw) {
  if (!raw) return DEFAULT_CATS;
  const cats = String(raw).toLowerCase().split(",").map((c) => c.trim()).filter((c) => ALLOWED_CATS.has(c));
  return cats.length ? [...new Set(cats)] : DEFAULT_CATS;
}

async function buildCandidates({ lat, lng, radiusMi, cats, limit }) {
  const radiusM = radiusMi * 1609.34;
  const origin = { lat, lng };
  const pools = await Promise.all(cats.map((cat) => serveFromInventory(cat, lat, lng, radiusM, PER_CAT_N)));

  const seen = new Set();
  const places = [];
  for (const raw of pools.flat()) {
    const row = toDateNightPlace(raw, origin);
    // toDateNightPlace already refuses a row with no name/id/rating — see its
    // own guard — so nothing unrated or unidentified reaches the composer.
    if (!row || seen.has(row.id)) continue;
    if (row.distMi != null && row.distMi > radiusMi) continue; // the geo box is a superset; re-cut to the exact radius
    seen.add(row.id);
    places.push(row);
  }
  // THE GOVERNED SCORE, not arrival order across the per-category fetches —
  // requirement #2's "ordered by the governed Wayfind score". Composers that
  // consume this (composeNightOutRails today) re-sort within their own
  // buckets anyway, but a caller that reads this feed directly must see the
  // real ranking, not a category-interleaved one.
  places.sort((a, b) => (wayfindScore(b.rating, b.reviews) ?? -1) - (wayfindScore(a.rating, a.reviews) ?? -1));
  return places.slice(0, limit);
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat"));
  const lng = parseFloat(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: "lat and lng are required", places: [] }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  const radiusMiRaw = parseFloat(searchParams.get("radiusMi"));
  const radiusMi = Number.isFinite(radiusMiRaw) && radiusMiRaw > 0 ? Math.min(radiusMiRaw, HARD_MAX_MI) : DEFAULT_RADIUS_MI;
  const cats = parseCats(searchParams.get("cats"));
  const limitRaw = parseInt(searchParams.get("limit"), 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, LIMIT_MAX) : LIMIT_DEFAULT;

  const key = `intent-candidates:${geoCell(lat)}:${geoCell(lng)}:${radiusMi}:${cats.join("+")}:${limit}`;
  const cached = await fastCachedRail(key, () => buildCandidates({ lat, lng, radiusMi, cats, limit }), {
    name: "intent-candidates",
    usable: (value) => Array.isArray(value) && value.length > 0,
  });
  const places = cached.value || [];

  // Same v8.74 rule /api/date-night and /api/rails already carry: an empty
  // answer is never cached as the truth. A cold cell, a stalled read or a
  // radius with genuinely nothing in it all look identical from here, and
  // only the LAST one is a fact about the reader's location worth an hour of
  // shared cache.
  const empty = places.length === 0;
  return Response.json({ places, center: { lat, lng }, radiusMi, cats }, {
    status: 200,
    headers: {
      "cache-control": empty ? "no-store" : "public, s-maxage=3600, stale-while-revalidate=86400",
      "x-wayfind-fast-cache": cached.state,
    },
  });
}
