// lib/seedPlaces.js — PURE, testable core of the candidate-set seeder (PR-B
// slice 2). No network, no clock, no filesystem: the orchestrator
// (scripts/seed-places.mjs) does the Google/Supabase I/O and passes data in, so
// every rule here is unit-tested (scripts/test-seed.mjs) rather than trusted.
//
// Design constraints from the owner:
//   • idempotent — keyed by Google Place ID, upsert; re-running changes nothing
//     that is already correct.
//   • the includedTypes group is only a DISCOVERY net; every place is RE-CLASSIFIED
//     by classifyPlace into the category its own types say (a Walmart found under
//     "food" -> shopping), never the group it was fetched under.
//   • a category recovered from the NAME (not a real Google type) must NOT be
//     silently trusted: needs_review=true, last_verified_at=null. It flags.
//   • businessStatus that is not OPERATIONAL is never silently seeded: flagged +
//     surfaced. Anchors carry an explicit category the mapper never overrides.
import { classifyPlace } from "./placeTaxonomy.js";

// Discovery nets — the includedTypes passed to Google searchNearby per coarse
// group. VERIFIED valid live via the v6.06 probe (all six returned 20 results).
// These only DISCOVER places; the real category comes from classifyPlace.
export const TYPE_GROUPS = {
  food: ["restaurant", "cafe", "bakery", "coffee_shop", "meal_takeaway", "ice_cream_shop", "sandwich_shop"],
  nightlife: ["bar", "night_club", "pub", "wine_bar"],
  attractions: ["museum", "art_gallery", "aquarium", "botanical_garden", "zoo", "amusement_park", "park", "national_park", "tourist_attraction", "performing_arts_theater", "historical_landmark"],
  hotels: ["hotel", "motel", "resort_hotel", "bed_and_breakfast", "guest_house", "lodging"],
  beach: ["beach", "marina"],
  shopping: ["shopping_mall", "clothing_store", "book_store", "department_store", "jewelry_store", "gift_shop", "shoe_store", "home_goods_store"],
};

// Metro bounding boxes. The grid tiles these into overlapping circles because
// searchNearby (New) returns <=20 with NO pagination (confirmed by the probe),
// so a single wide circle only ever sees the 20 most prominent places.
export const METRO_BOUNDS = {
  "manatee-sarasota": { minLat: 27.02, maxLat: 27.62, minLng: -82.72, maxLng: -82.15 },
};

// metroGrid — evenly spaced circle centers covering a metro's bounds. spacingKm
// controls density (finer = more coverage of the tail, more Google calls);
// radiusM is each circle's search radius (kept > half the spacing so circles
// overlap and leave no gaps). Deterministic: same args -> same grid.
export function metroGrid(metroKey, spacingKm = 15, radiusM = 11000) {
  const b = METRO_BOUNDS[metroKey];
  if (!b) throw new Error("unknown metro: " + metroKey);
  const midLat = (b.minLat + b.maxLat) / 2;
  const dLat = spacingKm / 111;
  const dLng = spacingKm / (111 * Math.cos((midLat * Math.PI) / 180));
  const cells = [];
  for (let lat = b.minLat; lat <= b.maxLat + 1e-9; lat += dLat) {
    for (let lng = b.minLng; lng <= b.maxLng + 1e-9; lng += dLng) {
      cells.push({ lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, radius: radiusM });
    }
  }
  return cells;
}

const PRICE_GLYPH = { PRICE_LEVEL_FREE: "", PRICE_LEVEL_INEXPENSIVE: "$", PRICE_LEVEL_MODERATE: "$$", PRICE_LEVEL_EXPENSIVE: "$$$", PRICE_LEVEL_VERY_EXPENSIVE: "$$$$" };
const PRICE_NUM = { PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4 };

// Pull the fields the inventory needs out of a Google place (searchNearby OR
// searchText shape — both use the New Places resource).
export function extractPlaceFields(p) {
  if (!p || !p.id) return null;
  const name = typeof p.displayName === "string" ? p.displayName : (p.displayName && p.displayName.text) || null;
  if (!name) return null;
  const loc = p.location || {};
  return {
    place_id: String(p.id),
    name: String(name),
    lat: typeof loc.latitude === "number" ? loc.latitude : null,
    lng: typeof loc.longitude === "number" ? loc.longitude : null,
    google_types: Array.isArray(p.types) ? p.types : [],
    primary_type: p.primaryType || null,
    rating: typeof p.rating === "number" ? p.rating : null,
    reviews: typeof p.userRatingCount === "number" ? p.userRatingCount : 0,
    price: PRICE_GLYPH[p.priceLevel] != null ? PRICE_GLYPH[p.priceLevel] : null,
    priceNum: PRICE_NUM[p.priceLevel] != null ? PRICE_NUM[p.priceLevel] : null,
    editorial: (p.editorialSummary && p.editorialSummary.text) || null,
    photo_ref: (Array.isArray(p.photos) && p.photos[0] && p.photos[0].name) || null,
    status: p.businessStatus || null,
  };
}

// buildInventoryRow — one Google place -> one inventory row, OR a rejection with
// a reason (so the orchestrator can print WHY, in full). `anchor` (from
// data/anchors.json) forces category+tags and is exempt from classification and
// the operational gate. `nowIso` is passed in so this stays pure/deterministic.
export function buildInventoryRow(place, metroKey, { anchor = null, nowIso } = {}) {
  const f = extractPlaceFields(place);
  if (!f) return { row: null, reason: "no id/name", place };
  const operational = !f.status || f.status === "OPERATIONAL";

  if (anchor) {
    return {
      row: {
        ...f, metro: metroKey, category: anchor.category, tags: anchor.tags || [],
        anchor: true, source: "anchor", via: "anchor",
        // An anchor is owner-asserted, so it is verified — but if Google reports
        // it non-operational we still flag it for review (the closed-listing case).
        needs_review: !operational,
        last_verified_at: operational ? nowIso : null,
        signals: { rating: f.rating, reviews: f.reviews, price: f.price, priceNum: f.priceNum },
      },
      reason: null, nonOperational: !operational,
    };
  }

  const { category, tags, via } = classifyPlace(f.google_types, f.primary_type, f.name);
  if (!category) return { row: null, reason: "unclassified (no type/name signal)", place: f };
  const nameRecovered = via === "name";
  return {
    row: {
      ...f, metro: metroKey, category, tags, anchor: false, source: "google_type", via,
      // Name-recovered OR non-operational -> review queue, never silently trusted.
      needs_review: nameRecovered || !operational,
      last_verified_at: nameRecovered || !operational ? null : nowIso,
      signals: { rating: f.rating, reviews: f.reviews, price: f.price, priceNum: f.priceNum },
    },
    reason: null, nameRecovered, nonOperational: !operational,
  };
}

// reconcile — dedup a pile of build results by place_id, keeping the richest
// record (anchor > has-editorial > more reviews), unioning tags. Separates the
// seedable rows from the FAILURES (unclassified, no id) so the orchestrator can
// print every failure in full, not a count. Also surfaces the review queue.
export function reconcile(results) {
  const byId = new Map();
  const failures = [];
  for (const res of results) {
    if (!res || !res.row) { failures.push({ reason: (res && res.reason) || "no row", place: (res && res.place) || null }); continue; }
    const row = res.row;
    const prev = byId.get(row.place_id);
    if (!prev) { byId.set(row.place_id, row); continue; }
    // Merge into the stronger record; union tags either way.
    const keep = pickRicher(prev, row);
    const drop = keep === prev ? row : prev;
    keep.tags = Array.from(new Set([...(keep.tags || []), ...(drop.tags || [])]));
    keep.needs_review = keep.needs_review || drop.needs_review;
    byId.set(row.place_id, keep);
  }
  const rows = Array.from(byId.values());
  const review = rows.filter((r) => r.needs_review);
  return { rows, failures, review };
}

function pickRicher(a, b) {
  if (a.anchor !== b.anchor) return a.anchor ? a : b;        // anchor wins
  if (!!a.editorial !== !!b.editorial) return a.editorial ? a : b; // has editorial wins
  return (b.signals?.reviews || 0) > (a.signals?.reviews || 0) ? b : a; // more reviews wins
}

// computeDiff — what a seed run WOULD change vs the current table, so the owner
// reads it BEFORE committing. existingById: Map<place_id, existingRow>.
export function computeDiff(rows, existingById) {
  const add = [], update = [];
  let unchanged = 0;
  for (const r of rows) {
    const cur = existingById.get(r.place_id);
    if (!cur) { add.push(r); continue; }
    const changed =
      cur.category !== r.category ||
      JSON.stringify((cur.tags || []).slice().sort()) !== JSON.stringify((r.tags || []).slice().sort()) ||
      (cur.status || null) !== (r.status || null) ||
      (cur.signals?.rating ?? null) !== (r.signals?.rating ?? null) ||
      (cur.signals?.reviews ?? 0) !== (r.signals?.reviews ?? 0);
    changed ? update.push(r) : unchanged++;
  }
  return { add, update, unchanged };
}

// Per-category counts — the coverage signal that tells the owner the inversion
// is actually fixed ("hotels: 47, attractions: 120") before --commit.
export function categoryCounts(rows) {
  const c = {};
  for (const r of rows) c[r.category] = (c[r.category] || 0) + 1;
  return c;
}
