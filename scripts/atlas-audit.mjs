// scripts/atlas-audit.mjs — READ-ONLY audit. Changes nothing, writes no data,
// makes ZERO Google API calls (pure Supabase read + local re-classification).
//
// Answers, with numbers instead of adjectives:
//   1. what wf_inventory actually holds (category coverage, anchors, review queue)
//   2. where the TWO classifiers disagree — lib/placeTaxonomy.js (which wrote every
//      stored category) vs lib/placeCategory.js (v6.15, which the live gate now uses)
//   3. junk: service businesses, non-lodging in hotels, retail-as-food
//   4. duplicates: same place, two Place IDs
//   5. the Atlas-590 join: what the cards add, contradict, or confirm
//   6. the anchor gap (Mote et al.) — reported, but a SEPARATE workstream

import fs from "node:fs";
import path from "node:path";
import { classifyPlace } from "../lib/placeTaxonomy.js";
import { primaryCategory, isServicePlace } from "../lib/placeCategory.js";

// ── env (values never printed) ─────────────────────────────────────────────
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
// Resolve exactly the way the app does (lib/serverCache.js:25) — SUPABASE_URL is
// present but EMPTY in .env.local; the real value is NEXT_PUBLIC_SUPABASE_URL.
const URL_ = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
const KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim().replace(/^['"]+|['"]+$/g, "");
if (!URL_ || !KEY) { console.error("audit: Supabase URL / service-role key missing"); process.exit(1); }

// ── pull every wf_inventory row (paginated) ────────────────────────────────
async function pullAll(table) {
  const out = [];
  const step = 1000;
  for (let from = 0; ; from += step) {
    const res = await fetch(`${URL_}/rest/v1/${table}?select=*`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + step - 1}` },
    });
    if (!res.ok) { console.error(`audit: ${table} read failed ${res.status}`); process.exit(1); }
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < step) break;
  }
  return out;
}

const inv = await pullAll("wf_inventory");

// ── the vocabularies, reconciled ───────────────────────────────────────────
// taxonomy (stored)  : food|nightlife|attractions|beach|hotels|shopping
// placeCategory (live): Food|Nightlife|Activities|Hotels|Shopping   (beach ⊂ Activities)
const toSection = (c) => ({ food: "Food", nightlife: "Nightlife", attractions: "Activities", beach: "Activities", hotels: "Hotels", shopping: "Shopping" }[c] || null);

const LODGING_RE = /lodging|hotel|motel|resort|guest_house|bed_and_breakfast|hostel|inn|cottage|vacation_rental|extended_stay/;
const GROCERY_RE = /grocery_store|supermarket|convenience_store|warehouse_store|department_store|discount_store|gas_station/;

const rows = inv.map((r) => {
  const types = r.google_types || [];
  const stored = r.category || null;
  const storedSection = toSection(stored);
  const tax = classifyPlace(types, r.primary_type, r.name);
  const live = primaryCategory({ types });          // v6.15 classifier
  const liveSection = live || null;
  return {
    place_id: r.place_id, name: r.name, stored, storedSection,
    taxCat: tax.category, taxVia: tax.via, live: liveSection,
    types, primary_type: r.primary_type, anchor: !!r.anchor,
    needs_review: !!r.needs_review, locked: !!r.locked, status: r.status,
    lat: r.lat, lng: r.lng, metro: r.metro, source: r.source,
    signals: r.signals || {},
    isService: isServicePlace({ types }),
    isLodging: types.some((t) => LODGING_RE.test(t)),
    isGrocery: types.some((t) => GROCERY_RE.test(t)),
  };
});

const count = (arr, fn) => arr.filter(fn).length;
const tally = (arr, fn) => arr.reduce((m, r) => { const k = fn(r) ?? "(null)"; m[k] = (m[k] || 0) + 1; return m; }, {});

// ── 1. what's in there ─────────────────────────────────────────────────────
const byCategory = tally(rows, (r) => r.stored);
const byMetro = tally(rows, (r) => r.metro);
const bySource = tally(rows, (r) => r.source);

// ── 2. classifier disagreement (the core finding) ──────────────────────────
// Compare at SECTION level so the two vocabularies are actually comparable.
const disagree = rows.filter((r) => r.storedSection && r.live && r.storedSection !== r.live);
const liveNull = rows.filter((r) => r.storedSection && !r.live);   // live gate would DROP it
const storedNull = rows.filter((r) => !r.stored);                   // no category stored at all
const disagreeShape = tally(disagree, (r) => `${r.storedSection} -> ${r.live}`);

// ── 3. junk ────────────────────────────────────────────────────────────────
const serviceJunk = rows.filter((r) => r.isService);                       // no discovery identity at all
const hotels = rows.filter((r) => r.stored === "hotels");
const hotelsNonLodging = hotels.filter((r) => !r.isLodging);                // in Hotels without a lodging type
const hotelsClosed = hotels.filter((r) => r.status && r.status !== "OPERATIONAL");
const foodRows = rows.filter((r) => r.stored === "food");
const foodGrocery = foodRows.filter((r) => r.isGrocery);                    // Publix/Walmart in "places to eat"
const closed = rows.filter((r) => r.status && r.status !== "OPERATIONAL");
const noCoords = rows.filter((r) => r.lat == null || r.lng == null);
const noTypes = rows.filter((r) => !r.types.length);

// ── 4. duplicate places (same real place, two Place IDs) ───────────────────
const norm = (s) => String(s || "").toLowerCase().replace(/['’.,&-]/g, "").replace(/\s+/g, " ").trim();
const dupKey = (r) => `${norm(r.name)}|${r.lat != null ? r.lat.toFixed(4) : "?"}|${r.lng != null ? r.lng.toFixed(4) : "?"}`;
const dupMap = new Map();
for (const r of rows) { const k = dupKey(r); if (!dupMap.has(k)) dupMap.set(k, []); dupMap.get(k).push(r); }
const dupGroups = [...dupMap.entries()].filter(([k, v]) => v.length > 1 && !k.includes("|?|?"));

// ── 5. anchors ─────────────────────────────────────────────────────────────
const anchors = rows.filter((r) => r.anchor);
// The Mote class: real types, but nothing any classifier can turn into a category.
const unclassifiable = rows.filter((r) => r.types.length && !r.live && !r.taxCat);
const moteLike = rows.filter((r) => r.types.some((t) => /research_institute|university|school|church|place_of_worship|city_hall|local_government/.test(t)));

// ── 6. the Atlas-590 join ──────────────────────────────────────────────────
const atlasPath = path.join("data", "atlas", "atlas-590.tsv");
const atlas = fs.readFileSync(atlasPath, "utf8").split("\n").slice(1).filter(Boolean).map((l) => {
  const [category, name, address, google_place_id] = l.split("\t");
  return { category, name, address, google_place_id };
});
const invById = new Map(rows.map((r) => [r.place_id, r]));
const matched = atlas.filter((a) => invById.has(a.google_place_id));
const unmatched = atlas.filter((a) => !invById.has(a.google_place_id));
// Atlas card category vs what the inventory stored for that same place.
const ATLAS_TO_SECTION = { attractions: "Activities", beaches: "Activities", food: "Food", hotels: "Hotels", nightlife: "Nightlife", shopping: "Shopping", other: null };
const atlasConflicts = matched.filter((a) => {
  const inv = invById.get(a.google_place_id);
  const want = ATLAS_TO_SECTION[a.category];
  return want && inv.storedSection && want !== inv.storedSection;
});
// Do the unmatched cards look like a PARSE problem or genuinely-absent places?
const unmatchedIdShape = tally(unmatched, (a) => (/^ChIJ[A-Za-z0-9_-]{23}$/.test(a.google_place_id) ? "well-formed id" : "MALFORMED id"));

const OUT = path.join("data", "atlas");
const w = (f, rows_, cols) => fs.writeFileSync(path.join(OUT, f),
  [cols.join("\t"), ...rows_.map((r) => cols.map((c) => String(r[c] ?? "")).join("\t"))].join("\n") + "\n");

w("audit-classifier-disagreements.tsv", disagree, ["place_id", "name", "stored", "storedSection", "live", "primary_type", "types"]);
w("audit-live-would-drop.tsv", liveNull, ["place_id", "name", "stored", "primary_type", "types"]);
w("audit-service-junk.tsv", serviceJunk, ["place_id", "name", "stored", "types"]);
w("audit-hotels-non-lodging.tsv", hotelsNonLodging, ["place_id", "name", "stored", "status", "types"]);
w("audit-food-grocery.tsv", foodGrocery, ["place_id", "name", "types"]);
w("audit-unclassifiable.tsv", unclassifiable, ["place_id", "name", "stored", "anchor", "primary_type", "types"]);
w("audit-mote-like.tsv", moteLike, ["place_id", "name", "stored", "anchor", "types"]);
w("audit-duplicate-places.tsv", dupGroups.flatMap(([, v]) => v), ["place_id", "name", "stored", "lat", "lng"]);
w("review-atlas-unmatched.tsv", unmatched, ["category", "name", "address", "google_place_id"]);
w("review-atlas-conflicts.tsv", atlasConflicts.map((a) => ({ ...a, invStored: invById.get(a.google_place_id).stored, invName: invById.get(a.google_place_id).name })), ["category", "name", "google_place_id", "invStored", "invName"]);

const report = {
  inventory: {
    rows: rows.length,
    byCategory, byMetro, bySource,
    anchors: anchors.length,
    needsReview: count(rows, (r) => r.needs_review),
    locked: count(rows, (r) => r.locked),
    noCategory: storedNull.length,
    noCoords: noCoords.length,
    noTypes: noTypes.length,
    closedOrNonOperational: closed.length,
  },
  classifierDisagreement: {
    comparableRows: count(rows, (r) => r.storedSection && r.live),
    disagreements: disagree.length,
    shape: disagreeShape,
    liveGateWouldDrop: liveNull.length,
  },
  junk: {
    serviceBusinesses: serviceJunk.length,
    hotelsTotal: hotels.length,
    hotelsWithoutLodgingType: hotelsNonLodging.length,
    hotelsNonLodgingPct: hotels.length ? Math.round((hotelsNonLodging.length / hotels.length) * 100) : 0,
    hotelsClosed: hotelsClosed.length,
    foodTotal: foodRows.length,
    foodThatIsGroceryOrBigBox: foodGrocery.length,
  },
  duplicates: { groups: dupGroups.length, rows: dupGroups.reduce((n, [, v]) => n + v.length, 0) },
  anchorGap: {
    anchors: anchors.length,
    unclassifiableWithRealTypes: unclassifiable.length,
    moteLikeInstitutions: moteLike.length,
    moteInInventory: rows.some((r) => /mote marine/i.test(r.name)),
  },
  atlas590: {
    cards: atlas.length,
    matchedToInventory: matched.length,
    unmatched: unmatched.length,
    unmatchedIdShape,
    categoryConflictsWithInventory: atlasConflicts.length,
  },
};
fs.writeFileSync(path.join(OUT, "audit-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
