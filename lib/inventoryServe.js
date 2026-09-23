// lib/inventoryServe.js — SERVER-ONLY. When the live Google search 429s (quota)
// or errors, serve the category list from Wayfind's OWNED inventory
// (wf_inventory) instead of a thin/near-empty stale cache. This is why "Stay"
// can show the ~191 hotels we already seeded during a Google outage, instead of
// the one hotel a cold query cache happened to hold. The rows are already
// categorized and carry name/lat/lng/rating/reviews/price/types/photo, so they
// map straight into the Google Places (New) shape the client already renders.
// NOTE: serverCache is loaded lazily inside serveFromInventory (not a top-level
// import) so the pure helpers here stay unit-testable in bare Node without
// dragging in the whole cache/env chain.

import { CAT_ALLOW, CAT_EXCLUDE, SUB_ALLOW } from "./placeFilter.js";
import { existingTypeSignals } from "./placeCategory.js";
import { isOperational } from "./businessStatus.js";
// The 0-100 Wayfind Score. Zero imports of its own, on purpose, so a server
// ranker can take it without pulling the app in.
import { wayfindScore } from "./wayfindScore.js";
import { fetchDeadline, DB_DEADLINE_MS } from "./fetchDeadline.js";

const CATS = new Set(["food", "nightlife", "attractions", "beach", "hotels", "shopping"]);
// v6.34 — VIRTUAL categories: tabs with no wf_inventory category of their own,
// served from an existing one through the SAME allow/exclude contracts the
// live path enforces. v6.28 shipped the Family tab without this mapping, so
// during a Google 429 every tab survived on inventory EXCEPT Family, which
// 502'd into "Nothing here right now" (July 15 outage). Family = attractions
// rows whose types/name read kid-appropriate, minus adult-only/nightlife.
export const VIRTUAL_CATS = {
  family: {
    base: "attractions",
    keep(row) {
      const hay = [...existingTypeSignals(row), String(row.name || "")].join(" ");
      return CAT_ALLOW.family.test(hay) && !CAT_EXCLUDE.family.test(hay);
    },
  },
};
const PRICE_ENUM = ["PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"];

export function distMeters(aLat, aLng, bLat, bLng) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (bLat - aLat) * toR, dLng = (bLng - aLng) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toR) * Math.cos(bLat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// A wf_inventory row -> the raw Google Places (New) resource shape that
// restToPlace()/normalize() in lib/google.js already consume, so the client
// renders an inventory-served place identically to a live Google result.
export function invRowToPlace(r) {
  const s = r.signals || {};
  const out = {
    id: r.place_id,
    displayName: { text: r.name },
    location: { latitude: r.lat, longitude: r.lng },
    rating: typeof s.rating === "number" ? s.rating : null,
    userRatingCount: typeof s.reviews === "number" ? s.reviews : 0,
    types: existingTypeSignals(r),
    businessStatus: r.status || "OPERATIONAL",
    _wfInventory: true, // provenance marker (source = owned inventory, not live Google)
  };
  if (r.primary_type) out.primaryType = r.primary_type;
  if (Array.isArray(r.cuisines)) out.cuisines = r.cuisines;
  if (typeof s.priceNum === "number" && PRICE_ENUM[s.priceNum]) out.priceLevel = PRICE_ENUM[s.priceNum];
  if (r.editorial) out.editorialSummary = { text: r.editorial };
  // Runtime inventory photos — wf_inventory.photo_ref / photo_url (and the
  // same keys on signals). Organic landings must KEEP these. Stripping them
  // is what sent every /nightlife/parrish card to a Pexels pub sign.
  if (r.photo_ref) {
    out.photos = [{ name: r.photo_ref }];
    out.photo_ref = r.photo_ref;
  }
  const ownedUrl = r.photo_url || r.photoUrl || s.photo_url || s.photoUrl || null;
  if (ownedUrl) out.photo_url = ownedUrl;
  return out;
}

// PURE: given inventory rows, keep the operational ones within the radius, rank
// by quality with a light proximity nudge (the client re-ranks anyway), and
// return the top n mapped into the Google shape. Separated from the fetch so it
// is unit-testable.
export function rankInventory(rows, lat, lng, radiusM, n) {
  const gate = (radiusM || 27000) * 1.15;
  const scored = [];
  for (const row of rows || []) {
    if (row.lat == null || row.lng == null) continue;
    if (!isOperational(row)) continue; // never serve a closed place — ONE definition, lib/businessStatus.js
    // v6.16: a row the classifier excluded (a residence, a parking lot, a trade
    // business, a scraped short-term rental) is never served. Read defensively:
    // `excluded` is undefined until the owner applies supabase/inventory-repair.sql,
    // and `undefined !== true`, so this is a no-op until the column exists.
    if (row.excluded === true) continue;
    // v6.40 (owner directive): an unenriched row — no real rating signals —
    // is NEVER served into a ranked list. It would reach the app as a named
    // card with no Wayfind Score (the "second-guess" card class). It stays in
    // owned inventory until enrichment writes its signals; then it competes
    // like everything else. scripts/test-card-gate.mjs locks this behavior.
    const _sr = row.signals || {};
    if (!(typeof _sr.rating === "number" && _sr.rating > 0)) continue;
    const d = distMeters(lat, lng, row.lat, row.lng);
    if (d > gate) continue;
    const s = row.signals || {};
    const rating = typeof s.rating === "number" ? s.rating : 0;
    const reviews = typeof s.reviews === "number" ? s.reviews : 0;
    const distMi = d / 1609.34;
    const distPenalty = distMi <= 4 ? 0 : Math.min((distMi - 4) * 1.3, 30);
    // v8.60 - RANK BY THE SCORE THE CARD SHOWS.
    //
    // This was `rating * 20 + Math.min(reviews, 2000) / 100`, which is not the
    // Wayfind Score and does not behave like it. Rating carried 100 of the
    // ~120 points and review count at most 20, so a 5.0 from FOUR reviews
    // scored 100.04 - level with a 5.0 backed by three thousand, and ahead of
    // a proven 4.6. Owner screenshot, Parrish > Family > Kids, 2026-08-26:
    // "Renaissance Event Center", 4 reviews, sitting in a kids list.
    //
    // The Bayesian blend exists precisely to stop that: few reviews are pulled
    // toward the 3.9 baseline, so a thin 5.0 cannot outrank a proven 4.6. It is
    // also the number the card renders, which makes this cut agree with what
    // the reader is about to compare - "ranked by the Wayfind Score, everywhere,
    // every time" was true of the chip and not of the shelf it was chosen from.
    //
    // Unrated rows score 0 rather than null. Measured: they are already dropped
    // upstream of this rank, so the 0 is a floor that can never be reached
    // rather than a tail slot - either way an unrated place cannot outrank a
    // rated one on a phantom number.
    //
    // Scale note: distPenalty is capped at 30 and was tuned for 0-100 (see
    // lib/wayfindScore.js's header on the landing.js scale bug). It was being
    // applied against a ~120-point range here; on the Wayfind Score it is
    // finally on the range it was designed for.
    const wf = wayfindScore(rating, reviews);
    scored.push({ row, score: (wf == null ? 0 : wf) - distPenalty });
  }
  scored.sort((a, b) => b.score - a.score);
  // n is the CALLER's cost bound, not a merchandising ceiling. A hidden 50
  // here is how v8.49's café fix still hid 71 of 111 Parrish cafés — the
  // identity ran, then this slice threw the tail away. Owner 2026-08-22:
  // no card cap. A Google-fallback caller that passes 20 still gets 20.
  const take = Math.max(1, Number(n) || 20);
  return scored.slice(0, take).map((x) => invRowToPlace(x.row));
}

// Fetch the category's inventory and rank it near a point. Returns [] on any
// problem (a bad category, no Supabase env, a read error) so the caller falls
// through to the stale cache — never throws.
/**
 * v8.49 — THE NARROW CHIP MUST FILTER BEFORE THE CAP, NOT AFTER IT.
 *
 * Owner, repeatedly and for a long time: "the cafes are still not working."
 * Food > Cafés in Parrish rendered "Nothing here right now" while the data was
 * never the problem — MEASURED: 652 food rows within 17mi of Parrish, of which
 * `placeAllowed("food","cafes")` admits **111**.
 *
 * The mechanism, and it is an ORDERING bug:
 *
 *   1. free mode (v8.48) cannot render an unowned Google row — it carries no
 *      rating under TEXT_PRO_MASK — so a café query legitimately falls back to
 *      OWNED INVENTORY. Correct, and v8.48's fix.
 *   2. that fallback asked for the whole CATEGORY: serveFromInventory("food").
 *   3. rankInventory scored `rating*20 + reviews/100` (v8.60: now the
 *      Wayfind Score) and returns the TOP 50.
 *      Across all food near Parrish those 50 slots go to big-review restaurants.
 *      Measured on the live pool: **0 of the top 50 are cafés.**
 *   4. only THEN does the chip filter run, on a list with no cafés in it.
 *
 * So the chip filtered a shelf it was never on. Passing `sub` here moves the
 * contract in front of the cap: the 50 slots are competed for by cafés only.
 *
 * MEASURED COUNTERFACTUAL, which is why the other candidate fix was rejected:
 * the documented `limit=1000`-with-no-geo-bound truncation costs 81% of nearby
 * cafés (111 -> 21) and is a real bug, but fixing it ALONE still yields 0 cards,
 * because the cap-before-filter happens either way. Both are fixed here.
 *
 * `sub` is optional and unknown subs are ignored, so every existing caller is
 * unchanged.
 *
 * 2026-09-23 — THE CAP-BEFORE-FILTER BUG'S SURVIVING SIBLING: THE READ ITSELF
 * WAS STILL CAPPED. v8.49 (above) fixed the ORDER (filter before rank), but the
 * fetch it filters was still `limit=1000` with no `order=` — an ARBITRARY
 * thousand of the box's rows, in Postgres heap order, reshuffled by the next
 * UPDATE. Sentinel: Ryan's Coffee House, Parrish (ChIJo_IdHf0lw4gRHDbQNKBRE84),
 * Food > Cafés — a real, operational, 4.9★/205-review café 3.2mi from center —
 * sat past row 1,000 of 1,598 food rows in the box and was silently never read,
 * so it could not be filtered OR ranked. No amount of reordering the filter and
 * the cap fixes a bug in what gets fetched before either of them runs.
 *
 * The fix is `lib/ownedPool.js`'s `readOwnedCategory`: `order=place_id.asc` +
 * `Range` paging to EXHAUSTION (bounded only by a runaway `maxRows`, reported
 * rather than silently eaten), which this function now calls instead of
 * building its own single capped fetch. See `serveFromInventoryUncached` below
 * for the full read → filter → rank → page pipeline; `rankInventory` and
 * `invRowToPlace` are unchanged — only what is fetched before they run.
 */
export async function serveFromInventory(cat, lat, lng, radiusM, n, sub, options = {}) {
  cat = String(cat || "").toLowerCase();
  const subIdEarly = String(sub || "").toLowerCase();
  // Activities → Beaches lives on wf_inventory category=beach. Inlined so
  // this file does not import browseInventory (homepage-reachable via the
  // Exploding rail until that import was cut).
  const libraryCat = cat === "attractions" && subIdEarly === "beaches" ? "beach" : cat;
  const virtual = VIRTUAL_CATS[libraryCat] || VIRTUAL_CATS[cat] || null;
  const physical = virtual ? virtual.base : (CATS.has(libraryCat) ? libraryCat : cat);
  if (!CATS.has(physical) || !isFinite(lat) || !isFinite(lng)) {
    if (options.failLoud) throw new Error("Inventory request is invalid");
    return [];
  }
  // options.env — hermetic-test escape hatch (2026-09-23): a caller that
  // already has a {url,key} pair (a guard driving a fake PostgREST) skips the
  // real serverCache lookup entirely. No production caller sets this; sbEnv()
  // stays the lazy default so this module stays test-importable in bare Node.
  let s = options.env || null;
  if (!s) {
    const { sbEnv } = await import("./serverCache.js"); // lazy: keeps this module test-importable
    s = sbEnv();
  }
  if (!s) {
    if (options.failLoud) throw new Error("Inventory configuration is unavailable");
    return [];
  }
  // WO8 (2026-09-02) — per-compute read memoization. When the caller supplies
  // a cache (lib/inventoryReadCache.js, one instance per railMenuData() call),
  // an identical (physical category, box, radius, n, sub, skip-editorial)
  // request within the same compute hits the network once — including two
  // concurrent callers in the same Promise.all wave, since the CACHE HOLDS THE
  // PROMISE, not just the resolved rows. Every other caller (no readCache
  // supplied) is byte-for-byte unchanged.
  if (options.readCache && typeof options.readCache.get === "function") {
    // Trailing `:offset:withMeta` — added 2026-09-23 alongside those two new
    // options. Every existing caller passes neither (offset defaults to 0,
    // withMeta to false), so this key is BYTE-IDENTICAL to before for them —
    // including lib/inventoryBoxBatch.js's consolidated prime, which writes
    // this exact key shape (see its own `:0:1` suffix, updated to match) and
    // must keep landing a cache HIT for the common case.
    const key = `srv:${physical}:${Number(lat).toFixed(4)}:${Number(lng).toFixed(4)}:${radiusM}:${n}:${subIdEarly}:${options.primaryOnly ? 1 : 0}:${options.skipEditorial ? 1 : 0}:${Number(options.offset) || 0}:${options.withMeta ? 1 : 0}`;
    return options.readCache.get(key, () => serveFromInventoryUncached(cat, physical, virtual, lat, lng, radiusM, n, sub, options, s));
  }
  return serveFromInventoryUncached(cat, physical, virtual, lat, lng, radiusM, n, sub, options, s);
}

// v8.49's box math, extracted so a consolidated/batched reader (WO8b,
// lib/inventoryBoxBatch.js) can compute the EXACT box a per-call read would
// have used without re-deriving the formula in a second place that could
// drift from this one. Pure refactor — serveFromInventoryUncached below now
// calls this instead of inlining it; the numbers are unchanged.
export function boxForRadius(lat, lng, radiusM) {
  const _mi = (Number(radiusM) || 27000) / 1609.34 * 1.15 + 1;
  const _dLat = _mi / 69;
  const _dLng = _mi / Math.max(5, 69 * Math.cos((lat * Math.PI) / 180));
  return { minLat: lat - _dLat, maxLat: lat + _dLat, minLng: lng - _dLng, maxLng: lng + _dLng };
}

// The lean (no `editorial`) select-field list a bulk pool read uses — pulled
// out so lib/inventoryBoxBatch.js's consolidated reads request literally the
// same columns as an individual serveFromInventory(..., {skipEditorial:true})
// call would have, with no risk of the two lists drifting apart.
//
// 2026-09-23 — now also the field list the EXHAUSTIVE bulk read always uses
// (see readExhaustiveRows below), regardless of options.skipEditorial. Rows
// can now number in the thousands (Tampa food: 4,482+) instead of a capped
// 1,000, so hauling `editorial` — a long free-text column, measured up to
// ~1MB per 1,000-row page — for every row in the box, most of which never
// ship, is the exact cost lib/ownedPool.js's header warns against. `editorial`
// is hydrated back on AFTER ranking, for the served rows only — see
// hydrateEditorialFor below, called from serveFromInventoryUncached.
export const LEAN_INVENTORY_FIELDS = "place_id,name,lat,lng,category,secondary_categories,primary_type,google_types,cuisines,status,excluded,signals,photo_ref";

// Runaway guard on the exhaustive read, never a merchandising cut — mirrors
// lib/ownedPool.js's OWNED_POOL_MAX_ROWS, sized up because a single-point
// serveFromInventory box can be wider than ownedPool's per-surface radius
// (e.g. the browse feed's up-to-60mi ladder). Measured real boxes stay well
// under this (Tampa food ~75mi: 4,482 rows); it exists so a future metro's
// library cannot turn one cold request into an unbounded page-walk.
export const INVENTORY_SERVE_MAX_ROWS = 10000;

// Total budget for the WHOLE paged read (every page, every retry), not a
// per-page ceiling — bounds a multi-page read to inside the ~9-10s function
// deadline the callers of this module already assume (lib/fetchDeadline.js's
// header). A per-page deadline alone cannot do this: N pages at the per-page
// ceiling each is N times the ceiling.
export const INVENTORY_SERVE_TOTAL_BUDGET_MS = 9000;

// ONE retry per page, inside the total budget — a single dropped/aborted page
// must not turn a real café into a silent gap the way the old un-paged,
// un-retried single fetch could. Retries on a thrown error (network/timeout)
// or a 5xx; the "missing secondary_categories column" 400 is handled by
// readOwnedCategory itself (a URL swap, not a retry) and is left alone here.
async function fetchPageWithRetry(doFetch, url, init, ms) {
  let res;
  try {
    res = await doFetch(url, init, ms);
  } catch {
    return doFetch(url, init, ms); // one retry; a second failure propagates
  }
  if (res && res.ok) return res;
  if (res && res.status >= 500) {
    try { return await doFetch(url, init, ms); } catch { return res; }
  }
  return res;
}

/**
 * The exhaustive, ordered, paged read for one physical category's box —
 * EVERY row, not an arbitrary thousand — with the VIRTUAL filter (family,
 * etc.) already applied, since that filter is deterministic and does not
 * depend on `sub`. This is the piece that can be shared across several
 * `sub` values of the same physical category (see the readCache branch
 * below): the box read is identical whether the caller asked for
 * nightlife:speakeasy, nightlife:music or nightlife:clubs, and only the chip
 * filter that runs AFTER this differs.
 *
 * Throws (never returns []) on a page failure or a malformed body — the
 * caller (serveFromInventoryUncached) is what decides failLoud-vs-empty, so
 * a shared cached read fails the same way for every sub sharing it.
 */
async function readExhaustiveRows(s, physical, cat, virtual, box, options) {
  const doRead = async () => {
    const { readOwnedCategory } = await import("./ownedPool.js"); // lazy: see file header
    const pageSize = Number(options.pageSize) > 0 ? Number(options.pageSize) : 1000;
    const maxRows = Number.isFinite(options.maxRows) && options.maxRows > 0 ? options.maxRows : INVENTORY_SERVE_MAX_ROWS;
    const perPageMs = Number.isFinite(options.deadlineMs) && options.deadlineMs > 0 ? options.deadlineMs : DB_DEADLINE_MS;
    const totalMs = Number.isFinite(options.totalDeadlineMs) && options.totalDeadlineMs > 0 ? options.totalDeadlineMs : INVENTORY_SERVE_TOTAL_BUDGET_MS;
    const deadlineAt = Date.now() + totalMs;
    const baseFetch = options.fetchImpl || fetchDeadline;
    const result = await readOwnedCategory(s, physical, box, {
      fields: LEAN_INVENTORY_FIELDS,
      primaryOnly: options.primaryOnly,
      pageSize,
      maxRows,
      deadlineMs: perPageMs,
      deadlineAt,
      fetchImpl: (url, init, ms) => fetchPageWithRetry(baseFetch, url, init, ms),
    });
    const rawCount = Array.isArray(result.rows) ? result.rows.length : 0;
    let rows = result.rows || [];
    if (virtual) rows = rows.filter((row) => { try { return virtual.keep(row); } catch { return false; } });
    return { rows, truncated: !!result.truncated, pages: Math.max(1, Math.ceil(rawCount / pageSize)) };
  };
  if (options.readCache && typeof options.readCache.get === "function") {
    // Keyed WITHOUT `sub`/`n`/`radiusM` on purpose (box already encodes
    // lat/lng/radiusM): the box + virtual filter are all this step decides,
    // so nightlife:speakeasy, nightlife:music and nightlife:clubs from the
    // same origin/radius share ONE paged network read instead of three.
    // `cat` only enters the key when a virtual mapping is in play (e.g.
    // family vs plain attractions both physical "attractions" but different
    // post-read filters) — see VIRTUAL_CATS above.
    const key = `rows:${physical}:${virtual ? cat : "-"}:${box.minLat.toFixed(4)},${box.maxLat.toFixed(4)},${box.minLng.toFixed(4)},${box.maxLng.toFixed(4)}:${options.primaryOnly ? 1 : 0}:lean`;
    return options.readCache.get(key, doRead);
  }
  return doRead();
}

async function serveFromInventoryUncached(cat, physical, virtual, lat, lng, radiusM, n, sub, options, s) {
  // v8.49 — GEO-BOUND THE READ, still true and still the box readOwnedCategory
  // pages inside. The bounding box is the radius plus rankInventory's own 1.15
  // gate, converted at 69mi per degree of latitude and shrunk by cos(lat) for
  // longitude, so it can never cut inside the distance filter that follows.
  const box = boxForRadius(lat, lng, radiusM);
  const offset = Math.max(0, Math.floor(Number(options.offset) || 0));
  const emptyMeta = () => ({ eligible: 0, served: 0, offset, truncated: false, pages: 0 });

  let rows, truncated, pages;
  try {
    ({ rows, truncated, pages } = await readExhaustiveRows(s, physical, cat, virtual, box, options));
  } catch (error) {
    if (options.failLoud) throw error;
    return options.withMeta ? { places: [], meta: emptyMeta() } : [];
  }
  // AN INCOMPLETE READ IS NOT A NORMAL ANSWER (same law as lib/ownedPool.js's
  // fetchOwnedPool — see its 2026-09-06 header). INVENTORY_SERVE_MAX_ROWS is a
  // runaway guard, not a merchandising cut: hitting it means real rows were
  // left unread, so a caller that asked to fail loud gets an error rather than
  // a confident partial list, and every other caller gets the partial answer
  // PLUS a loud console.error — never a silent truncation.
  if (truncated) {
    const msg = `serveFromInventory: ${physical} read hit its row cap and is INCOMPLETE (box=${JSON.stringify(box)}, primaryOnly=${!!options.primaryOnly})`;
    if (options.failLoud) throw new Error(msg);
    console.error(msg);
  }

  // v8.49 — THE CHIP CONTRACT RUNS BEFORE THE CAP. rankInventory returns the
  // top N by score; applying the sub filter afterwards means a narrow chip
  // competes against the whole category for those slots and loses every time
  // (0 of the top 50 food rows near Parrish are cafés). Filtering here lets
  // the cap be spent on rows that can actually appear under the chip.
  //
  // Shaped for placeAllowed, which reads `types`/`primary_type`/`name` — the
  // raw inventory row calls its type list `google_types`. Fail-open on an
  // unknown sub: an unrecognised chip must not empty a category.
  const subId = String(sub || "").toLowerCase();
  if (subId && subId !== "all") {
    // Filter against the CHIP the user tapped, not the physical column.
    // Family → Rainy day is family:rainy (physical is attractions);
    // Activities → Beaches is attractions:beaches (physical is beach).
    // Using physical:sub skipped both contracts and ranked Ca' d'Zan.
    const key = `${cat}:${subId}`;
    // Lazy: chipIdentity must never be a top-level import. explodingNearby
    // used to pull this module into the homepage chunk; a static import
    // of chipIdentity was the 0.2KB that put CI at 496.2 > 496.
    const { chipIdentity, CHIP_IDENTITY } = await import("./chipIdentity.js");
    if (CHIP_IDENTITY[key] || SUB_ALLOW[key]) {
      rows = (rows || []).filter((row) => {
        try {
          return chipIdentity(cat, subId, {
            name: row.name, types: row.google_types || [],
            primary_type: row.primary_type, primaryType: row.primary_type,
            category: row.category,
          });
        } catch { return true; }
      });
    }
  }

  // THE FULL DETERMINISTIC RANK, ONCE. rankInventory is UNCHANGED — called
  // here with an unbounded n so it returns every eligible row in score order,
  // which is exactly what a plain `rankInventory(rows, lat, lng, radiusM, n)`
  // call would produce as its own internal `scored` array before its own
  // `n`-cap slice. `offset`/`n` below page over this SAME deterministic order,
  // so two successive pages are disjoint and their union is the full set —
  // never a second independent (and possibly differently-ordered) rank.
  const fullRanked = rankInventory(rows, lat, lng, radiusM, Infinity);
  const eligible = fullRanked.length;
  const take = Math.max(1, Number(n) || 20);
  const served = fullRanked.slice(offset, offset + take);

  // Editorial, hydrated AFTER the rank, for the SERVED rows only — see
  // LEAN_INVENTORY_FIELDS above for why the bulk read never carries it.
  // options.skipEditorial callers (railsData.js's pool builders) hydrate it
  // themselves for their own final shipped set and must not pay for it twice.
  if (!options.skipEditorial && served.length) {
    try {
      const editorialById = await hydrateEditorialFor(served.map((p) => p.id), {
        deadlineMs: Number.isFinite(options.deadlineMs) && options.deadlineMs > 0 ? options.deadlineMs : DB_DEADLINE_MS,
      });
      for (const place of served) {
        const text = editorialById.get(place.id);
        if (text) place.editorialSummary = { text };
      }
    } catch { /* editorial is enrichment, never a reason to blank a served row */ }
  }

  if (options.withMeta) {
    return { places: served, meta: { eligible, served: served.length, offset, truncated, pages } };
  }
  return served;
}

/**
 * WO8 (2026-09-02) — the OTHER half of options.skipEditorial. One
 * place_id=in.(...) read for `editorial` ONLY, for the exact set of ids that
 * survived every pool cut and are about to ship on a rail. lib/railsData.js's
 * loadRailPlaces calls this ONCE per compute, after fillRails has decided the
 * final 15-rail set — the pattern lib/inventoryServe.js already carried for
 * exact-id reads (serveInventoryByPlaceIds, above/below), narrowed to the one
 * column this call needs rather than `select=*`.
 *
 * Returns a Map<place_id, string|null>. Never throws; a failure degrades to
 * an empty map (every shipped row keeps whatever editorial it already had —
 * null, if the bulk read that found it skipped the column), never a blank
 * rail.
 */
export async function hydrateEditorialFor(placeIds, options = {}) {
  const ids = [...new Set((placeIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  const out = new Map();
  if (!ids.length) return out;
  try {
    const { sbEnv } = await import("./serverCache.js");
    const s = sbEnv();
    if (!s) return out;
    const headers = { apikey: s.key, Authorization: `Bearer ${s.key}` };
    const deadlineMs = Number.isFinite(options.deadlineMs) && options.deadlineMs > 0
      ? options.deadlineMs
      : DB_DEADLINE_MS;
    // PostgREST's `in.()` list has a practical URL-length ceiling; chunk so a
    // rail-menu compute with an unusually large shipped set never 414s.
    // WO8b (2026-09-02) — round trips are the clock, so this only chunks past
    // 300 ids now (was 200); a single in.() list of a few hundred ids is well
    // inside PostgREST's real ceiling.
    const CHUNK = 300;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const list = chunk.map(encodeURIComponent).join(",");
      const url = `${s.url}/rest/v1/wf_inventory?select=place_id,editorial&place_id=in.(${list})&limit=${chunk.length}`;
      const r = await fetchDeadline(url, { headers, cache: "no-store" }, deadlineMs);
      if (!r.ok) continue;
      for (const row of await r.json()) {
        if (row && row.place_id) out.set(row.place_id, row.editorial || null);
      }
    }
  } catch { /* best-effort — shipped rows keep whatever editorial they already had */ }
  return out;
}

/**
 * Load a small governed set by exact Place ID. Birthday rewards use this
 * instead of hoping a Starbucks or beauty store happens to survive the top-N
 * cut of six broad categories. Identity and distance still run through the
 * same inventory mapper/ranker as every other owned card.
 */
export async function serveInventoryByPlaceIds(placeIds, lat, lng, radiusM, options = {}) {
  const ids = [...new Set((placeIds || []).map((id) => String(id || "").trim()).filter(Boolean))].slice(0, 100);
  if (!ids.length || !isFinite(lat) || !isFinite(lng)) {
    if (options.failLoud) throw new Error("Exact inventory request is invalid");
    return [];
  }
  const { sbEnv } = await import("./serverCache.js");
  const s = sbEnv();
  if (!s) {
    if (options.failLoud) throw new Error("Inventory configuration is unavailable");
    return [];
  }
  const headers = { apikey: s.key, Authorization: `Bearer ${s.key}` };
  const list = ids.map(encodeURIComponent).join(",");
  const url = `${s.url}/rest/v1/wf_inventory?select=*&place_id=in.(${list})&limit=${ids.length}`;
  const deadlineMs = Number.isFinite(options.deadlineMs) && options.deadlineMs > 0
    ? options.deadlineMs
    : DB_DEADLINE_MS;
  try {
    const response = await fetchDeadline(url, { headers, cache: "no-store" }, deadlineMs);
    if (!response.ok) throw new Error(`Exact inventory read returned ${response.status}`);
    const rows = await response.json();
    const places = rankInventory(rows, lat, lng, radiusM, ids.length);
    // Exact-ID consumers with an older cache fallback need to distinguish
    // absent inventory from a known row rejected by our current safety gates.
    return options.withKnownIds ? { places, knownIds: rows.map((row) => row.place_id) } : places;
  } catch (error) {
    if (options.failLoud) throw error;
    return [];
  }
}
