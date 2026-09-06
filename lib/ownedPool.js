// lib/ownedPool.js — SERVER-ONLY. ONE DEFINITION OF "READ THE OWNED LIBRARY
// COMPLETELY, THEN ASK WHO QUALIFIES."
//
// THE FAILURE CLASS. lib/browseInventory.js named it first:
//
//     "identity ∩ anchor top-N is thin BY CONSTRUCTION"
//
// A surface reads a BROAD owned category, keeps the highest-scoring N, and only
// THEN asks the narrow question — is this a dinner show, a Cuban lunch counter,
// a pickleball court, a private dining room. The narrow set competes against the
// whole category for those N slots and loses every time, so the rail is thin and
// the data was never the problem. It has now been found and fixed six times
// under six different names (cafés v8.49, breakfast v8.18, browse chips v8.50,
// events v8.19, Night Out v8.97) and each fix was local to one surface.
//
// THERE ARE ALWAYS TWO CUTS, and the upstream one is worse:
//
//   1. THE READ. lib/inventoryServe.js issues `&limit=1000` with a bounding box
//      and NO `order=`. When the box holds more rows than that, PostgREST
//      returns an arbitrary thousand in Postgres HEAP ORDER, which any UPDATE
//      reshuffles. Measured near Parrish, 27 miles: food 2,417 rows and
//      attractions 1,440 — so both are already truncated, nondeterministically,
//      before anything downstream gets a vote.
//   2. THE RANK CAP. rankInventory() then slices the top N by Wayfind Score.
//
// RAISING EITHER NUMBER IS NOT THE FIX — it enlarges the lottery. The ORDER is
// the bug. This module is the shape that cannot have it:
//
//     every owned row in the box, deterministically and exhaustively
//       → universal serviceability gates (open · not excluded · actually rated)
//       → the surface's EXACT radius (no 1.15 slack)
//       → the surface's REAL identity predicate, INJECTED and CALLED
//       → and only then the caller's ranking and output bound
//
// WHAT IT REFUSES TO DO, on purpose:
//   · own an opinion about identity. `identity` is injected by the caller and is
//     the surface's real, already-shipped predicate. A second copy of "what
//     counts as a beach" living in a retrieval helper is how a rail quietly
//     widens to look fuller.
//   · call any paid provider. This is owned inventory; depth costs a database
//     round trip and nothing else.
//   · reach past the caller's radius for a thin rail.
//   · read leanly by default. The predicates match on name + types + editorial,
//     so dropping a column here would cure candidate starvation by causing
//     evidence starvation — a lateral move that leaves every guard green.
//
// WHY NOT WIDEN serveFromInventory() INSTEAD: that helper serves cafés, hotels,
// Family, the Google-429 fallback and the category pages, and its 1.15 distance
// gate and top-N cut are load-bearing history for those callers. It stays as it
// is. Surfaces whose question is narrow come here instead.
import { boxForRadius } from "./inventoryServe.js";
import { isOperational } from "./businessStatus.js";
import { fetchDeadline, DB_DEADLINE_MS } from "./fetchDeadline.js";

/** PostgREST page size. A cost bound on ONE round trip, never a shelf size. */
export const OWNED_POOL_PAGE = 1000;

/**
 * Hard stop on rows read per category, so a future metro with 40,000 owned rows
 * cannot turn one cache miss into a minute of paging. Deliberately far above the
 * largest real category in a box today (food near Parrish: 2,417), so it is a
 * runaway guard rather than a merchandising cut — and when it does bite the
 * caller is TOLD (`truncated`) instead of quietly being served a slice.
 */
export const OWNED_POOL_MAX_ROWS = 6000;

/**
 * Everything a shipped identity predicate reads, plus what a card renders.
 * `editorial` is included ON PURPOSE and must stay — see the header.
 */
export const OWNED_POOL_FIELDS =
  "place_id,name,lat,lng,category,secondary_categories,primary_type,google_types,cuisines,status,excluded,signals,editorial,photo_ref";

const MI = 1609.34;

/** PURE. Great-circle miles. */
export function milesBetween(aLat, aLng, bLat, bLng) {
  const toRad = (n) => (n * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * PURE. Is this owned row servable at all?
 *
 * The three row-level refusals rankInventory() applies, restated here because
 * this reader deliberately does NOT go through rankInventory (whose 1.15
 * distance gate belongs to its own general role). Keeping them identical
 * matters: a row this file admits and that file would refuse is a row one
 * surface shows and no other does.
 *   · not operational  — never serve a closed place
 *   · excluded         — the classifier already rejected it
 *   · no real rating   — an unenriched row has no Wayfind Score to rank by and
 *                        would render as a card with no number
 */
export function isServableRow(row) {
  if (!row || row.lat == null || row.lng == null) return false;
  if (!isOperational(row)) return false;
  if (row.excluded === true) return false;
  const rating = row.signals && row.signals.rating;
  return typeof rating === "number" && rating > 0;
}

/**
 * PURE. An owned row -> the neutral shape every Wayfind identity predicate and
 * card already reads. A caller whose predicate wants a different shape passes
 * its own `toPlace`; this is the shape the composers converged on.
 */
export function rowToOwnedPlace(row, origin, editorialOverride) {
  const id = String(row?.place_id || "");
  const name = String(row?.name || "").trim();
  const lat = Number(row?.lat);
  const lng = Number(row?.lng);
  if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const s = row.signals || {};
  const curated = typeof editorialOverride === "function" ? editorialOverride(id) : null;
  return {
    id, name, lat, lng,
    rating: typeof s.rating === "number" ? s.rating : null,
    reviews: typeof s.reviews === "number" ? s.reviews : 0,
    types: Array.isArray(row.google_types) ? row.google_types : [],
    primaryType: row.primary_type || null,
    category: row.category || null,
    cuisines: Array.isArray(row.cuisines) ? row.cuisines : [],
    priceLevel: s.priceNum != null ? s.priceNum : null,
    editorial: curated || row.editorial || null,
    photoRef: row.photo_ref || null,
    photo: s.photo_url || s.photoUrl || null,
    distMi: Math.round(milesBetween(origin.lat, origin.lng, lat, lng) * 10) / 10,
    _wfInventory: true,
  };
}

/**
 * PURE, and this is the whole architectural point: ADMISSION BEFORE THE CAP.
 *
 * Given raw owned rows, keep the ones that are servable, exactly within maxMi,
 * and that the caller's REAL predicate claims. Exported separately from the
 * fetch so a guard can drive it over a synthetic corpus with no network —
 * including a corpus where the qualifying candidate deliberately sits below the
 * old cut-offs.
 *
 * `identity` returns anything truthy to admit (a rail id, `true`, a bucket
 * name); the truthy value is returned in `byIdentity` so a caller that buckets
 * does not have to run the predicate a second time. A predicate that throws
 * refuses the row rather than the request — one malformed row must not blank a
 * surface.
 */
export function admitOwnedRows(rows, origin, opts = {}) {
  const maxMi = Number(opts.maxMi);
  if (!Number.isFinite(maxMi) || maxMi <= 0) throw new Error("admitOwnedRows needs an explicit maxMi");
  const identity = typeof opts.identity === "function" ? opts.identity : null;
  const toPlace = typeof opts.toPlace === "function" ? opts.toPlace : rowToOwnedPlace;
  const editorialOverride = opts.editorialOverride || null;
  const out = [];
  const byIdentity = new Map();
  const seen = new Set();
  const stats = { rows: 0, servable: 0, withinRadius: 0, qualified: 0 };
  for (const row of Array.isArray(rows) ? rows : []) {
    stats.rows++;
    if (!isServableRow(row)) continue;
    stats.servable++;
    // THE RADIUS IS MEASURED, NOT READ OFF THE CARD (owner review, 2026-09-06).
    //
    // This used to test `place.distMi <= maxMi`, and every mapper rounds distMi
    // to one decimal for display. So a row at 27.0498 miles renders "27" and was
    // ADMITTED under a 27-mile law — measured, up to ~0.05mi / 260ft of overreach.
    // Small in feet and not small in kind: Night Out tells the reader "the only
    // place within 27 miles that clears this", and that sentence has to be true.
    //
    // It also made admission depend on the caller's mapper, which is exactly
    // backwards. Four routes pass their own toPlace; a law that reads a field
    // they compute is a law each of them could change by accident. The distance
    // now comes from the ROW's own coordinates, so the mapper cannot reach it —
    // and the rounded value stays on the place, for the card.
    const rowLat = Number(row.lat);
    const rowLng = Number(row.lng);
    if (!Number.isFinite(rowLat) || !Number.isFinite(rowLng)) continue;
    if (!(milesBetween(origin.lat, origin.lng, rowLat, rowLng) <= maxMi)) continue;
    const place = toPlace(row, origin, editorialOverride);
    if (!place) continue;
    stats.withinRadius++;
    let claim = true;
    if (identity) {
      try { claim = identity(place); } catch (e) { claim = null; }
      if (!claim) continue;
    }
    if (seen.has(place.id)) continue;
    seen.add(place.id);
    stats.qualified++;
    out.push(place);
    if (!byIdentity.has(claim)) byIdentity.set(claim, []);
    byIdentity.get(claim).push(place);
  }
  return { places: out, byIdentity, stats };
}

/**
 * Read EVERY owned row of one category inside the box, deterministically.
 *
 * `order=place_id.asc` is the fix for the upstream half of the bug: without an
 * ORDER BY, `limit=1000` returns an arbitrary thousand in heap order and the
 * SAME query returns a different thousand after any UPDATE. With it, paging is
 * stable and exhaustive — page N is genuinely the next N rows, and two runs
 * agree.
 *
 * No count round trip: it pages until a SHORT page arrives, which is one fewer
 * request than asking how many there are first.
 */
export async function readOwnedCategory(env, category, box, opts = {}) {
  const fields = opts.fields || OWNED_POOL_FIELDS;
  const page = Number(opts.pageSize) > 0 ? Number(opts.pageSize) : OWNED_POOL_PAGE;
  const maxRows = Number(opts.maxRows) > 0 ? Number(opts.maxRows) : OWNED_POOL_MAX_ROWS;
  const geo = `&lat=gte.${box.minLat.toFixed(4)}&lat=lte.${box.maxLat.toFixed(4)}`
    + `&lng=gte.${box.minLng.toFixed(4)}&lng=lte.${box.maxLng.toFixed(4)}`;
  const base = `${env.url}/rest/v1/wf_inventory?select=${fields}${geo}&order=place_id.asc`;
  const withSecondary = `${base}&or=(category.eq.${category},secondary_categories.cs.{${category}})`;
  const plain = `${base}&category=eq.${category}`;
  const headers = { apikey: env.key, Authorization: `Bearer ${env.key}` };
  const deadlineMs = Number.isFinite(opts.deadlineMs) && opts.deadlineMs > 0 ? opts.deadlineMs : DB_DEADLINE_MS;
  const doFetch = opts.fetchImpl || fetchDeadline;

  const rows = [];
  let url = opts.primaryOnly ? plain : withSecondary;
  let truncated = false;
  for (let from = 0; from < maxRows; from += page) {
    const range = { Range: `${from}-${from + page - 1}`, "Range-Unit": "items" };
    let res = await doFetch(url, { headers: { ...headers, ...range }, cache: "no-store" }, deadlineMs);
    // Pre-migration fallback, same as the shared reader: a database without
    // `secondary_categories` 400s the OR form. Fall back once, then keep the
    // simpler URL for the remaining pages.
    if (!res.ok && url === withSecondary) {
      url = plain;
      res = await doFetch(url, { headers: { ...headers, ...range }, cache: "no-store" }, deadlineMs);
    }
    if (!res.ok) throw new Error(`Owned ${category} read returned ${res.status}`);
    let list;
    try { list = await res.json(); } catch (e) { list = null; }
    // A MALFORMED 200 IS A FAILURE, NOT AN EMPTY TOWN (owner review, 2026-09-06).
    //
    // This used to be `Array.isArray(list) ? list : []`, which turns a PostgREST
    // error object served with a 200, an HTML interstitial from a proxy, or a
    // truncated body into "no places" — indistinguishable from a place with no
    // night life, and cached as a normal answer. Every caller already has a
    // failure path; this hands it to them instead of a plausible blank.
    if (!Array.isArray(list)) {
      throw new Error(`Owned ${category} read returned a ${list === null ? "unparseable" : typeof list} body instead of an array`);
    }
    rows.push(...list);
    if (list.length < page) return { rows, truncated: false };
    if (rows.length >= maxRows) { truncated = true; break; }
  }
  return { rows, truncated };
}

/**
 * The candidate pool for one surface: every owned row within exactly `radiusMi`
 * that the surface's own predicate claims, ready for the caller to rank.
 *
 * Returns `{ places, byIdentity, stats }`. `stats` is the funnel — rows read,
 * servable, within radius, qualified, per category — so a route can log it and
 * a re-measurement does not need a second, drifting implementation to compare
 * against.
 *
 * Throws when every read fails: a caller already treats a failed inventory read
 * as a 503, and an empty array would be indistinguishable from "this town has
 * nothing", which is the lie these rails refuse. One category failing is
 * survivable and is reported as `sourceFailures` — allSettled, not all, because
 * one stalled category must never blank every shelf.
 */
export async function fetchOwnedPool(lat, lng, opts = {}) {
  const radiusMi = Number(opts.radiusMi);
  if (!Number.isFinite(radiusMi) || radiusMi <= 0) throw new Error("fetchOwnedPool needs an explicit radiusMi");
  const categories = Array.isArray(opts.categories) && opts.categories.length ? opts.categories : null;
  if (!categories) throw new Error("fetchOwnedPool needs at least one category");
  const env = opts.env || (await import("./serverCache.js")).sbEnv();
  if (!env) throw new Error("Owned inventory is unconfigured");
  // The BOX is generous (boxForRadius carries the shared reader's 1.15 + 1mi
  // margin); the CUT is exact. A box smaller than the cut would silently shrink
  // the radius, which is the one direction it must never be wrong in.
  const box = boxForRadius(lat, lng, radiusMi * MI);
  const origin = { lat, lng };

  const settled = await Promise.allSettled(categories.map((c) => readOwnedCategory(env, c, box, opts)));
  const reads = settled.filter((r) => r.status === "fulfilled").map((r) => r.value);
  const failures = settled.length - reads.length;
  if (!reads.length) {
    // Carry the first real cause. "All reads failed" with no reason is the kind
    // of log line that costs an hour when the cause was an expired key.
    const why = settled.find((r) => r.status === "rejected");
    throw new Error(`All owned inventory reads failed${why ? `: ${why.reason && why.reason.message ? why.reason.message : why.reason}` : ""}`);
  }

  // AN INCOMPLETE POOL IS NOT A NORMAL ANSWER (owner review, 2026-09-06).
  //
  // OWNED_POOL_MAX_ROWS is a runaway guard, and the first version merely
  // REPORTED hitting it as `stats.truncated`. No route read that flag, so a
  // metro whose library outgrew the cap would have served a partial answer and
  // cached it for an hour like any other — the exact silent-degradation shape
  // this whole change exists to remove, reintroduced one level up.
  //
  // So it throws. A caller that genuinely prefers a partial answer opts in with
  // `allowTruncated`, and then gets `stats.degraded === true` and owes the reader
  // something honest about it. Nothing opts in today; the largest real category
  // measured (Tampa food, 75 miles) is 4,482 rows against a 6,000 cap, so this
  // fires on GROWTH, which is precisely when a silent partial answer would be
  // hardest to notice.
  const truncated = reads.some((r) => r.truncated);
  if (truncated && !opts.allowTruncated) {
    throw new Error(
      `Owned pool hit OWNED_POOL_MAX_ROWS (${Number(opts.maxRows) > 0 ? Number(opts.maxRows) : OWNED_POOL_MAX_ROWS}) reading `
      + `${categories.join("/")} — the pool is incomplete, so identity ran on a slice. Raise the cap for this surface, `
      + `narrow the read, or pass allowTruncated and tell the reader the answer is partial.`,
    );
  }
  const raw = reads.flatMap((r) => r.rows);
  const admitted = admitOwnedRows(raw, origin, {
    maxMi: radiusMi,
    identity: opts.identity,
    toPlace: opts.toPlace,
    editorialOverride: opts.editorialOverride,
  });
  return {
    places: admitted.places,
    byIdentity: admitted.byIdentity,
    stats: {
      ...admitted.stats,
      truncated,
      degraded: truncated,
      sourceFailures: failures,
      perCategory: Object.fromEntries(settled.map((r, i) => [categories[i], r.status === "fulfilled" ? r.value.rows.length : null])),
    },
  };
}
