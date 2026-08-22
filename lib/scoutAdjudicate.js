// lib/scoutAdjudicate.js — the ONE place a model may touch the Wayfind
// taxonomy, and the narrow gate it must go through.
//
// ── THE DEFECT THIS ANSWERS (measured in production, 2026-08-22) ────────────
//
//   Mote Marine Laboratory          4.7 / 9,851 reviews -> Wayfind score 94
//   Westcoast Black Theatre Troupe  4.9 /   528 reviews -> Wayfind score 96
//
// Both are in wf_place_ids. Both had Place Details fetched AND PAID FOR. Both
// were rejected by the promoter as `unclassified: unclassified (no type/name
// signal)` and have never been servable. 294 places sit in that bucket. 40 of
// them clear the owner's 9.2 floor; 19 clear 9.5.
//
// The cause is not a bad rule. It is a MISSING MODALITY. Mote's Google types
// are ["research_institute","point_of_interest","establishment"] — nothing in
// ACTIVITY_TYPE matches and the name carries no aquarium/museum/zoo token. But
// the SAME payload carries Google's own editorialSummary:
//
//   "Aquarium with a stingray touch tank & shark tank plus manatees in the
//    nearby mammal center."
//
// The answer was already in the record we bought. A regex cannot read a
// sentence. That, and only that, is why a model is invoked here.
//
// ── THE LAW THIS FILE OBEYS ─────────────────────────────────────────────────
//
// classify() already distinguishes two different facts, and that distinction is
// what makes this safe:
//
//   { excluded: true,  reason: "..." }   a VERDICT    — "I decided: not a place"
//   { excluded: false, section: null }   an ABSTENTION — "I have no signal"
//
// A model may adjudicate the ABSTENTION and nothing else. It may never overturn
// a verdict, never re-categorise a place classify() decided, never touch a
// score, and never admit a place classify() excluded. The section it returns is
// fed back through classify()'s own vocabulary, so a hallucinated section
// resolves to nothing rather than minting new taxonomy.
// scripts/check-scout-law.mjs fails the build if any of that stops being true.
//
// FAIL-CLOSED, ALWAYS. Unreachable model, junk JSON, or an answer about a place
// we did not ask about -> the place stays exactly where it was: unclassified
// and unserved. A scout that invents inventory when its judgment is unavailable
// is worse than one that finds nothing.
//
// AND IT IS STILL ONLY A FLAG. An adjudicated row lands needs_review=true with
// last_verified_at=null — the same treatment lib/seedPlaces.js gives a
// name-recovered row, for the same reason. The model may FLAG. A human ships.

import { wayfindScore, WAYFIND_SCORE_M, WAYFIND_SCORE_C } from "./wayfindScore.js";

// The owner's floor: "always be looking for places above 9.2". On
// lib/wayfindScore.js's 0-100 scale that is 92. Imported, never re-derived —
// re-implementing the score is the exact defect wayfindScore.js exists to end.
export const SCOUT_FLOOR = 92;

// The vocabulary classify() speaks. A model answer outside this set is not a
// new section, it is a parse failure.
export const SECTIONS = Object.freeze(["Food", "Nightlife", "Activities", "Hotels", "Shopping"]);
const SECTION_SET = new Set(SECTIONS);

// How many reviews a place needs AT a given rating to clear `floor`.
//
// Inverts the Bayesian blend so the SQL prefilter can be derived from the
// formula instead of hand-tuned beside it. score >= floor iff the unrounded
// blend >= (floor - 0.5) / 20, so:
//
//     v * (r - T) >= m*T - m*C      with T = (floor - 0.5) / 20
//
// Returns Infinity when the rating alone can never reach the floor (a 4.5 star
// place cannot become a 9.2 no matter how many people agree).
export function minReviewsFor(rating, floor = SCOUT_FLOOR) {
  const r = Number(rating);
  if (!isFinite(r) || r <= 0) return Infinity;
  const T = (Number(floor) - 0.5) / 20;
  if (r <= T) return Infinity;
  const need = (WAYFIND_SCORE_M * T - WAYFIND_SCORE_M * WAYFIND_SCORE_C) / (r - T);
  return Math.max(0, Math.ceil(need));
}

/** Does this rating/review pair clear the floor? Uses THE score, not a copy. */
export function clearsFloor(rating, reviews, floor = SCOUT_FLOOR) {
  const s = wayfindScore(rating, reviews);
  return s != null && s >= floor;
}

/**
 * The ONLY state a model is allowed to act on: classify() looked and abstained.
 * An excluded place (a roofer, a car dealer, a condo complex) is a DECISION and
 * is never reopened here.
 */
export function needsAdjudication(c) {
  return !!c && c.excluded !== true && !c.section && !c.category;
}

// The system prompt. Written against the ACTUAL contents of the abstention
// bucket, which is the part that matters: it holds Mote Marine Laboratory
// (score 94) and Siesta Roofing (score 92, 4.9 stars, 155 delighted customers)
// side by side. A Google rating measures how well a business serves whoever
// walks in; it says nothing about whether a stranger would want to go there.
// Separating those two is the whole job.
export const ADJUDICATE_SYSTEM = [
  "You triage places for Wayfind, a local discovery app. Wayfind answers one question: \"where should I go?\"",
  "",
  "For each place, decide which section it belongs to, or none:",
  "  Food        — restaurants, cafes, bakeries, food halls, breweries you eat at",
  "  Nightlife   — bars, pubs, clubs, live-music rooms, late lounges",
  "  Activities  — anything you GO AND DO or GO AND SEE: museums, aquariums, zoos,",
  "                theatres, galleries, parks, beaches, trails, gardens, tours,",
  "                boat/jet-ski/kayak rentals, mini golf, arcades, bowling, spas,",
  "                historic sites, wildlife centres, science and research centres",
  "                that are open to visitors",
  "  Hotels      — hotels, motels, inns, resorts, B&Bs, campgrounds, RV parks",
  "  Shopping    — shops, boutiques, malls, markets, outlets",
  "  none        — everything else",
  "",
  "ANSWER none FOR SERVICE BUSINESSES, however well reviewed. A five-star roofer,",
  "plumber, electrician, contractor, pool company, landscaper, car dealer, repair",
  "shop, dentist, doctor, clinic, physical therapist, chiropractor, lawyer,",
  "accountant, insurance or real-estate agent, bank, gym franchise, salon,",
  "storage yard, wholesaler, church, school, office, private club, apartment",
  "complex or coaching/lessons business is NOT somewhere a visitor goes. High",
  "ratings are the norm for these and mean nothing here.",
  "",
  "ALSO ANSWER none FOR: adult venues (strip clubs, gentlemen's clubs, adult",
  "stores), cannabis dispensaries, food banks, pantries, shelters and charities,",
  "places of worship, and hospitals. Some are real destinations for someone; they",
  "are not what this app recommends. This is a POLICY line, not a judgement call —",
  "apply it even when the place is excellent and well reviewed.",
  "",
  "The `description` field is Google's own summary and is the strongest signal —",
  "trust it over the type list. \"Aquarium with a stingray touch tank\" is",
  "Activities even when the types only say research_institute.",
  "",
  "If you are not confident the place is a genuine destination, answer none.",
  "A missed museum is cheap; a roofer on the homepage is not.",
  "",
  "Return ONLY a JSON array, no prose, no markdown fence. One object per input:",
  '  {"id":"<the exact id given>","section":"Activities","why":"<max 12 words>"}',
  "Include every id exactly once. Use the ids verbatim.",
].join("\n");

/** The user payload for one batch — only fields we already paid Google for. */
export function buildAdjudicationBatch(rows) {
  return JSON.stringify(
    (rows || []).map((r) => ({
      id: r.place_id,
      name: r.name || null,
      types: Array.isArray(r.google_types) ? r.google_types.slice(0, 8) : [],
      description: r.editorial || null,
      address: r.address || null,
      rating: r.rating ?? null,
      reviews: r.reviews ?? 0,
    }))
  );
}

/**
 * Parse a model reply into verdicts, STRICTLY.
 *
 * Every rule here is fail-closed, and each one is a real failure mode:
 *   - unparseable body            -> {} (nothing moves)
 *   - an id we did not ask about  -> dropped (never invents a place)
 *   - a section outside SECTIONS  -> dropped (never mints taxonomy)
 *   - a duplicate id              -> first wins (no last-write-wins ambiguity)
 *   - an id we asked about that
 *     is missing from the reply   -> simply absent; the caller leaves it alone
 *
 * @param {string} text  raw model text
 * @param {string[]} askedIds  the ids sent in this batch
 * @returns {Object<string,{section:string|null,why:string}>}
 */
export function parseAdjudication(text, askedIds) {
  const asked = new Set(askedIds || []);
  const out = {};
  let body = String(text || "").trim();
  if (!body) return out;
  body = body.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  // Tolerate a model that wraps the array in prose; take the outermost array.
  const first = body.indexOf("["), last = body.lastIndexOf("]");
  if (first === -1 || last <= first) return out;
  let arr;
  try { arr = JSON.parse(body.slice(first, last + 1)); } catch { return out; }
  if (!Array.isArray(arr)) return out;
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const id = typeof item.id === "string" ? item.id : null;
    if (!id || !asked.has(id) || Object.prototype.hasOwnProperty.call(out, id)) continue;
    const raw = typeof item.section === "string" ? item.section.trim() : "";
    const section = SECTION_SET.has(raw) ? raw : null;   // "none" and junk both land here
    const why = typeof item.why === "string" ? item.why.trim().slice(0, 120) : "";
    out[id] = { section, why };
  }
  return out;
}

/**
 * The gate itself. Returns the section classify() should be re-run with, or
 * null. Refuses on every path except the one it exists for.
 *
 * `answered` is a SEPARATE fact from `accept`, and conflating them costs real
 * places. "The model said this is not a destination" is a verdict worth storing
 * forever. "The model did not mention this place" is not a verdict at all —
 * models drop rows from long batches, and the first live run dropped Sarasota
 * Kayak Rentals (5.0 / 193, plainly a real rental). Storing that omission as a
 * rejection would have binned it permanently on a coin flip. Only `answered`
 * outcomes may be written to wf_scout_verdicts; the rest come back next run.
 *
 * @param {object} classification  the result of classify() for this place
 * @param {object} verdict         a parseAdjudication entry
 * @returns {{accept:boolean, answered:boolean, section:string|null, reason:string}}
 */
export function adjudicationOutcome(classification, verdict) {
  if (!needsAdjudication(classification)) {
    return { accept: false, answered: false, section: null, reason: "classify() already decided — not reopened" };
  }
  if (!verdict) return { accept: false, answered: false, section: null, reason: "model returned no verdict for this place — will retry" };
  if (!verdict.section) return { accept: false, answered: true, section: null, reason: verdict.why || "model: not a destination" };
  if (!SECTION_SET.has(verdict.section)) {
    return { accept: false, answered: false, section: null, reason: `model returned unknown section "${verdict.section}" — will retry` };
  }
  return { accept: true, answered: true, section: verdict.section, reason: verdict.why || "model: destination" };
}
