#!/usr/bin/env node
/**
 * diagnose-night-out-funnel — the Night Out candidate funnel, measured.
 *
 * Owner review, 2026-09-05: before changing any presentation, decide which of
 * four things a one-card rail is —
 *   A GENUINE SCARCITY · B CANDIDATE STARVATION · C EVIDENCE STARVATION
 *   D TAXONOMY STARVATION
 * — because the fix is different for each.
 *
 * v2 CORRECTS A REAL FLAW IN v1, and the flaw is worth keeping in writing.
 * v1 compared the route's pool against "ALL admissible rows <= 27mi", but the
 * two sides did not mean the same thing:
 *   · the route side came through rankInventory(), whose gate is
 *     radius x 1.15 — about 31 miles at 27 — and which ALSO refuses rows that
 *     are closed, excluded, or unrated
 *   · the ALL side applied an exact 27-mile cut and none of those row filters
 * So the two columns measured different universes, which is why Cocktails read
 * 203 vs 202 — a NEGATIVE loss, which is impossible if one set contains the
 * other, and the tell that the comparison was wrong.
 *
 * The correction is structural rather than careful: BOTH columns now end in the
 * SAME function — admitNightOutRows() from lib/nightOutPool.js, which applies
 * the row filters, the exact 27-mile law and the real nightOutPlaceRail
 * predicate. A mismatch is no longer possible to write by accident.
 *
 * So this now measures OLD vs NEW retrieval with one shared definition of
 * "qualifies", which makes it both the diagnosis and the re-measurement:
 *   OLD  serveFromInventory(top 400 of 3 broad categories) -> admit
 *   NEW  fetchNightOutPool(deterministic exhaustive paging) -> admit
 *
 * Read-only. No provider calls. Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *
 *   node scripts/diagnose-night-out-funnel.mjs [lat] [lng]
 */
import { BROWSE_INVENTORY_N } from "../lib/browseInventory.js";
import { serveFromInventory } from "../lib/inventoryServe.js";
import { sbEnv } from "../lib/serverCache.js";
import { NIGHT_OUT_MAX_MI, NIGHT_OUT_RAIL_DEFS, nightOutPlaceRail } from "../lib/nightOutIntent.js";
import { nightOutEditorialEvidence } from "../lib/nightOutEvidence.js";
import { admitNightOutRows, fetchNightOutPool, NIGHT_OUT_CATEGORIES } from "../lib/nightOutPool.js";

const LAT = Number(process.argv[2] || 27.5949); // Parrish, the owner's own spot
const LNG = Number(process.argv[3] || -82.4265);
const origin = { lat: LAT, lng: LNG };

if (!sbEnv()) {
  console.error("diagnose-night-out-funnel: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set — this reads owned inventory and cannot run without them.");
  process.exit(2);
}

// serveFromInventory returns rows already mapped into the Google-ish shape
// (invRowToPlace). admitNightOutRows expects raw wf_inventory rows, so map back
// — field for field, no interpretation — and let the SHARED admission decide.
// This is the seam where v1 went wrong; keeping it a dumb rename is the point.
const toRawRow = (p) => ({
  place_id: p.id,
  name: p?.displayName?.text || p.name,
  lat: p?.location?.latitude ?? p.lat,
  lng: p?.location?.longitude ?? p.lng,
  category: p.category || null,
  primary_type: p.primaryType || p.primary_type || null,
  google_types: Array.isArray(p.types) ? p.types : [],
  status: p.businessStatus || "OPERATIONAL",
  excluded: p.excluded,
  editorial: p?.editorialSummary?.text || p.editorial || null,
  photo_ref: p.photo_ref || null,
  signals: { rating: typeof p.rating === "number" ? p.rating : null, reviews: Number(p.userRatingCount || p.reviews || 0) },
});

// ── OLD: the shipped retrieval, top-N of three broad categories ─────────────
const oldServed = await Promise.all(NIGHT_OUT_CATEGORIES.map((c) =>
  serveFromInventory(c, LAT, LNG, NIGHT_OUT_MAX_MI * 1609.34, BROWSE_INVENTORY_N, undefined, { failLoud: true, primaryOnly: false })));
const oldAdmit = admitNightOutRows(oldServed.flat().map(toRawRow), origin, { editorialOverride: nightOutEditorialEvidence });

// ── NEW: identity-first, deterministic, exhaustive ─────────────────────────
const next = await fetchNightOutPool(LAT, LNG, { editorialOverride: nightOutEditorialEvidence });

const tally = (places) => {
  const by = Object.fromEntries(NIGHT_OUT_RAIL_DEFS.map((r) => [r.id, []]));
  for (const p of places) { const id = nightOutPlaceRail(p); if (id && by[id]) by[id].push(p); }
  return by;
};
const oldBy = tally(oldAdmit.places);
const newBy = tally(next.places);

console.log(`\nNIGHT OUT FUNNEL — ${LAT}, ${LNG} — exactly <= ${NIGHT_OUT_MAX_MI}mi — both columns share ONE admission (admitNightOutRows)\n`);
console.log(`OLD  rows the top-${BROWSE_INVENTORY_N} read returned : ${oldServed.flat().length}   (${NIGHT_OUT_CATEGORIES.map((c, i) => c + " " + oldServed[i].length).join(", ")})`);
console.log(`OLD  qualifying after the shared admission : ${oldAdmit.places.length}`);
console.log("");
console.log(`NEW  owned rows read in the box           : ${next.stats.rows}   (${Object.entries(next.stats.perCategory).map(([k, v]) => k + " " + v).join(", ")})${next.stats.truncated ? "  [TRUNCATED — raise NIGHT_OUT_POOL_MAX_ROWS]" : ""}`);
console.log(`NEW  servable (open, not excluded, rated) : ${next.stats.servable}`);
console.log(`NEW  within exactly ${NIGHT_OUT_MAX_MI}mi                 : ${next.stats.withinRadius}`);
console.log(`NEW  qualifying for a Night Out rail      : ${next.stats.qualified}`);
console.log("");

const pad = (s, w) => String(s).padEnd(w);
console.log(pad("rail", 36) + pad("OLD", 7) + pad("NEW", 7) + "gained");
console.log("-".repeat(60));
let gained = 0;
for (const def of NIGHT_OUT_RAIL_DEFS) {
  const o = oldBy[def.id].length, w = newBy[def.id].length;
  gained += Math.max(0, w - o);
  console.log(pad(def.title.slice(0, 34), 36) + pad(o, 7) + pad(w, 7) + (w - o > 0 ? "+" + (w - o) : w - o));
}
console.log("-".repeat(60));
console.log(`\nQualifying candidates recovered: ${gained}`);

// A rail that is still zero after identity-first retrieval is NOT candidate
// starvation. Naming them keeps the next investigation honest — they need an
// evidence or taxonomy answer, and no amount of retrieval will move them.
const stillEmpty = NIGHT_OUT_RAIL_DEFS.filter((d) => newBy[d.id].length === 0).map((d) => d.title);
if (stillEmpty.length) {
  console.log(`\nStill zero WITH the full owned pool — not candidate starvation (A/C/D, never B):\n  ${stillEmpty.join("\n  ")}`);
}
const thin = NIGHT_OUT_RAIL_DEFS.filter((d) => newBy[d.id].length === 1).map((d) => `${d.title} (${newBy[d.id][0].name})`);
if (thin.length) {
  console.log(`\nGenuinely ONE verified option — a presentation question, not a data one:\n  ${thin.join("\n  ")}`);
}

// Regression watch: a fix that thins a dense rail is not a fix.
const lost = NIGHT_OUT_RAIL_DEFS.filter((d) => newBy[d.id].length < oldBy[d.id].length);
if (lost.length) {
  console.log(`\n!! RAILS THAT LOST CANDIDATES — investigate before shipping:`);
  for (const d of lost) console.log(`  ${d.title}: ${oldBy[d.id].length} -> ${newBy[d.id].length}`);
} else {
  console.log(`\nNo rail lost candidates. The dense control (Bars, Cocktails & Rooftops) holds at ${newBy.cocktails.length}.`);
}
console.log("");
