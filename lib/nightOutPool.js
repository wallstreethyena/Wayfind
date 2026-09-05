// lib/nightOutPool.js — SERVER-ONLY. NIGHT OUT'S OWN OWNED-INVENTORY READER.
//
// THE DEFECT, measured 2026-09-05 near Parrish (scripts/diagnose-night-out-funnel.mjs):
//
//   owned rows in the box      food 2417 · nightlife 415 · attractions 1440
//   the route's read admitted  food  400 · nightlife 368 · attractions  400
//   reached the classifier                                            1168
//   admissible owned rows within 27mi                                 3575
//
// 126 QUALIFYING candidates never got to compete. Not marginal ones: Straz
// Center for the Performing Arts (7,327 reviews), Van Wezel (2,862), Tampa
// Theatre (3,240), Hyde Park Prime Steakhouse, both LALA karaoke rooms, two
// bowling alleys. All owned, all inside 27 miles, all matching a Night Out
// predicate exactly, all invisible.
//
// SAME DISEASE, SIXTH COSTUME. lib/browseInventory.js named it:
// "identity ∩ anchor top-N is thin BY CONSTRUCTION". /api/night-out asked for
// the top 400 of three BROAD categories and only then asked "is this a dinner
// show?" A qualifying row ranked #437 among all food never reached the
// question. THERE ARE TWO CUTS, and the upstream one is worse: the shared
// reader issues its box query with `limit=1000` and NO `order=`, so 2,417 food
// rows yield an arbitrary 1,000 in Postgres heap order that any UPDATE
// reshuffles.
//
// RAISING EITHER NUMBER IS NOT THE FIX. 400→800 and 1000→5000 both just enlarge
// the lottery. The order is the bug: identity BEFORE the cost bound.
//
// WHY A NIGHT-OUT-SPECIFIC READER instead of changing serveFromInventory():
// that helper serves cafés, hotels, Family, the Google-429 fallback and the
// category pages, and its 1.15 distance gate and top-N cut are load-bearing
// history for those callers. Night Out has a STRICTER law than the shared
// helper (exactly 27 miles, no 1.15 slack) and a NARROWER question (ten precise
// predicates). Widening the shared helper to serve one rail's stricter law is
// how a Night Out change silently re-ranks breakfast.
//
// THE ORDER, and every step is a refusal rather than a preference:
//   owned row → operational, not excluded, actually rated
//              → EXACTLY <= 27 miles          (no 1.15 slack; Night Out's own law)
//              → nightOutPlaceRail() identity (the real predicate, called)
//              → the composer's Wayfind Score ranking law
//
// WHAT IT REFUSES TO DO, on purpose:
//   · call any paid provider — this is owned inventory only, so a deeper read
//     costs a database round trip and nothing else
//   · widen a predicate. A waterfront restaurant does not become "Waterfront,
//     Sunset & Night Cruises" because a rail looks thin. nightOutPlaceRail is
//     imported and CALLED; this file does not own a second opinion about
//     membership
//   · reach past 27 miles for a thin rail
//   · drop the evidence the predicates read. The row keeps name, primary_type,
//     google_types AND editorial, and the route's nightOutEditorialEvidence()
//     override still runs first — curing candidate starvation by causing
//     evidence starvation would be a lateral move
import { boxForRadius } from "./inventoryServe.js";
import { isOperational } from "./businessStatus.js";
import { fetchDeadline, DB_DEADLINE_MS } from "./fetchDeadline.js";
import { NIGHT_OUT_MAX_MI, nightOutPlaceRail } from "./nightOutIntent.js";

/** The categories Night Out's candidates actually live under. */
export const NIGHT_OUT_CATEGORIES = Object.freeze(["food", "nightlife", "attractions"]);

/** PostgREST page size. A cost bound on ONE round trip, never a shelf size. */
export const NIGHT_OUT_POOL_PAGE = 1000;

/**
 * Hard stop on rows read per category, so a future metro with 40,000 owned rows
 * cannot turn one cache miss into a minute of paging. It is deliberately far
 * above the largest real category in the box today (food near Parrish: 2,417),
 * so it is a runaway guard rather than a merchandising cut — and when it does
 * bite, the caller is TOLD (`truncated`) instead of quietly serving a slice.
 */
export const NIGHT_OUT_POOL_MAX_ROWS = 6000;

// Everything the ten predicates read, plus what a card renders. `editorial` is
// included ON PURPOSE and must stay: isShow/isLiveMusic/isDateDining and the
// rest match against name + types + editorial, so a lean read would convert
// candidate starvation into evidence starvation.
const FIELDS = "place_id,name,lat,lng,category,secondary_categories,primary_type,google_types,status,excluded,signals,editorial,photo_ref";

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
 * The three row-level refusals rankInventory() applies, restated here rather
 * than imported because this reader deliberately does NOT go through
 * rankInventory (its 1.15 distance gate is wrong for Night Out). Keeping them
 * identical matters: a row this file admits and that file would refuse is a row
 * Night Out shows and no other surface does.
 *   · not operational      — never serve a closed place
 *   · excluded             — the classifier already rejected it
 *   · no real rating       — an unenriched row has no Wayfind Score to rank by,
 *                            and would render as a card with no number
 */
export function isServableRow(row) {
  if (!row || row.lat == null || row.lng == null) return false;
  if (!isOperational(row)) return false;
  if (row.excluded === true) return false;
  const rating = row.signals && row.signals.rating;
  return typeof rating === "number" && rating > 0;
}

/**
 * PURE. An owned row -> the shape nightOutPlaceRail() and the card both read.
 * `editorialOverride` is the route's nightOutEditorialEvidence(id) hook, passed
 * in so this module holds no second copy of that lookup.
 */
export function rowToNightOutPlace(row, origin, editorialOverride) {
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
 * Given raw owned rows, keep the ones that are servable, exactly within
 * maxMi, and that a real Night Out predicate claims. Exported separately from
 * the fetch so a guard can drive it over a synthetic corpus with no network —
 * including a corpus where the qualifying candidate deliberately sits below
 * both of the old cut-offs.
 */
export function admitNightOutRows(rows, origin, opts = {}) {
  const maxMi = Number.isFinite(opts.maxMi) ? opts.maxMi : NIGHT_OUT_MAX_MI;
  const editorialOverride = opts.editorialOverride || null;
  const railOf = typeof opts.railOf === "function" ? opts.railOf : nightOutPlaceRail;
  const out = [];
  const seen = new Set();
  const stats = { rows: 0, servable: 0, withinRadius: 0, qualified: 0 };
  for (const row of Array.isArray(rows) ? rows : []) {
    stats.rows++;
    if (!isServableRow(row)) continue;
    stats.servable++;
    const place = rowToNightOutPlace(row, origin, editorialOverride);
    if (!place) continue;
    // EXACTLY 27 miles. rankInventory's gate is radius x 1.15 (~31mi at 27),
    // which is right for its own general role and wrong here: composeNightOutRails
    // refuses anything past NIGHT_OUT_MAX_MI anyway, so a row between 27 and 31
    // is a candidate that can only ever be discarded later — and, measured, it
    // is also what made the diagnostic's "route" column larger than its "ALL"
    // column for Cocktails (203 vs 202) and briefly look like negative loss.
    if (!(place.distMi <= maxMi)) continue;
    stats.withinRadius++;
    let rail = null;
    try { rail = railOf(place); } catch (e) { rail = null; }
    if (!rail) continue;
    if (seen.has(place.id)) continue;
    seen.add(place.id);
    stats.qualified++;
    out.push(place);
  }
  return { places: out, stats };
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
async function readCategory(env, category, box, opts) {
  const geo = `&lat=gte.${box.minLat.toFixed(4)}&lat=lte.${box.maxLat.toFixed(4)}`
    + `&lng=gte.${box.minLng.toFixed(4)}&lng=lte.${box.maxLng.toFixed(4)}`;
  const base = `${env.url}/rest/v1/wf_inventory?select=${FIELDS}${geo}&order=place_id.asc`;
  const withSecondary = `${base}&or=(category.eq.${category},secondary_categories.cs.{${category}})`;
  const plain = `${base}&category=eq.${category}`;
  const headers = { apikey: env.key, Authorization: `Bearer ${env.key}` };
  const deadlineMs = Number.isFinite(opts.deadlineMs) && opts.deadlineMs > 0 ? opts.deadlineMs : DB_DEADLINE_MS;
  const doFetch = opts.fetchImpl || fetchDeadline;

  const rows = [];
  let url = withSecondary;
  let truncated = false;
  for (let from = 0; from < NIGHT_OUT_POOL_MAX_ROWS; from += NIGHT_OUT_POOL_PAGE) {
    const range = { Range: `${from}-${from + NIGHT_OUT_POOL_PAGE - 1}`, "Range-Unit": "items" };
    let res = await doFetch(url, { headers: { ...headers, ...range }, cache: "no-store" }, deadlineMs);
    // Pre-migration fallback, same as the shared reader: a database without
    // `secondary_categories` 400s the OR form. Fall back once, then keep the
    // simpler URL for the remaining pages.
    if (!res.ok && url === withSecondary) {
      url = plain;
      res = await doFetch(url, { headers: { ...headers, ...range }, cache: "no-store" }, deadlineMs);
    }
    if (!res.ok) throw new Error(`Night Out ${category} read returned ${res.status}`);
    const page = await res.json();
    const list = Array.isArray(page) ? page : [];
    rows.push(...list);
    if (list.length < NIGHT_OUT_POOL_PAGE) return { rows, truncated: false };
    if (rows.length >= NIGHT_OUT_POOL_MAX_ROWS) { truncated = true; break; }
  }
  return { rows, truncated };
}

/**
 * The Night Out candidate pool: every owned row within exactly `maxMi` that a
 * real Night Out predicate claims, ready for the composer to rank.
 *
 * Returns `{ places, stats }`. `stats` is the funnel — rows read, servable,
 * within radius, qualified — so the route can log it and the re-measurement
 * does not need a second, drifting implementation to compare against.
 *
 * Throws when the database is unreachable: the caller already treats a failed
 * inventory read as a 503, and an empty array would be indistinguishable from
 * "this town has no night life", which is the lie the whole rail refuses.
 */
export async function fetchNightOutPool(lat, lng, opts = {}) {
  const maxMi = Number.isFinite(opts.maxMi) ? opts.maxMi : NIGHT_OUT_MAX_MI;
  const env = opts.env || (await import("./serverCache.js")).sbEnv();
  if (!env) throw new Error("Night Out inventory is unconfigured");
  // The BOX is generous (boxForRadius adds the shared reader's 1.15 + 1mi
  // margin); the CUT is exact. A box smaller than the cut would silently
  // shrink the radius, which is the one direction it must never be wrong in.
  const box = boxForRadius(lat, lng, maxMi * MI);
  const origin = { lat, lng };
  const categories = opts.categories || NIGHT_OUT_CATEGORIES;

  // allSettled, NOT all — one stalled category must not blank every shelf.
  // The shipped route used Promise.allSettled for exactly this reason and
  // test-night-out-intent locks it; switching to Promise.all here would have
  // turned a slow `attractions` read into a 503 for the whole surface, which is
  // a resilience regression hiding inside a retrieval fix. The guard caught it.
  const settled = await Promise.allSettled(categories.map((c) => readCategory(env, c, box, opts)));
  const reads = settled.filter((r) => r.status === "fulfilled").map((r) => r.value);
  const failures = settled.length - reads.length;
  // Every category failing is a different thing from a thin town, and it must
  // NOT be served as an empty answer.
  if (!reads.length) throw new Error("All Night Out inventory reads failed");
  const raw = reads.flatMap((r) => r.rows);
  const admitted = admitNightOutRows(raw, origin, { maxMi, editorialOverride: opts.editorialOverride, railOf: opts.railOf });
  return {
    places: admitted.places,
    stats: {
      ...admitted.stats,
      truncated: reads.some((r) => r.truncated),
      sourceFailures: failures,
      perCategory: Object.fromEntries(settled.map((r, i) => [categories[i], r.status === "fulfilled" ? r.value.rows.length : null])),
    },
  };
}
