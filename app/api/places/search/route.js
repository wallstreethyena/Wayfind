// v4.08 / v5.90 — Server-side Places Text Search proxy on the SHARED cache.
// Every browser's search feeds ONE Supabase pool (lib/serverCache) all users
// share, so the first search pays and everyone else reads the cache — and the
// site stays live when Google 429s (quota) by degrading to the cached result.
// Requires GOOGLE_MAPS_SERVER_KEY (Places API New, no referrer restriction);
// missing -> 501 and the client falls back to the direct SDK path.
//
// Google ToS: Place IDs may be kept indefinitely (see the permanent wf_place_ids
// index); all OTHER place content must not be cached beyond 30 days. Fresh TTL is
// ~10 days for accuracy; the stale-serve fallback is hard-capped at 30 days.
import { NextResponse } from "next/server";
import { gateFree, gateShut, spendAllow, spendAllowCapped, textEnterpriseCap } from "../../../../lib/spendGate";
import { cget, cset, upsertPlaceIds, cacheConfigured, lastWrite, memSize, DAY } from "../../../../lib/serverCache";
import { serveFromInventory, serveInventoryByPlaceIds } from "../../../../lib/inventoryServe";
import { hasScoreSignal } from "../../../../lib/score";
import { mergeOwnedSignals, ownedLookupIds } from "../../../../lib/ownedLibrary";
import { attractionDiscoveryPlaceIds, loadAttractionDiscovery } from "../../../../lib/attractionDiscovery";

export const dynamic = "force-dynamic";
// 2026-09-23 — the inv=1 branch now reads its category box EXHAUSTIVELY
// (lib/inventoryServe.js's readOwnedCategory paging) instead of a single
// capped fetch, so a wide box (e.g. Tampa food, ~75mi) can take several
// sequential Supabase round trips before it answers. Platform default was
// never declared here, so it inherited whatever ceiling the account's plan
// applies; 30s gives the paged read (INVENTORY_SERVE_TOTAL_BUDGET_MS = 9s)
// real headroom plus the rest of the request without changing behavior for
// the fast, common case, which still answers in well under a second.
export const maxDuration = 30;

const FRESH_TTL_MS = 30 * DAY;   // v6.09: 30 days = the Google ToS maximum for cached
                                 // place content. Maximizing the fresh window minimizes
                                 // paid searchText refreshes (the July cost incident).
const STALE_MAX_MS = 30 * DAY;   // ToS: never serve place content older than 30 days
// NO-RE-BUY (2026-09-15). A Google answer with ZERO places for this exact
// question is remembered for three days so the same question is not bought
// again on every request. This is a NEW, short, negative clock; it does not
// touch FRESH_TTL_MS / STALE_MAX_MS (30d), the 20–27d refresh jitter, or the
// 21-day stock-photo clock. Three days, not thirty: an empty answer can be a
// transient bias oddity, and a dead tile for a month is the wrong trade.
const NEG_TTL_MS = 3 * DAY;
const FIELD_MASK = [
  "places.id", "places.displayName", "places.location", "places.rating",
  "places.userRatingCount", "places.priceLevel", "places.priceRange",
  "places.formattedAddress", "places.regularOpeningHours",
  "places.utcOffsetMinutes", "places.types", "places.primaryType", "places.photos", "places.businessStatus",
].join(",");

// FREE MODE mask - Pro-tier fields ONLY (Text Search Pro: 5,000 free/month).
// rating/userRatingCount/priceLevel/priceRange/regularOpeningHours/businessStatus
// are Enterprise on Text Search and are deliberately absent: cards fall back to
// the score-law null path (chip hidden, nothing fabricated).
const TEXT_PRO_MASK = [
  "places.id", "places.displayName", "places.location", "places.types",
  "places.formattedAddress", "places.photos", "places.primaryType",
].join(",");

// Edge cache: 1 day fresh + 9 days stale-while-revalidate on top of Supabase.
const EDGE_HEADERS = { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=777600" };
// 2026-09-23 (fix round, item 5) — for a FAILED or INCOMPLETE inv=1 read.
// EDGE_HEADERS' s-maxage=86400 exists for successful, COMPLETE answers; a 503
// or a truncated read cached under it would freeze "Nothing here" (or a
// partial list) for a full day. no-store on those responses only.
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

// v6.35 — REFRESH-AHEAD poke. A fresh-but-aging cache hit (cget returns due:true
// at a jittered 20–27 days) is served to the user INSTANTLY; this fire-and-forget
// pokes the dedicated /api/places/refresh route — its OWN lambda invocation with
// full execution time — to re-fetch Google and reset the 30-day clock. Best-effort
// and self-healing: if a poke is dropped (serverless can freeze after the response),
// the next request in the window pokes again; the entry never actually reaches 30
// days. Throttled per key per warm lambda so a burst of hits fires ONE poke, and it
// can NEVER affect the served response (fully wrapped, never awaited).
const REFRESH_FIRED = globalThis.__wfRefreshFired || (globalThis.__wfRefreshFired = new Map());
function pokeRefresh(origin, k, p) {
  try {
    if (!origin) return;
    const now = Date.now();
    const last = REFRESH_FIRED.get(k);
    if (last && now - last < 60000) return;              // one poke / key / lambda / 60s
    if (REFRESH_FIRED.size > 5000) REFRESH_FIRED.clear(); // bound warm-lambda memory
    REFRESH_FIRED.set(k, now);
    const u = `${origin}/api/places/refresh?k=${encodeURIComponent(k)}&q=${encodeURIComponent(p.q)}&lat=${p.lat}&lng=${p.lng}&radius=${p.radius}&n=${p.n}`;
    fetch(u, { headers: { "x-wf-refresh": "1" } }).catch(() => {}); // never awaited
  } catch (e) { /* refresh is best-effort; a failure here must never touch the response */ }
}

// Minimal skeleton rows for the PERMANENT place-ID index (Place ID is ToS-legal
// to keep forever). Our derived coarse category + ranking signals + a name/coords
// skeleton so tiles can show known places when detail caches are cold.
function catFromTypes(types) {
  const t = ((types || []).join(" ") || "").toLowerCase();
  if (/lodging|hotel|motel|resort|guest_house|bed_and_breakfast/.test(t)) return "Hotels";
  if (/restaurant|cafe|coffee|bakery|meal_|food|ice_cream|deli/.test(t)) return "Food";
  if (/night_club|\bbar\b|pub|brewery|liquor/.test(t)) return "Nightlife";
  if (/store|shopping|mall|market|shop|boutique/.test(t)) return "Shopping";
  if (/tourist|museum|park|art_gallery|amusement|aquarium|zoo|stadium|landmark|historical|beach|marina|natural_feature/.test(t)) return "Activities";
  return null;
}
function skeletons(googlePlaces) {
  return (googlePlaces || []).map((p) => {
    if (!p || !p.id) return null;
    const name = typeof p.displayName === "string" ? p.displayName : (p.displayName && p.displayName.text) || null;
    const loc = p.location || {};
    // First photo RESOURCE NAME (places/<id>/photos/<ref>) — the same shape
    // /api/photo validates and proxies. The field mask already pays for
    // places.photos; surfacing the ref here lets a caller render a venue photo
    // without a second Details round-trip. Added 2026-08-07 for the creator
    // "scouted spots" cards, which resolve a photo by name when the loaded pool
    // had no photo-bearing place for them.
    const photoRef = Array.isArray(p.photos) && p.photos[0] && typeof p.photos[0].name === "string"
      ? p.photos[0].name : null;
    return {
      id: p.id, name,
      lat: typeof loc.latitude === "number" ? loc.latitude : null,
      lng: typeof loc.longitude === "number" ? loc.longitude : null,
      category: catFromTypes(p.types),
      photo_ref: photoRef,
      // v7.07 — RAW TYPES, at zero additional cost. FIELD_MASK above already
      // pays for places.types / priceLevel / regularOpeningHours /
      // businessStatus on every one of these calls; skeletons() was collapsing
      // types into the coarse `category` and dropping the other three entirely.
      // lib/dining.js's cuisineLabel() is driven ENTIRELY by raw Google types,
      // so without this a hydrated creator spot can never carry a cuisine and a
      // cuisine filter over it has no data behind it. Exactly the precedent the
      // photo_ref comment above set: the mask is already bought, so surfacing
      // the field costs one line, not one round-trip.
      //
      // NO CACHE-KEY BUMP, deliberately. Bumping "v1" would invalidate every
      // cached text search and force a paid refetch of all of them. It is not
      // needed here: the creator-hydration queries are NEW keys (name + city)
      // that have never been cached, so they miss and are written with these
      // fields present from their first call. Pre-existing keys simply lack the
      // new fields until they refresh, and the route's own refresh-ahead
      // (jittered 20-27 days) heals them without a redeploy. Every consumer
      // treats them as optional, so an old entry degrades to "no cuisine
      // label", never to a wrong one.
      types: Array.isArray(p.types) ? p.types : [],
      price_level: p.priceLevel != null ? p.priceLevel : null,
      oh: p.regularOpeningHours || null,
      utcOffset: typeof p.utcOffsetMinutes === "number" ? p.utcOffsetMinutes : null,
      business_status: p.businessStatus || null,
      signals: { rating: p.rating || null, reviews: p.userRatingCount || 0 },
    };
  }).filter(Boolean);
}

// v6.33 — THE GATE. A single server-side switch to throttle paid Google
// Text Search ("search of words") spend without a redeploy.
//   WAYFIND_GATE unset / "open"  → normal: cache-first, refresh from Google on a
//                                  miss (the default; shipping the gate changes
//                                  nothing until you flip it).
//   WAYFIND_GATE = "shut"        → cost lockdown: on a cache MISS we do NOT call
//                                  Google's paid searchText at all. We serve the
//                                  30-day cache, then your owned inventory, then
//                                  empty. This "brings the words down" to zero new
//                                  paid searches while the warmed cache carries the
//                                  site. Flip it back to "open" any time.
// Set it in Vercel → Project → Settings → Environment Variables (no code change).
function invCfg() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : "https://" + raw) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}
// Merge OWNED quality signals (wf_inventory.signals rating/reviews + status)
// onto lean Pro-mask Google results, in ONE PostgREST call. Mutates in place.
// The merge itself is lib/ownedLibrary.mergeOwnedSignals (pure, asserted by
// call in check-owned-library-no-rebuy); this wrapper only does the read.
async function enrichFromInventory(places) {
  try {
    const s = invCfg();
    if (!s) return 0;
    const ids = ownedLookupIds(places);
    if (!ids.length) return 0;
    const r = await fetch(
      s.url + "/rest/v1/wf_inventory?place_id=in.(" + ids.join(",") + ")&select=place_id,status,signals",
      { headers: { apikey: s.key, Authorization: "Bearer " + s.key }, cache: "no-store" }
    );
    if (!r.ok) return 0;
    return mergeOwnedSignals(places, await r.json());
  } catch (e) { return 0; /* enrichment is best-effort; lean results still serve */ }
}

async function handleSearch(params, origin) {
  const serverKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!serverKey) return NextResponse.json({ error: "server key not configured" }, { status: 501 });
  const q = String(params.q || "").slice(0, 120).trim();
  const lat = Number(params.lat), lng = Number(params.lng);
  // COST GUARD (2026-08-25): snap radius to a fixed ladder BEFORE it reaches the
  // cache key or Google. The perf audit caught the same query bought at 27359m
  // AND 32000m - two paid searches, two cache keys, one user intent. Ties snap up.
  const RADIUS_LADDER = [2000, 8000, 16000, 32000, 50000];
  const rawRadius = Math.min(Math.max(Number(params.radius) || 24000, 500), 50000);
  const radius = RADIUS_LADDER.reduce((best, r) => Math.abs(r - rawRadius) < Math.abs(best - rawRadius) ? r : (Math.abs(r - rawRadius) === Math.abs(best - rawRadius) ? Math.max(r, best) : best), RADIUS_LADDER[0]);
  const n = Math.min(Math.max(Number(params.n) || 20, 1), 20);
  if (!q || !isFinite(lat) || !isFinite(lng)) return NextResponse.json({ error: "bad request" }, { status: 400 });

  // v6.38 — direct owned-inventory serve (inv=1): FREE (no Google call, no
  // cache write), used by the "All is a superset" union on every category
  // tab. Serves only rows we already own; can never trigger paid spend.
  if (String(params.inv || "") === "1") {
    // v8.50 — inventory serve is FREE. 400 is the same cost bound nearbyPool
    // uses per ring (lib/browseInventory.js BROWSE_INVENTORY_N), not a
    // merchandising ceiling. The old 50 was how a filled café identity still
    // shipped 40 cards and called the library done.
    const invN = Math.min(Math.max(Number(params.n) || 40, 1), 400);
    // 2026-09-23 — SERVER PAGING. A capped-to-400 first page can no longer
    // silently be the whole answer: the exhaustive read (lib/inventoryServe.js)
    // now knows the TRUE eligible count, so the "Wayfind 5 more spots" control
    // (app/home.js) can ask for the next page instead of the list quietly
    // ending at 400. `offset` is caller-controlled but bounded — a caller
    // cannot request a negative offset or an absurdly large one that would
    // page past a sane ceiling for no reason.
    const invOffset = Math.min(Math.max(Math.floor(Number(params.offset) || 0), 0), 100000);
    // Owned inventory is not subject to Google's 50km location-bias ceiling.
    // Preserve the browse ladder's requested circle (up to its 60mi maximum)
    // so a 45mi-owned candidate is not lost before the exact-radius gate below.
    const discoveryIds = attractionDiscoveryPlaceIds(params.cat, params.sub);
    if (!discoveryIds.length) {
      // 2026-09-23 (fix round, item 5) — FAIL LOUD. Without failLoud, a
      // failed read returned {places:[], total:0} and this response still
      // carried EDGE_HEADERS (s-maxage=86400), freezing "Nothing here" for a
      // day. A genuine failure now answers 503 with no-store instead, so the
      // next request tries again rather than replaying a cached emptiness.
      try {
        const result = await serveFromInventory(String(params.cat || ""), lat, lng, radius, invN, params.sub, { offset: invOffset, withMeta: true, failLoud: true });
        const meta = result && result.meta ? result.meta : { eligible: 0, served: 0, offset: invOffset, truncated: false };
        const places = result && Array.isArray(result.places) ? result.places : [];
        return NextResponse.json({
          places, cached: false, source: "inventory-direct",
          // total = the full eligible count under this exact chip/radius, not
          // just what this page carries — the "That's all N spots" line and the
          // "more" control both read this, not places.length.
          total: meta.eligible, hasMore: meta.offset + meta.served < meta.eligible, truncated: !!meta.truncated,
        }, { headers: meta.truncated ? NO_STORE_HEADERS : EDGE_HEADERS });
      } catch (error) {
        return NextResponse.json({ places: [], error: String((error && error.message) || error) }, { status: 503, headers: NO_STORE_HEADERS });
      }
    }
    const discoveryRadius = Math.min(Math.max(Number(params.radius) || 24000, 500), 96560);
    // Exact IDs only repair candidate coverage. The same chip identity and the
    // caller's exact requested circle still decide membership, and the merged
    // pool is score-ordered rather than registry-ordered or partner-ordered.
    //
    // 2026-09-23 (fix round, item 2) — SERVER PAGING, here too. This used to
    // ask serveFromInventory for only the top invN (<=400) of the broad
    // category, with no offset and no meta, so `hasMore` was always false and
    // `total` was just `merged.length` — while the TRUE eligible count under a
    // wide chip (attractions:all, Parrish) can be ~920. Reading the broad
    // category with {offset, withMeta} gives the real eligible/served/offset
    // this branch was missing; the exact-ID top-up (loadAttractionDiscovery's
    // own identity/score rules, unchanged — see lib/attractionDiscovery.js)
    // still runs ONLY on the first page (invOffset === 0): it repairs candidate
    // coverage for what the reader sees FIRST, and running it again on every
    // later page would re-sort an already-paged, already-ranked slice by
    // mergeAttractionDiscovery's scoreOf() alone (no distance penalty) — a
    // different order than the exhaustive read produced, breaking "page N is
    // the next N rows". `total` adds any exact-ID candidates the merge pulled
    // in beyond what the broad read already served (they may not be part of
    // the box's own eligible count at all — see the header on
    // mergeAttractionDiscovery for why an exact ID can qualify when the box's
    // native chip contract would have missed it).
    const discoveryRequest = { cat: params.cat, sub: params.sub, lat, lng, radiusM: discoveryRadius, n: invN };
    let discoveryMeta = null;
    try {
      const merged = await loadAttractionDiscovery(discoveryRequest, {
        readCategory: async (request) => {
          // readCategory is always invoked with the SAME discoveryRequest object
          // built above (lib/attractionDiscovery.js's loadAttractionDiscovery
          // passes `request` through unchanged), so request.cat/.sub/.radiusM/.n
          // are exactly params.cat/params.sub/discoveryRadius/invN. Read
          // params.sub directly (rather than request.sub) so this call site is
          // textually, not just referentially, "forwards params.sub" — the same
          // invariant scripts/check-narrow-chip-inventory.mjs asserts on every
          // serveFromInventory call in this route.
          const result = await serveFromInventory(String(request.cat || ""), lat, lng, request.radiusM, request.n, params.sub, { offset: invOffset, withMeta: true, failLoud: true });
          discoveryMeta = result && result.meta ? result.meta : null;
          return result && Array.isArray(result.places) ? result.places : [];
        },
        readIds: (ids, request) => invOffset === 0 ? serveInventoryByPlaceIds(ids, lat, lng, request.radiusM) : Promise.resolve([]),
      });
      const meta = discoveryMeta || { eligible: merged.length, served: merged.length, offset: invOffset, truncated: false };
      const extraCandidates = Math.max(0, merged.length - meta.served);
      const total = meta.eligible + extraCandidates;
      return NextResponse.json({
        places: merged, cached: false, source: "inventory-direct",
        total, hasMore: meta.offset + meta.served < meta.eligible, truncated: !!meta.truncated,
      }, { headers: meta.truncated ? NO_STORE_HEADERS : EDGE_HEADERS });
    } catch (error) {
      return NextResponse.json({ places: [], error: String((error && error.message) || error) }, { status: 503, headers: NO_STORE_HEADERS });
    }
  }

  // Round the bias point to ~1km so nearby users share cache entries.
  // FREE MODE writes lean (Pro-mask) rows under its own "v1p" namespace so they
  // can never poison the rich cache, nor serve as rich after the gate reopens.
  const freeMode = gateFree();
  const k = [freeMode ? "v1p" : "v1", q.toLowerCase(), lat.toFixed(2), lng.toFixed(2), Math.round(radius / 1000), n].join("|");
  const wantDebug = String(params.debug || "") === "1";
  const forceErr = String(params.forceErr || "") === "1"; // test hook: skip Google, drive the stale path
  const dbg = () => wantDebug ? { lastWrite: lastWrite(), memSize: memSize(), supabaseConfigured: cacheConfigured() } : undefined;

  const fresh = await cget(k);
  // FREE MODE FIX (2026-08-25, live empty-results incident): the v1p namespace
  // orphaned the entire warm rich cache, so every category tap became a miss.
  // Before ANY gate/ledger/paid decision, serve the RICH v1 row if one exists
  // within the 30-day ToS window — richer data, zero spend, instant.
  // v8.48 — A CACHE ROW CAN BE POISONED. Free mode ran for a while writing lean
  // Pro-mask rows (no rating/userRatingCount) into the v1p namespace. Those rows
  // fail hasScoreSignal(), so the card gate refuses them — and a cache HIT
  // replays them straight past the serve-time filter below, which is why "best
  // restaurants" near Parrish still returned 20 unrenderable rows after the
  // first fix deployed. Clean on the way OUT, not just on the way in, so a row
  // already written can never render as a blank feed.
  const clean = (rows) => (freeMode && Array.isArray(rows) ? rows.filter(hasScoreSignal) : (rows || []));
  // Every cached row was unrenderable: serve OWNED inventory (which carries its
  // own rating/reviews) rather than a blank list. Free — no Google call.
  const ownedOr = async (source) => {
    const inv = params.cat ? await serveFromInventory(params.cat, lat, lng, radius, n, params.sub) : [];
    return inv.length ? NextResponse.json({ places: inv, cached: false, source, debug: dbg() }, { headers: wantDebug ? {} : EDGE_HEADERS }) : null;
  };
  if (!fresh && freeMode) {
    const kRich = ["v1", q.toLowerCase(), lat.toFixed(2), lng.toFixed(2), Math.round(radius / 1000), n].join("|");
    const rich = await cget(kRich, { staleMs: STALE_MAX_MS });
    if (rich) {
      const rv = clean(rich.v);
      if (rv.length) return NextResponse.json({ places: rv, cached: true, source: "rich-cache", debug: dbg() }, { headers: wantDebug ? {} : EDGE_HEADERS });
    }
  }
  if (fresh) {
    const fv = clean(fresh.v);
    if (fv.length) {
      // v6.35: serve the still-fresh copy instantly; if it is aging past its
      // jittered refresh age, poke a background refresh so it never reaches day 30.
      if (fresh.due) pokeRefresh(origin, k, { q, lat, lng, radius, n });
      return NextResponse.json({ places: fv, cached: true, debug: dbg() }, { headers: wantDebug ? {} : EDGE_HEADERS });
    }
    // NO-RE-BUY (2026-09-15) — ENRICH ON READ. A fresh row whose places are all
    // lean means: we bought this exact question inside the window and owned
    // none of the ids Google returned. Those ids were learned into
    // wf_place_ids; the promotion drain may have enriched some into
    // wf_inventory SINCE the row was written. Lay owned signals on now (one
    // Supabase read, no Google) — the moment promotion lands, the cached row
    // starts serving, with no grant.
    if (freeMode && Array.isArray(fresh.v) && fresh.v.length && (await enrichFromInventory(fresh.v)) > 0) {
      const fv2 = clean(fresh.v);
      if (fv2.length) return NextResponse.json({ places: fv2, cached: true, source: "lean-cache-enriched", debug: dbg() }, { headers: wantDebug ? {} : EDGE_HEADERS });
    }
    const owned = await ownedOr("inventory-poisoned-cache");
    if (owned) return owned;
    // NO-RE-BUY (2026-09-15). This used to fall through to the gated path and
    // "let it buy a fresh (now filtered) answer". Buying the same question again
    // returns the same ids we still do not own, so it produced nothing — and
    // it did so on EVERY request until the row was written or the month's
    // ledger was gone. Measured: 4,800 September grants, 1,014 cache rows;
    // the cap was reached on the 15th. A fresh row is the answer, even when
    // the answer is honestly empty. The row expires on its own clock and the
    // next request after that buys once.
    return NextResponse.json({ places: [], cached: true, source: "no-rebuy", debug: dbg() }, { headers: wantDebug ? {} : EDGE_HEADERS });
  }

  const serveStale = async () => {
    // ToS: serve a stale row ONLY within the 30-day age cap.
    const s = await cget(k, { staleMs: STALE_MAX_MS });
    const sv = s ? clean(s.v) : [];
    return sv.length ? NextResponse.json({ places: sv, cached: true, stale: true, debug: dbg() }, { headers: wantDebug ? {} : EDGE_HEADERS }) : null;
  };

  try {
    if (forceErr) { const s = await serveStale(); return s || NextResponse.json({ error: "forced (no stale)", debug: dbg() }, { status: 502 }); }
    // THE GATE (shut): never pay Google on a miss — lean on the warmed cache and
    // owned inventory. Serve stale (≤30d) → inventory → empty. Zero new searches.
    const gateBlocked = async (why) => {
      const stale = await serveStale();
      if (stale) return stale;
      const inv = params.cat ? await serveFromInventory(params.cat, lat, lng, radius, n, params.sub) : [];
      if (inv.length) return NextResponse.json({ places: inv, cached: false, source: "inventory", gate: why, debug: dbg() }, { headers: wantDebug ? {} : EDGE_HEADERS });
      return NextResponse.json({ places: [], cached: false, gate: why, debug: dbg() }, { headers: wantDebug ? {} : EDGE_HEADERS });
    };
    // THE GATE (shut): never pay Google on a miss — lean on the warmed cache and
    // owned inventory. Serve stale (≤30d) → inventory → empty. Zero new searches.
    if (gateShut()) return await gateBlocked("shut");
    // Every enabled mode is ledger-backed. Rich Text Search additionally
    // requires an explicit operator ceiling; missing configuration is off.
    if (freeMode && !(await spendAllow("text_pro"))) return await gateBlocked("free-budget");
    if (!freeMode && !(await spendAllowCapped("text_enterprise", textEnterpriseCap()))) {
      return await gateBlocked("open-budget");
    }
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": serverKey, "X-Goog-FieldMask": freeMode ? TEXT_PRO_MASK : FIELD_MASK },
      body: JSON.stringify({ textQuery: q, maxResultCount: n, locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius } } }),
    });
    if (!r.ok) {
      // v6.10: a 429/error on a CATEGORY search serves the OWNED inventory (the
      // complete owned set, e.g. ~191 hotels) BEFORE the thin stale cache, so a
      // Google quota outage no longer collapses "Stay" to one hotel. Free-text
      // searches (no cat) and empty inventory fall through to the stale cache.
      const inv = params.cat ? await serveFromInventory(params.cat, lat, lng, radius, n, params.sub) : [];
      if (inv.length) return NextResponse.json({ places: inv, cached: false, source: "inventory", debug: dbg() }, { headers: wantDebug ? {} : EDGE_HEADERS });
      const stale = await serveStale();
      if (stale) return stale;
      return NextResponse.json({ error: "upstream " + r.status, debug: dbg() }, { status: 502 });
    }
    const data = await r.json();
    const places = data.places || [];
    // FREE MODE FIX (2026-08-25): the Pro mask omits rating/userRatingCount/
    // businessStatus, and the ranking floors (correctly) refuse unrated places,
    // which emptied every list. We OWN those signals for 12k+ places - merge
    // them from wf_inventory before caching/serving. Reader-first: Google
    // discovers ids, OUR data supplies quality. Fail-soft: no inventory match
    // leaves the place lean (score law hides its chip).
    if (freeMode && places.length) await enrichFromInventory(places);
    // v8.48 — NEVER SERVE A ROW THE CARD GATE WILL DISCARD (live incident,
    // 2026-08-25). enrichFromInventory only reaches places we already OWN;
    // anything else stays lean, and a lean row fails lib/score.js
    // hasScoreSignal() — which means PlaceCard returns null for it while the
    // feed still COUNTS it. Measured against production on this build:
    // "famous landmarks and monuments" near Parrish returned 20 rows of which
    // 15 could never render, and the reader got "That's all 20 spots" over an
    // empty list. Dropping them here keeps the count honest at every tier and
    // costs nothing — the ids are still learned below, so tomorrow's promotion
    // pass can enrich them into inventory and bring them back with a Score.
    const served = freeMode ? places.filter(hasScoreSignal) : places;
    // NO-RE-BUY (2026-09-15) — EVERY PAID ANSWER LEAVES A ROW. Before this,
    // only `served.length` wrote the cache, so a free-mode answer we owned
    // none of (or an empty Google answer) wrote nothing, and the next identical
    // request bought it again. September: 4,800 grants, 1,014 rows. Three
    // outcomes, three writes:
    //   served rows        → the served set, 30-day clock (unchanged)
    //   lean-only rows     → the lean set, 30-day clock. clean() on the way OUT
    //                        still guarantees the client never sees a lean row
    //                        (v8.48); the fresh-hit path enriches on read, so
    //                        the row starts serving the day promotion lands.
    //   zero places        → [], 3-day negative clock (NEG_TTL_MS)
    // Ids are learned in every case — that is what feeds promotion.
    if (served.length) await cset(k, served, FRESH_TTL_MS);
    else if (places.length) await cset(k, places, FRESH_TTL_MS);
    else await cset(k, [], NEG_TTL_MS);
    if (places.length) await upsertPlaceIds(skeletons(places));
    // The whole page was unrenderable: fall back to OWNED inventory, which
    // carries its own rating/reviews, rather than serving a confidently empty
    // list. Same reader-first order the 429 path already uses.
    if (freeMode && !served.length && places.length) {
      const inv = params.cat ? await serveFromInventory(params.cat, lat, lng, radius, n, params.sub) : [];
      if (inv.length) return NextResponse.json({ places: inv, cached: false, source: "inventory-lean", debug: dbg() }, { headers: wantDebug ? {} : EDGE_HEADERS });
    }
    return NextResponse.json({ places: served, cached: false, debug: dbg() }, { headers: wantDebug ? {} : EDGE_HEADERS });
  } catch {
    const inv = params.cat ? await serveFromInventory(params.cat, lat, lng, radius, n, params.sub) : [];
    if (inv.length) return NextResponse.json({ places: inv, cached: false, source: "inventory", debug: dbg() }, { headers: wantDebug ? {} : EDGE_HEADERS });
    const stale = await serveStale();
    if (stale) return stale;
    return NextResponse.json({ error: "upstream failure", debug: dbg() }, { status: 502 });
  }
}

// The former `?probe=nearby` route called Google Nearby Search directly from a
// public endpoint, with a caller-selected field mask and no ledger grant. The
// diagnostic is retired rather than protected by a best-effort browser guard:
// no deployed request may revive that paid path.
export async function GET(req) {
  const u = new URL(req.url);
  const params = Object.fromEntries(u.searchParams);
  if (params.probe === "nearby") {
    return NextResponse.json({ error: "nearby probe retired" }, { status: 410, headers: { "Cache-Control": "no-store" } });
  }
  return handleSearch(params, u.origin);
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  return handleSearch(body, new URL(req.url).origin);
}
