#!/usr/bin/env node
/**
 * scripts/check-scout-law.mjs — pins the ONE place a model may touch the
 * Wayfind taxonomy, and every wall around it.
 *
 * WHY THIS EXISTS. lib/scoutAdjudicate.js lets a language model supply a
 * section for a place lib/placeCategory.js ABSTAINED on — because Google's own
 * editorialSummary ("Aquarium with a stingray touch tank") carries an identity
 * its type list does not, and a regex cannot read a sentence. That is a real
 * capability and a real hazard: the same abstention bucket that holds Mote
 * Marine Laboratory (score 94) holds Siesta Roofing (score 92) and Spunky
 * Spirits Mobile Bartending Service (score 99).
 *
 * So the model gets exactly one door and this guard nails every other one shut:
 *
 *   1. it may never admit a place classify() EXCLUDED
 *   2. it may never override a section classify() DECIDED
 *   3. it may never mint a section outside the known vocabulary
 *   4. a row it recovers must land needs_review=true, last_verified_at=null and
 *      source="scout_adjudicated" — a model may FLAG, a human ships
 *   5. the strict write validator must independently REJECT a row that claims
 *      an adjudicated category without that provenance
 *   6. omitting adjudication must reproduce the previous behaviour exactly
 *   7. the floor stays 92 and its SQL-facing inverse agrees with THE score
 *
 * Every assertion below is red-proven by construction: each one is stated
 * against a case whose opposite is also asserted, so a rule that stops firing
 * fails here rather than in production.
 */
import { classify, ADJUDICABLE } from "../lib/placeCategory.js";
import { buildInventoryRow, extractPlaceFields } from "../lib/seedPlaces.js";
import { decidePromotion, validateInventoryRow, toWriteRow } from "../lib/promoteIndex.js";
import { wayfindScore } from "../lib/wayfindScore.js";
import {
  SCOUT_FLOOR, SECTIONS, minReviewsFor, clearsFloor,
  needsAdjudication, parseAdjudication, adjudicationOutcome,
} from "../lib/scoutAdjudicate.js";

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.error("  FAIL: " + msg); } };

// ── 0. The two copies of the vocabulary must agree ──────────────────────────
// placeCategory.js declares ADJUDICABLE locally so it stays import-free for the
// client bundle (the lib/beaches.js pattern). Local copy => drift guard.
ok(ADJUDICABLE.size === SECTIONS.length, `ADJUDICABLE (${ADJUDICABLE.size}) and SECTIONS (${SECTIONS.length}) differ in size`);
for (const s of SECTIONS) ok(ADJUDICABLE.has(s), `SECTIONS has "${s}" but placeCategory.ADJUDICABLE does not`);

// ── 1. The floor, and its SQL-facing inverse ────────────────────────────────
ok(SCOUT_FLOOR === 92, `SCOUT_FLOOR must be 92 (the owner's 9.2), got ${SCOUT_FLOOR}`);
for (const rating of [4.6, 4.7, 4.8, 4.9, 5.0]) {
  const need = minReviewsFor(rating, SCOUT_FLOOR);
  ok(Number.isFinite(need), `minReviewsFor(${rating}) should be reachable`);
  ok(wayfindScore(rating, need) >= SCOUT_FLOOR, `minReviewsFor(${rating})=${need} does not actually clear ${SCOUT_FLOOR} (got ${wayfindScore(rating, need)})`);
  ok(need === 0 || wayfindScore(rating, need - 1) < SCOUT_FLOOR, `minReviewsFor(${rating})=${need} is not TIGHT — ${need - 1} reviews already clears it`);
}
ok(!Number.isFinite(minReviewsFor(4.5, SCOUT_FLOOR)), "a 4.5-star place can never reach 9.2; minReviewsFor must say Infinity");
ok(clearsFloor(4.7, 9851), "Mote Marine (4.7/9851) must clear the floor");
ok(!clearsFloor(4.9, 20), "4.9 from 20 reviews must NOT clear the floor — that is the whole point of the Bayesian prior");

// ── 2. Abstention is the ONLY adjudicable state ─────────────────────────────
const roofer = { types: ["roofing_contractor", "point_of_interest"], primaryType: "roofing_contractor", name: "Siesta Roofing" };
const mote = { types: ["research_institute", "point_of_interest", "establishment"], primaryType: null, name: "Mote Marine Laboratory" };
const diner = { types: ["restaurant", "point_of_interest"], primaryType: "american_restaurant", name: "Fork and Hen On Main" };

ok(classify(roofer).excluded === true, "self-test: a roofing_contractor must be EXCLUDED, not abstained on");
ok(needsAdjudication(classify(mote)) === true, "Mote must land in the abstention bucket — otherwise this whole feature is inert");
ok(needsAdjudication(classify(roofer)) === false, "an EXCLUDED place must never be adjudicable");
ok(needsAdjudication(classify(diner)) === false, "a DECIDED place must never be adjudicable");

// ── 2b. A food bank is not a place to eat ───────────────────────────────────
// FEAST Food Pantry (4.8 / 234) carries the bare type `food` and nothing else,
// and resolved into "best places to eat" until 2026-08-22. The veto must run
// before the food resolver, and must survive an Activities/Food verdict.
{
  const pantry = { types: ["food", "point_of_interest", "association_or_organization", "service", "establishment"], primaryType: null, name: "FEAST Food Pantry" };
  const c = classify(pantry);
  ok(c.excluded === true, `a food bank must be EXCLUDED, got category=${c.category}`);
  ok(classify({ ...pantry, adjudicatedSection: "Food" }).category === null, "a Food verdict must not rescue a food bank");
  // NEGATIVE CONTROLS — the veto matches whole phrases precisely so it cannot
  // eat real restaurants. Every one of these is a plausible real business name.
  for (const name of ["Fork and Hen", "The Pantry Bistro", "Mission BBQ", "Army & Navy Diner", "Goodwill Cafe & Bakery", "The Food Hall"]) {
    const r = classify({ types: ["restaurant", "food", "point_of_interest"], primaryType: "american_restaurant", name });
    ok(r.category === "food", `self-test: "${name}" is a restaurant and must stay food — got ${r.category}`);
  }
}

// ── 3. The model cannot admit an excluded place ─────────────────────────────
const rooferAdj = classify({ ...roofer, adjudicatedSection: "Activities" });
ok(rooferAdj.excluded === true && rooferAdj.category === null,
  `a model verdict must not rescue an excluded place — Siesta Roofing came back category=${rooferAdj.category}`);

// ── 4. The model cannot override a decided place ────────────────────────────
const dinerAdj = classify({ ...diner, adjudicatedSection: "Hotels" });
ok(dinerAdj.category === "food" && dinerAdj.via === "primaryType",
  `a model verdict must not re-categorise a decided place — got category=${dinerAdj.category} via=${dinerAdj.via}`);

// ── 5. The model cannot mint new taxonomy ───────────────────────────────────
for (const junk of ["Aquarium", "activities", "FOOD", "", null, undefined, 42, "none"]) {
  const r = classify({ ...mote, adjudicatedSection: junk });
  ok(r.category === null && r.section === null,
    `adjudicatedSection ${JSON.stringify(junk)} must resolve to nothing, got category=${r.category}`);
}

// ── 6. The door itself opens ────────────────────────────────────────────────
const moteAdj = classify({ ...mote, adjudicatedSection: "Activities" });
ok(moteAdj.category === "attractions" && moteAdj.via === "adjudicated",
  `Mote with an Activities verdict must classify as attractions via "adjudicated" — got category=${moteAdj.category} via=${moteAdj.via}`);

// ── 7. Omitting adjudication changes nothing ────────────────────────────────
for (const p of [roofer, mote, diner]) {
  const a = JSON.stringify(classify(p));
  const b = JSON.stringify(classify({ ...p, adjudicatedSection: null }));
  ok(a === b, `passing adjudicatedSection:null must be identical to omitting it (${p.name})`);
}

// ── 8. End to end on the REAL payload, frozen from production ───────────────
// wf_places_cache pd1|ChIJrXZ3LLxqw4gRjYTBNBMgJnA, read 2026-08-22. The types
// really are research_institute/point_of_interest/establishment, and the
// summary really is Google's own.
const NOW = "2026-08-22T12:00:00.000Z";
const MOTE_PLACE = {
  id: "ChIJrXZ3LLxqw4gRjYTBNBMgJnA",
  displayName: { text: "Mote Marine Laboratory" },
  location: { latitude: 27.3331533, longitude: -82.5773352 },
  types: ["research_institute", "point_of_interest", "establishment"],
  rating: 4.7, userRatingCount: 9851, businessStatus: "OPERATIONAL",
  editorialSummary: { text: "Aquarium with a stingray touch tank & shark tank plus manatees in the nearby mammal center." },
};

ok(extractPlaceFields(MOTE_PLACE) !== null, "self-test: the frozen Mote payload must extract");

const before = decidePromotion(MOTE_PLACE, "manatee-sarasota", NOW);
ok(before.action === "reject" && /unclassified/.test(before.error),
  `WITHOUT adjudication Mote must still be rejected as unclassified — that is the bug being fixed. Got ${before.action} ${before.error || ""}`);

const after = decidePromotion(MOTE_PLACE, "manatee-sarasota", NOW, "Activities");
ok(after.action === "promote", `WITH an Activities verdict Mote must promote. Got ${after.action}: ${after.error || ""}`);
if (after.action === "promote") {
  ok(after.row.category === "attractions", `Mote must land in attractions, got ${after.row.category}`);
  ok(after.row.needs_review === true, "an adjudicated row MUST land needs_review=true — a model may flag, a human ships");
  ok(after.row.last_verified_at === null, "an adjudicated row may never claim last_verified_at");
  ok(after.row.source === "scout_adjudicated", `an adjudicated row must declare its provenance, got source=${after.row.source}`);
  ok(after.adjudicated === true, "decidePromotion must report that the row was adjudicated");
}

// The excluded place stays excluded through the FULL write path, not just classify().
const ROOFER_PLACE = {
  id: "ChIJEQZ63phHw4gR6gaSIYGS4TQ", displayName: { text: "Siesta Roofing" },
  location: { latitude: 27.3149869, longitude: -82.4431856 },
  types: ["roofing_contractor", "point_of_interest", "establishment"],
  primaryType: "roofing_contractor", rating: 4.9, userRatingCount: 155, businessStatus: "OPERATIONAL",
};
const rooferOut = decidePromotion(ROOFER_PLACE, "manatee-sarasota", NOW, "Activities");
ok(rooferOut.action === "reject",
  "a roofer with an Activities verdict must STILL be rejected — the exclusion runs before adjudication");

// ── 9. The validator refuses laundered provenance ───────────────────────────
// Independently re-derived in validateInventoryRow, so a future caller cannot
// build a row by hand that claims an adjudicated category while looking verified.
if (after.action === "promote") {
  const laundered = { ...after.row, needs_review: false, last_verified_at: NOW, source: "google_type" };
  const v = validateInventoryRow(laundered, { metroKey: "manatee-sarasota", adjudicatedSection: "Activities" });
  ok(!v.ok, "the validator must REJECT an adjudicated row dressed up as a verified google_type row");
  ok(v.errors.some((e) => /needs_review/.test(e)), "…and must say needs_review is the problem");
  ok(v.errors.some((e) => /last_verified_at/.test(e)), "…and must say last_verified_at is the problem");
  ok(v.errors.some((e) => /scout_adjudicated/.test(e)), "…and must say the source is the problem");
  const honest = validateInventoryRow(after.row, { metroKey: "manatee-sarasota", adjudicatedSection: "Activities" });
  ok(honest.ok, `self-test: the honest adjudicated row must PASS the validator — got ${honest.errors.join("; ")}`);
  // Without being told which verdict was applied, the validator cannot re-derive
  // the category and must refuse. Silence is not consent.
  const untold = validateInventoryRow(after.row, { metroKey: "manatee-sarasota" });
  ok(!untold.ok, "the validator must refuse an adjudicated row when no adjudicatedSection is supplied to re-derive it");
}

// ── 10. The parser is fail-closed ───────────────────────────────────────────
const asked = ["A", "B"];
ok(Object.keys(parseAdjudication("", asked)).length === 0, "empty body must yield no verdicts");
ok(Object.keys(parseAdjudication("I'm sorry, I can't help with that.", asked)).length === 0, "prose with no array must yield no verdicts");
ok(Object.keys(parseAdjudication('[{"id":"A","section":', asked)).length === 0, "truncated JSON must yield no verdicts");
{
  const v = parseAdjudication('[{"id":"A","section":"Activities","why":"aquarium"},{"id":"ZZZ","section":"Food","why":"x"}]', asked);
  ok(v.A && v.A.section === "Activities", "a well-formed verdict for an asked id must parse");
  ok(!("ZZZ" in v), "a verdict for an id we did not ask about must be DROPPED — the model may not invent places");
  ok(!("B" in v), "an id the model omitted must be absent, not defaulted");
}
{
  const v = parseAdjudication('[{"id":"A","section":"none","why":"a roofer"},{"id":"B","section":"Aquarium","why":"?"}]', asked);
  ok(v.A && v.A.section === null, '"none" must parse as a stored NO, not as a failure');
  ok(v.B && v.B.section === null, "an out-of-vocabulary section must degrade to null, never mint taxonomy");
}
{
  const v = parseAdjudication('[{"id":"A","section":"Food","why":"first"},{"id":"A","section":"Hotels","why":"second"}]', asked);
  ok(v.A.section === "Food", "a duplicated id must resolve first-wins, not last-write-wins");
}
{
  const fenced = parseAdjudication('```json\n[{"id":"A","section":"Hotels","why":"inn"}]\n```', asked);
  ok(fenced.A && fenced.A.section === "Hotels", "a markdown-fenced reply must still parse");
}

// ── 11. The outcome gate refuses on every path but its own ──────────────────
{
  const abst = classify(mote), decided = classify(diner), excl = classify(roofer);
  ok(adjudicationOutcome(abst, { section: "Activities", why: "aquarium" }).accept === true, "an abstention plus a valid section must be accepted");
  ok(adjudicationOutcome(abst, { section: null, why: "a bartender" }).accept === false, "a null section must be a stored NO");
  ok(adjudicationOutcome(abst, null).accept === false, "a missing verdict must not be accepted");
  ok(adjudicationOutcome(abst, { section: "Aquarium" }).accept === false, "an unknown section must not be accepted");
  ok(adjudicationOutcome(decided, { section: "Hotels" }).accept === false, "a decided place must not be reopened");
  ok(adjudicationOutcome(excl, { section: "Activities" }).accept === false, "an excluded place must not be reopened");

  // AN OMISSION IS NOT A VERDICT — the distinction that decides whether a place
  // the model merely forgot gets binned forever or asked about again. The first
  // live run dropped Sarasota Kayak Rentals (5.0 / 193) from its reply.
  ok(adjudicationOutcome(abst, { section: null, why: "a bartender" }).answered === true,
    'a model that SAYS "not a destination" has answered — that verdict is storable');
  ok(adjudicationOutcome(abst, null).answered === false,
    "a place the model never mentioned must NOT be marked answered, or an omission becomes a permanent rejection");
  ok(adjudicationOutcome(abst, { section: "Aquarium" }).answered === false,
    "an unparseable section must not be stored as a rejection either — retry, do not bin");
  ok(adjudicationOutcome(abst, { section: "Activities" }).answered === true, "an accepted verdict is answered");
}

// The route must ACT on that distinction, not merely receive it.
{
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../app/api/cron/scout/route.js", import.meta.url), "utf8");
  ok(/if\s*\(!out\.answered\)/.test(src),
    "the scout route must skip unanswered places before writing a verdict — otherwise a dropped line bins a good place forever");
  const gate = src.indexOf("!out.answered"), write = src.indexOf("verdictRows.push({\n        place_id");
  ok(gate > -1 && write > -1 && gate < write, "the unanswered check must come BEFORE the verdict write, not after");
}

// ── 12. The cron route must actually be scheduled and secured ───────────────
{
  const { readFileSync, existsSync } = await import("node:fs");
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  ok((vercel.crons || []).some((c) => String(c.path).startsWith("/api/cron/scout")),
    "/api/cron/scout is not in vercel.json crons — an unscheduled scout never looks for anything");
  const routePath = new URL("../app/api/cron/scout/route.js", import.meta.url);
  ok(existsSync(routePath), "app/api/cron/scout/route.js is missing");
  const src = readFileSync(routePath, "utf8");
  ok(/CRON_SECRET/.test(src) && /401/.test(src), "the scout route must require CRON_SECRET");
  ok(/recordPulse\(/.test(src), "the scout route must pulse — a job nothing watches is a job that can die silently (lib/jobPulse.js)");
  ok(/jobCannotRun\(/.test(src), "the scout route must fail LOUDLY on absent config, never return an idle-looking 200");
  ok(/cache: "no-store"/.test(src), 'the scout route must send cache:"no-store" — see check-cron-post-nostore.mjs');
}

if (fails) { console.error(`check-scout-law: ${fails} failure(s)`); process.exit(1); }
console.log("check-scout-law: OK — adjudication is confined to classify()'s abstention, lands needs_review, and the floor holds at 9.2");
