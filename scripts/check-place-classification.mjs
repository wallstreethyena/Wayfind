// scripts/check-place-classification.mjs — v7.22
//
// THE DEFECT THIS EXISTS TO PREVENT COMING BACK.
//
// lib/ranking.js classifies a place with typeList(), and typeList() read only
// `types` / `type` — the Google Places shape. But the two RPCs that feed the
// entire homepage return different shapes, verified against pg_proc:
//
//   wf_best_picks    -> { name, category, primary_type }   NO types array
//   wf_things_to_do  -> { kind, title, category }          NO types, NO name
//
// So every card in "The Best Around You", "Actually Worth Eating" and "What
// Should We Do Today?" arrived with an EMPTY type list and fell through to the
// name-spelling regexes. Two consequences, both measured on production
// 2026-08-12 before the fix:
//
//   1. venueLean classified on spelling. "Emerson Point Preserve" and "Jiggs
//      Landing" have the IDENTICAL primary_type `nature_preserve`; only the
//      first was suppressed on a storm day. `bridge` and
//      `adventure_sports_center` read as neutral, so the Sunshine Skyway
//      Bridge and an outdoor ropes course survived a lightning-storm gate.
//   2. coarseCat returned null for every DB row, which silently zeroed
//      dayFit() and bucketAdjust() — the whole time-of-day reweighting — on
//      the rail whose own header promises "ranked for this hour".
//
// This guard EXECUTES the classifier on the real row shapes rather than
// grepping for the fix, because the failure was invisible in the source: every
// line looked correct in isolation and only the row shape made it wrong.
import { venueLean, coarseCat, gateOutdoor } from "../lib/ranking.js";
import { nowContext } from "../lib/nowContext.js";
import { daypartCompose } from "../lib/todaysBest.js";

let pass = 0;
const fail = (m) => { console.error("check-place-classification: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const outdoorish = (r) => { const v = venueLean(r); return v.water || v.lean === "outdoor"; };

// ── 1. wf_best_picks rows classify on primary_type, not on spelling ─────────
// Every row below is copied from a live wf_best_picks(27.5878,-82.4237,...) call.
{
  const P = (name, primary_type) => ({ name, category: "attractions", primary_type });

  ok(outdoorish(P("Emerson Point Preserve", "nature_preserve")),
    "a nature_preserve is outdoor");
  ok(outdoorish(P("Jiggs Landing", "nature_preserve")),
    "…and so is the OTHER nature_preserve, whose name happens to contain no outdoor word — this pair is the whole bug");
  ok(outdoorish(P("Sunshine Skyway Bridge", "bridge")),
    "a bridge is outdoor — it survived a lightning-storm gate at rank #4 of The Best Around You");
  ok(outdoorish(P("TreeUmph! Adventure Course", "adventure_sports_center")),
    "an adventure_sports_center is outdoor — an exposed ropes course is not a storm-day answer");
  ok(outdoorish(P("Fort Hamer Park", "park")), "a park is outdoor");
  ok(!outdoorish(P("Florida Railroad Museum", "museum")), "a museum is not outdoor");
  ok(venueLean(P("Ca' d'Zan", "museum")).lean === "indoor",
    "…it is INDOOR, not merely 'not outdoor' — the indoor read is what earns the bad-weather boost in weatherFit");

  // A name with no keyword and no type is still allowed through: absence of
  // evidence is not evidence of outdoors. This is the fail-open half.
  ok(!outdoorish({ name: "Somewhere Unknown", category: "attractions", primary_type: null }),
    "a row with no type and no name evidence is NOT assumed outdoor — the gate must fail open");
}

// ── 2. coarseCat resolves for DB rows, so the daypart math is not inert ─────
{
  ok(coarseCat({ name: "Fort Hamer Park", category: "attractions", primary_type: "park" }) === "Activities",
    "coarseCat resolves a wf_best_picks attractions row — it returned null for every one of them, zeroing dayFit and bucketAdjust");
  ok(coarseCat({ name: "Rocco's Tacos", category: "food", primary_type: "mexican_restaurant" }) === "Food",
    "…and a food row");
  ok(coarseCat({ name: "Ruby's Elixir", category: "nightlife", primary_type: "bar" }) === "Nightlife",
    "…and a nightlife row");
  ok(coarseCat({ title: "Siesta Beach", category: "beach", kind: "place" }) === "Activities",
    "…and a wf_things_to_do beach row, which carries `title` and no `name` at all");
}

// ── 3. wf_things_to_do rows: title is read, and beaches are water ───────────
{
  const beaches = [
    { kind: "place", title: "Siesta Beach", category: "beach" },
    { kind: "place", title: "Manatee Public Beach", category: "beach" },
    { kind: "place", title: "Fort De Soto", category: "beach" },
  ];
  ok(beaches.every((b) => venueLean(b).water),
    "every wf_things_to_do beach row reads as WATER — these rows carry `title` not `name`, so venueLean saw an empty string and returned neutral for all of them");
}

// ── 4. Supplier products are classified on their title ─────────────────────
// A Viator row has no Google type at all. Before v7.22 every one of them was
// `neutral`, so a stubbed weather code 95 (thunderstorm) left the live rail
// leading with six open-water tours.
{
  const E = (title) => ({ kind: "experience", title, category: "experience", booking_url: "x" });
  ok(venueLean(E("Sarasota Guided Mangrove Tunnel Kayak Tour")).water,
    "a kayak tour is water");
  ok(venueLean(E("Anna Maria Island Dolphin Sunset Boat Tour")).water,
    "a dolphin boat tour is water");
  ok(venueLean(E("Siesta Key Electric Bike Sunset Tour")).lean === "outdoor",
    "an e-bike tour is outdoor");
  ok(venueLean(E("The Ringling Museum Guided Art Tour")).lean !== "outdoor",
    "…but an indoor museum tour is NOT suppressed — the rule must not simply delete all bookable inventory when it rains");
  // Both of these reached a live lightning-storm rail after the first pass of
  // this rule, and neither was found by reading the regex.
  ok(venueLean(E("Gulf Islands Adventures - 2 hour Craigcat Tour AMI")).water,
    "a PLURAL 'Islands' and the boat noun 'Craigcat' are both caught — \\bisland\\b matched neither");
  ok(venueLean(E("Anna Maria Island Dolphin Sightseeing Adventure")).water, "…and the singular still is");
  ok(venueLean(E("Sunset Kayaking with Dolphins")).water, "…and a gerund form ('Kayaking')");

  const storm = nowContext({ lat: 27.5878, lng: -82.4237, hour: 14, weather: { temp: 78, rain: 95, wet: true, label: "Thunderstorm", code: 95 } });
  ok(storm.outdoorOK === false, "weather code 95 shuts the gate");
  const survivors = gateOutdoor([
    E("Sarasota Guided Mangrove Tunnel Kayak Tour"),
    E("Anna Maria Island Dolphin Sunset Boat Tour"),
    E("Mangrove Tunnel & Manatee Kayak Eco-Tour"),
    E("The Ringling Museum Guided Art Tour"),
    { kind: "place", title: "Siesta Beach", category: "beach" },
  ], storm);
  ok(survivors.length === 1 && /Ringling/.test(survivors[0].title),
    "under a thunderstorm only the indoor tour survives — got " + JSON.stringify(survivors.map((r) => r.title)));
}

// ── 5. Today's real weather is the case this shipped for ───────────────────
// Parrish, 2026-08-12: 85°F air but 97°F feels-like at 10am, 103°F by 2pm.
// The heat advisory threshold is a FEELS-LIKE 95, so the afternoon gate shuts.
{
  const heat = nowContext({ lat: 27.5878, lng: -82.4237, hour: 14, weather: { temp: 89, feels: 103, rain: 3, wet: false, label: "Clear", code: 0 } });
  ok(heat.outdoorOK === false && /heat advisory/.test(heat.gateWhy || ""),
    "a 103° feels-like afternoon shuts the gate on a heat advisory, not on rain");
  const morning = nowContext({ lat: 27.5878, lng: -82.4237, hour: 9, weather: { temp: 85, feels: 97, rain: 3, wet: false, label: "Clear", code: 0 } });
  ok(morning.outdoorOK === true,
    "…and the SAME heat leaves the morning open — suppressing the beach at 9am would be the mirror-image error");
}

// ── 6. A tour that names its own hour is not a morning answer ───────────────
{
  const morningCtx = { timeBucket: "morning" };
  const rows = [
    { kind: "experience", title: "Anna Maria Island Dolphin Sunset Boat Tour", category: "experience" },
    { kind: "experience", title: "Sarasota Guided Mangrove Tunnel Kayak Tour", category: "experience" },
    { kind: "experience", title: "Myakka Morning Wildlife Tour", category: "experience" },
    { kind: "experience", title: "City Sightseeing Trolley Tour", category: "experience" },
  ];
  const out = daypartCompose(rows, morningCtx).map((r) => r.title);
  ok(!out.some((t) => /Sunset/.test(t)),
    "a SUNSET tour does not lead a morning list — it ranked #4 at 10:30am on the live rail");
  ok(out.length === 3,
    "…and the other three bookable tours are untouched: this drops the ones that name their hour, not supplier inventory in general");
  const nightOut = daypartCompose(rows, { timeBucket: "night" }).map((r) => r.title);
  ok(nightOut.length === 4, "…and at night the sunset tour is back, because that is when it is the right answer");
}

console.log("check-place-classification: " + pass + " assertions green");
