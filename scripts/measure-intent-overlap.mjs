#!/usr/bin/env node
/**
 * measure-intent-overlap — how much do /tonight, /date-night and the night-out
 * experience actually return the same places?
 *
 * Owner (2026-07-31): "Perfect for tonight is sort of repetitive. Report the
 * actual overlap in results across those three intents before we decide whether
 * to merge or re-scope one. Measure it, don't guess."
 *
 * WHAT THIS MEASURES, precisely, so the number is not over-read:
 *
 *   TIER 1 — QUERY overlap. The text queries each intent sends to
 *   /api/places/search, compared as sets. This is deterministic, needs no API
 *   key, and is the UPSTREAM cause: two intents asking Google the same
 *   questions cannot come back with different places except by luck.
 *
 *   TIER 2 — RESULT overlap. The actual place ids returned, Jaccard and
 *   containment. This needs a live key and a location; it is the number the
 *   owner asked for. Run with --live to get it.
 *
 * A run without --live reports Tier 1 ONLY and says so. Reporting a query
 * overlap as if it were a result overlap would be exactly the kind of "measured
 * it" claim that is really a guess.
 *
 * Usage:
 *   node scripts/measure-intent-overlap.mjs                 # tier 1
 *   node scripts/measure-intent-overlap.mjs --live          # tier 1 + 2 (Orlando)
 *   node scripts/measure-intent-overlap.mjs --live --lat 27.5 --lng -82.5
 */
import { INTENT_PAGES, asCtx, toRow, rankRows } from "../lib/intentPages.js";
import { nowContext } from "../lib/nowContext.js";

const argv = process.argv.slice(2);
const LIVE = argv.includes("--live");
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const LAT = parseFloat(argOf("--lat", "28.54"));   // Orlando
const LNG = parseFloat(argOf("--lng", "-81.38"));
const BASE = argOf("--base", "http://localhost:3000");

// The three surfaces under suspicion. night-out is an EXPERIENCES badge, not an
// intent page, so it is represented by the query bank /tonight's night bucket
// competes with — see the note in the report.
const SUBJECTS = ["tonight", "date-night"];

const jac = (a, b) => { const A = new Set(a), B = new Set(b); const i = [...A].filter((x) => B.has(x)).length; const u = new Set([...A, ...B]).size; return u ? i / u : 0; };
const contain = (a, b) => { const A = new Set(a), B = new Set(b); return A.size ? [...A].filter((x) => B.has(x)).length / A.size : 0; };
const pct = (x) => (x * 100).toFixed(0) + "%";

console.log("\n═══ INTENT OVERLAP — /tonight vs /date-night ═══\n");

// ── TIER 1: QUERY OVERLAP, per bucket ───────────────────────────────────────
console.log("TIER 1 — QUERY OVERLAP (deterministic, the upstream cause)\n");
const BUCKETS = [["morning", 8], ["afternoon", 14], ["night", 20]];
const qsFor = (intent, hour) => INTENT_PAGES[intent].queries(nowContext({ hour, weather: null })).map((q) => q.cat + "|" + q.q);

for (const [name, hour] of BUCKETS) {
  const a = qsFor("tonight", hour), b = qsFor("date-night", hour);
  const shared = a.filter((x) => new Set(b).has(x));
  console.log(`  ${name.padEnd(10)} tonight=${a.length} date-night=${b.length}  shared=${shared.length}  Jaccard=${pct(jac(a, b))}`);
  if (shared.length) for (const sq of shared) console.log(`             ↳ identical query: ${sq}`);
}

// The sharper question: does /tonight's NIGHT bank differ from its own DAY bank
// more than it differs from date-night's night bank? If not, "tonight" is not a
// time, it is a synonym.
const tNight = qsFor("tonight", 20), tAft = qsFor("tonight", 14), dNight = qsFor("date-night", 20);
console.log(`\n  /tonight night-vs-own-afternoon Jaccard = ${pct(jac(tNight, tAft))}`);
console.log(`  /tonight night-vs-date-night     Jaccard = ${pct(jac(tNight, dNight))}`);
console.log(jac(tNight, dNight) > jac(tNight, tAft)
  ? "  ⚠  /tonight resembles date-night MORE than it resembles its own daytime self."
  : "  ✓  /tonight differs from date-night more than it differs from its own daytime self.");

// Floors are the other lever: two lists with the same queries AND the same floor
// are the same list with different art.
console.log("\n  FLOORS (the other reason two lists collapse):");
for (const k of SUBJECTS) {
  const f = INTENT_PAGES[k].floor;
  console.log(`    ${k.padEnd(12)} rating>=${f.rating} reviews>=${f.reviews}${f.maxReviews ? " max=" + f.maxReviews : ""}${f.maxPrice ? " maxPrice=" + f.maxPrice : ""}`);
}
const fa = INTENT_PAGES.tonight.floor, fb = INTENT_PAGES["date-night"].floor;
if (fa.rating === fb.rating && fa.reviews === fb.reviews) {
  console.log("    ⚠  IDENTICAL floors — the two lists filter the same pool the same way.");
}

if (!LIVE) {
  console.log("\nTIER 2 — RESULT OVERLAP: NOT MEASURED.");
  console.log("  This run reports QUERY overlap only. Query overlap is the cause;");
  console.log("  result overlap is the symptom the owner asked about, and it needs");
  console.log("  live search. Re-run against a running dev server:");
  console.log("      node scripts/measure-intent-overlap.mjs --live\n");
  process.exit(0);
}

// ── TIER 2: RESULT OVERLAP ──────────────────────────────────────────────────
console.log("\nTIER 2 — RESULT OVERLAP (live)\n");
async function resultsFor(intent, hour) {
  const ctx = nowContext({ lat: LAT, lng: LNG, hour, weather: null });
  const qs = INTENT_PAGES[intent].queries(ctx);
  const out = [];
  for (const { cat, q } of qs) {
    const u = `${BASE}/api/places/search?q=${encodeURIComponent(q)}&lat=${LAT.toFixed(2)}&lng=${LNG.toFixed(2)}&radius=32000&n=20&cat=${encodeURIComponent(cat)}`;
    try {
      // Sec-Fetch-Site is what a real browser sends on a same-origin fetch, and
      // lib/apiGuard gates the PAID search proxy on it (that gate is the reason
      // curl gets a 403 here). Emulating the header the real client already
      // sends is measuring the app; bypassing the gate would be measuring
      // something else.
      const r = await fetch(u, { headers: { "Sec-Fetch-Site": "same-origin" } });
      const j = r.ok ? await r.json() : null;
      out.push(...(j && Array.isArray(j.places) ? j.places : []).map(toRow).filter(Boolean));
    } catch (e) { console.error(`  fetch failed: ${q} — ${e.message}`); }
  }
  return rankRows(out, INTENT_PAGES[intent].floor, { origin: { lat: LAT, lng: LNG }, penalty: INTENT_PAGES[intent].distancePenalty || null, ctx });
}

for (const [name, hour] of BUCKETS) {
  const [a, b] = await Promise.all([resultsFor("tonight", hour), resultsFor("date-night", hour)]);
  const ia = a.map((r) => r.id), ib = b.map((r) => r.id);
  // A comparison of two empty lists is 0% overlap and means nothing. Assert both
  // sides are non-empty before reporting a number.
  if (!ia.length || !ib.length) {
    console.log(`  ${name.padEnd(10)} SKIPPED — tonight=${ia.length} rows, date-night=${ib.length} rows. Cannot compare an empty list.`);
    continue;
  }
  const shared = ia.filter((x) => new Set(ib).has(x));
  console.log(`  ${name.padEnd(10)} tonight=${ia.length} date-night=${ib.length}  shared=${shared.length}  Jaccard=${pct(jac(ia, ib))}  (${pct(contain(ia, ib))} of /tonight also on /date-night)`);
  const top5 = ia.slice(0, 5).filter((x) => new Set(ib.slice(0, 5)).has(x));
  console.log(`             top-5 overlap: ${top5.length}/5 — this is what the user actually sees`);
  for (const id of shared.slice(0, 5)) {
    const r = a.find((x) => x.id === id);
    console.log(`             ↳ both lists: ${r ? r.name : id}`);
  }
}
console.log("");
