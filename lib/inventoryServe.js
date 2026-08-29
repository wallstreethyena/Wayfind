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
 */
export async function serveFromInventory(cat, lat, lng, radiusM, n, sub) {
  cat = String(cat || "").toLowerCase();
  const subIdEarly = String(sub || "").toLowerCase();
  // Activities → Beaches lives on wf_inventory category=beach. Inlined so
  // this file does not import browseInventory (homepage-reachable via the
  // Exploding rail until that import was cut).
  const libraryCat = cat === "attractions" && subIdEarly === "beaches" ? "beach" : cat;
  const virtual = VIRTUAL_CATS[libraryCat] || VIRTUAL_CATS[cat] || null;
  const physical = virtual ? virtual.base : (CATS.has(libraryCat) ? libraryCat : cat);
  if (!CATS.has(physical) || !isFinite(lat) || !isFinite(lng)) return [];
  const { sbEnv } = await import("./serverCache.js"); // lazy: keeps this module test-importable
  const s = sbEnv();
  if (!s) return [];
  const h = { apikey: s.key, Authorization: `Bearer ${s.key}` };

  // `select=*` on purpose. The old query named its columns, which means the day a
  // new column is referenced before the owner runs the migration, PostgREST 400s,
  // this returns [], and the Google-429 fallback serves a BLANK list — exactly the
  // `wrote_at` outage shape from v5.90. With `select=*` the new columns simply
  // appear when they exist and are `undefined` until then, and the JS filters
  // below degrade to no-ops. Never name a column here that might not exist yet.
  //
  // v6.16: a place can belong to a SECOND list — a campground is an outdoor
  // experience AND a real place to stay tonight (owner rule). We ask for both in
  // one OR query, and fall back to the plain category query if
  // `secondary_categories` does not exist yet.
  // v8.49 — GEO-BOUND THE READ. `limit=1000` with no bound reads an arbitrary
  // 1,000 of the 5,916 food rows in POSTGRES HEAP ORDER (any UPDATE reshuffles
  // it), and only rankInventory's JS then applies distance. Measured near
  // Parrish: 111 admissible cafés within 17mi, of which that window contained
  // just 21 — 81% invisible, and WHICH 81% changed with the heap. The bounding
  // box is the radius plus rankInventory's own 1.15 gate, converted at 69mi per
  // degree of latitude and shrunk by cos(lat) for longitude, so it can never cut
  // inside the distance filter that follows.
  const _mi = (Number(radiusM) || 27000) / 1609.34 * 1.15 + 1;
  const _dLat = _mi / 69;
  const _dLng = _mi / Math.max(5, 69 * Math.cos((lat * Math.PI) / 180));
  const box = `&lat=gte.${(lat - _dLat).toFixed(4)}&lat=lte.${(lat + _dLat).toFixed(4)}`
    + `&lng=gte.${(lng - _dLng).toFixed(4)}&lng=lte.${(lng + _dLng).toFixed(4)}`;
  const base = `${s.url}/rest/v1/wf_inventory?select=*&limit=1000${box}`;
  const withSecondary = `${base}&or=(category.eq.${physical},secondary_categories.cs.{${physical}})`;
  const plain = `${base}&category=eq.${physical}`;
  try {
    let r = await fetchDeadline(withSecondary, { headers: h, cache: "no-store" }, DB_DEADLINE_MS);
    if (!r.ok) r = await fetchDeadline(plain, { headers: h, cache: "no-store" }, DB_DEADLINE_MS); // pre-migration
    if (!r.ok) return [];
    let rows = await r.json();
    if (virtual) rows = (rows || []).filter((row) => { try { return virtual.keep(row); } catch { return false; } });
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
    return rankInventory(rows, lat, lng, radiusM, n);
  } catch { return []; }
}
