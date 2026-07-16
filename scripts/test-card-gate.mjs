// scripts/test-card-gate.mjs — v6.40 GLOBAL card-integrity guardrail.
//
// THE LESSON (July 16 incident, owner-reported): three different data paths
// (the v6.38 inventory union, the Google-outage inventory fallback, and the
// skeleton place-ID index) each leaked rows that were not card-complete —
// nameless cards, photoless cards, and Score-less cards — because each path
// had its OWN idea of "a place". The fix class is a single render-time
// CONTRACT (lib/score.js cardComplete) enforced at the card components, plus
// serve-time gates so unenriched rows never leave the server. This test locks
// BOTH layers so no future data source can ship a broken card again.
import { readFileSync } from "fs";
import { cardComplete } from "../lib/score.js";
import { rankInventory } from "../lib/inventoryServe.js";

let pass = 0;
const fail = (m) => { console.error("test-card-gate: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// ── the render contract: name + id + rating signals, ALWAYS ─────────────────
ok(cardComplete({ id: "a", name: "Keke's Breakfast Cafe", rating: 4.7, reviews: 3723 }) === true, "real place passes");
ok(cardComplete({ id: "c", name: "Rated newcomer", rating: 4.9 }) === true, "named + rating passes");
ok(cardComplete({ id: "c2", name: "Raw-field place", rating: 4.4, userRatingCount: 210 }) === true, "raw Google field name (userRatingCount) counts as review signal");
ok(cardComplete({ id: "c3", name: "Reviews only", reviews: 87 }) === true, "review volume alone passes (Score computes from it)");
ok(cardComplete({ id: "b", name: "Photo-only Fresh Spot", photos: [{ name: "x" }] }) === false,
  "v6.40 FLIP: a photo alone no longer qualifies — no rating signals means no Score, and a Score-less card never renders (the July 16 'things to do' bug)");
ok(cardComplete({ id: "b2", name: "Photo string only", photo: "/api/photo?ref=x" }) === false, "photo-string-only refused for the same reason");
ok(cardComplete({ id: "d", displayName: { text: "Raw Google Row" }, rating: 4.8 }) === false, "un-normalized Google-shaped row (no name) is refused — the Family/All nameless bug");
ok(cardComplete({ id: "e", name: "" }) === false, "empty name refused");
ok(cardComplete({ id: "f", name: "   " }) === false, "whitespace name refused");
ok(cardComplete({ id: "g", name: "Ghost With Nothing" }) === false, "name with zero substance refused");
ok(cardComplete({ name: "No Id Place", rating: 5 }) === false, "missing id refused");
ok(cardComplete(null) === false, "null refused");

// ── the serve gate: unenriched inventory rows never leave the server ────────
const enriched = { place_id: "wf1", name: "Enriched Museum", lat: 27.5, lng: -82.4, google_types: ["museum"], signals: { rating: 4.6, reviews: 812 }, photo_ref: "ph1", status: "OPERATIONAL" };
const skeleton = { place_id: "wf2", name: "Skeleton Row (promoted, not yet enriched)", lat: 27.5, lng: -82.4, google_types: ["museum"], signals: {}, status: "OPERATIONAL" };
const zeroRated = { place_id: "wf3", name: "Zero-rated Row", lat: 27.5, lng: -82.4, google_types: ["museum"], signals: { rating: 0, reviews: 0 }, status: "OPERATIONAL" };
const served = rankInventory([enriched, skeleton, zeroRated], 27.5, -82.4, 24000, 10);
ok(served.length === 1, "rankInventory serves ONLY rows with real rating signals (got " + served.length + ")");
ok(served[0] && served[0].displayName && served[0].displayName.text === "Enriched Museum", "the enriched row is the one served");
ok(typeof served[0].rating === "number" && served[0].rating > 0, "a served inventory row ALWAYS carries a rating — so the client always computes a Wayfind Score for it");

// ── the components actually enforce the contract ────────────────────────────
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(/function PlaceCard\(\{[^}]*\}\) \{\s*\n\s*if \(!cardComplete\(p\)\) return null;/.test(home),
  "PlaceCard's FIRST act is the completeness gate (if (!cardComplete(p)) return null;)");
ok(/import \{[^}]*cardComplete[^}]*\} from "\.\.\/lib\/score"/.test(home), "home.js imports cardComplete from lib/score");
ok(/if \(p\.wfScore == null && Number\(p\.rating\) > 0\) p\.wfScore = wayfindScore\(/.test(home),
  "PlaceCard self-heals a missing wfScore from rating signals (a rated card ALWAYS shows the Score badge)");
ok(/=== "Food"\), condCtx, boostBase\)\.filter\(cardComplete\)\.slice\(0, 10\)/.test(home),
  "the home Food top-10 row list is gated by cardComplete");
ok(/rankByConditions\(todoPool, condCtx, boostBase\)\.filter\(cardComplete\)\.slice\(0, 10\)/.test(home),
  "the home Things-to-do top-10 row list is gated by cardComplete");

const kit = readFileSync(new URL("../app/components/kit.js", import.meta.url), "utf8");
ok(/import \{ wayfindScore \} from "\.\.\/\.\.\/lib\/google"/.test(kit), "kit.js imports the ONE score formula (wayfindScore)");
ok(/let s = toDisplayScore\(p && p\.wfScore\);\s*\n\s*if \(s == null && p && Number\(p\.rating\) > 0\) s = toDisplayScore\(wayfindScore\(/.test(kit),
  "PlaceScoreChip self-heals: rating signals present -> a real Score renders, never 'Score pending'");

const inv = readFileSync(new URL("../lib/inventoryServe.js", import.meta.url), "utf8");
ok(/if \(!\(typeof _sr\.rating === "number" && _sr\.rating > 0\)\) continue;/.test(inv),
  "rankInventory's unenriched-row skip is in place (serve-time gate)");

console.log(`test-card-gate: OK — ${pass} assertions (no card renders without a name AND a Wayfind Score; unenriched rows never leave the server)`);
