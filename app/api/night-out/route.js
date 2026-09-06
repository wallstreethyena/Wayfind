export const runtime = "nodejs";
export const maxDuration = 20;

// Night Out owns its complete candidate universe. Dinner, shows and after
// dark activities are not all stored under the nightlife category, so the
// endpoint reads the three relevant owned categories in parallel.
//
// v8.97b — IDENTITY BEFORE THE COST BOUND. This route used to ask the shared
// reader for the top BROWSE_INVENTORY_N (400) of each broad category and only
// then ask which Night Out rail a row belonged to. Measured near Parrish
// (scripts/diagnose-night-out-funnel.mjs): 1,168 of 3,575 admissible owned rows
// reached the classifier, and 126 QUALIFYING candidates — the Straz Center, Van
// Wezel, Tampa Theatre, both LALA karaoke rooms — never competed. The shared
// reader also issues its box query with limit=1000 and no ORDER BY, so the
// upstream thousand was an arbitrary heap slice that reshuffles on any UPDATE.
//
// lib/nightOutPool.js replaces both cuts with the order lib/browseInventory.js
// already prescribed: deterministic exhaustive paging, then Night Out's own
// exact 27-mile law, then the REAL nightOutPlaceRail predicate, and only then
// the composer's Wayfind Score ranking. No provider calls, no widened
// predicates, and serveFromInventory's semantics are untouched for the cafés,
// hotels and Family rails that depend on them.
import { NET_DEADLINE_MS } from "../../../lib/fetchDeadline.js";
import { composeNightOutRails } from "../../../lib/nightOutIntent.js";
import { fetchNightOutPool } from "../../../lib/nightOutPool.js";
import { fastCachedRail, geoCell } from "../../../lib/railFastCache.js";
import { windowRailAnswer } from "../../../lib/railResponse.js";
import { pageOneRail } from "../../../lib/railPage.js";
import { nightOutEditorialEvidence } from "../../../lib/nightOutEvidence.js";

const NIGHT_OUT_DB_DEADLINE_MS = 3000;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = Number.parseFloat(searchParams.get("lat") || "");
  const lng = Number.parseFloat(searchParams.get("lng") || "");
  const full = searchParams.get("full") === "1";
  // WO11 paging contract: ?rail=<id>&page=N&size=10 pages ONE named rail —
  // the "as they scroll past the seventh card, load 10 more" request. This
  // reads the SAME fast-cache entry as the bulk request below ("rank once,
  // page many"): the full ranked list is already computed and cached the
  // first time anyone asks for this metro cell, so a later page costs one
  // cache read and a slice, never a second inventory build.
  const railId = searchParams.get("rail") || "";
  const page = searchParams.get("page");
  const size = searchParams.get("size");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: "lat and lng are required" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  const key = `night-out:v4:${geoCell(lat)}:${geoCell(lng)}`;
  try {
    const cached = await fastCachedRail(key, async () => {
      const origin = { lat, lng };
      // nightOutEditorialEvidence is handed IN rather than looked up later:
      // the ten predicates read editorial text, so the curated override has to
      // be present at ADMISSION time or a place whose only night-evidence is
      // curated would be refused before anything could restore it. Curing
      // candidate starvation by creating evidence starvation is a lateral move.
      const pool = await fetchNightOutPool(lat, lng, {
        deadlineMs: Math.min(NET_DEADLINE_MS, NIGHT_OUT_DB_DEADLINE_MS),
        editorialOverride: nightOutEditorialEvidence,
      });
      const composed = composeNightOutRails([], pool.places, origin);
      return { ...composed, sourceCount: pool.places.length, sourceStats: pool.stats, sourceFailures: pool.stats.sourceFailures || 0 };
    }, {
      name: "night-out-rails",
      usable: (value) => !!value?.rails?.some((rail) => rail.places?.length),
    });
    const total = cached.value.rails.reduce((sum, rail) => sum + rail.places.length, 0);
    const headers = {
      "cache-control": total ? "public, s-maxage=3600, stale-while-revalidate=86400" : "no-store",
      "x-wayfind-fast-cache": cached.state,
    };
    if (railId) {
      const paged = pageOneRail(cached.value.rails, railId, { page, size });
      if (!paged) return Response.json({ error: "unknown rail" }, { status: 404, headers: { "cache-control": "no-store" } });
      return Response.json({ rail: railId, ...paged }, { headers });
    }
    return Response.json(windowRailAnswer(cached.value, full), { headers });
  } catch (error) {
    console.error("[api/night-out] inventory unavailable", { message: String(error?.message || error) });
    return Response.json({ error: "Night Out inventory is temporarily unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
