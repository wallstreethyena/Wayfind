// v5.69 prebuild gate — the List Engine's deterministic core: rotation-library
// data conditions, list-type selection (weather/time gates + unbuildable types
// refused), and the hard-rule output validator (no dashes in copy, exactly 10,
// one contrarian, char limits, sequential ranks). The LLM copy itself is not
// testable here; these are the rules that decide what may ship.
import { statSync } from "fs";
import {
  LIST_TYPES, LIST_TYPE_BY_ID, qualifyingPlaces, selectListTypes,
  buildListInput, validateListOutput, minutesUntilClose, localHourOf,
  headlineSize, truncName, fitTickerItems, splitAccent,
} from "../lib/listEngine.js";

let failures = 0;
const fail = (m) => { console.error("test-list-engine: FAIL — " + m); failures++; };
const ok = (c, m) => { if (!c) fail(m); };

// ── time helpers ──
{
  const t = localHourOf("2026-07-11T19:14:00-04:00");
  ok(t && t.h === 19 && t.min === 14, "localHourOf must read venue-local 19:14 off the ISO offset, not shift tz");
  ok(minutesUntilClose("22:00", "2026-07-11T21:15:00-04:00") === 45, "minutesUntilClose 21:15->22:00 should be 45");
  ok(minutesUntilClose("02:00", "2026-07-11T23:30:00-04:00") === 150, "a post-midnight 02:00 close from 23:30 should be 150, not negative");
  ok(minutesUntilClose("18:00", "2026-07-11T19:00:00-04:00") === -60, "an already-closed venue is negative (not in the 0-90 window)");
}

// ── condition predicates ──
{
  const q = LIST_TYPE_BY_ID.underexposed.qualifies;
  ok(q({ rating: 4.8, review_count: 71 }), "underexposed: 4.8 / 71 qualifies");
  ok(!q({ rating: 4.8, review_count: 1500 }), "underexposed: 1500 reviews does NOT qualify");
  ok(!q({ rating: 4.5, review_count: 40 }), "underexposed: 4.5 stars does NOT qualify");
  ok(!q({ rating: 4.9, review_count: 0 }), "underexposed: 0 reviews (no signal) does NOT qualify");

  const vs = LIST_TYPE_BY_ID.value_shock.qualifies;
  ok(vs({ rating: 4.8, price_level: 1 }), "value_shock: 4.8 / $ qualifies");
  ok(!vs({ rating: 4.8, price_level: 3 }), "value_shock: $$$ does NOT qualify");

  const cs = LIST_TYPE_BY_ID.closing_soon.qualifies;
  ok(cs({ open_now: true, closes_at: "22:00" }, { local_time: "2026-07-11T21:00:00-04:00" }), "closing_soon: closes in 60 min qualifies");
  ok(!cs({ open_now: true, closes_at: "23:59" }, { local_time: "2026-07-11T21:00:00-04:00" }), "closing_soon: closes in 179 min does NOT qualify");
  ok(!cs({ open_now: false, closes_at: "22:00" }, { local_time: "2026-07-11T21:00:00-04:00" }), "closing_soon: an already-closed place does NOT qualify");
}

// ── list-level gates ──
{
  const hot = { local_time: "2026-07-11T15:00:00-04:00", weather: { temp_f: 94, condition: "Overcast" } };
  const mild = { local_time: "2026-07-11T15:00:00-04:00", weather: { temp_f: 78, condition: "Clear" } };
  const indoorPlaces = [
    { name: "A", tags: ["museum"] }, { name: "B", tags: ["aquarium"] },
    { name: "C", tags: ["restaurant"] }, { name: "D", tags: ["beach", "water"] },
  ];
  ok(qualifyingPlaces("heat_list", indoorPlaces, hot).length === 3, "heat_list at 94F keeps the 3 indoor/water places");
  ok(qualifyingPlaces("heat_list", indoorPlaces, mild).length === 0, "heat_list gate closed at 78F -> no places");

  const rainy = { local_time: "2026-07-11T15:00:00-04:00", weather: { temp_f: 80, condition: "Thunderstorm" } };
  ok(qualifyingPlaces("rain_list", indoorPlaces, rainy).length === 2, "rain_list in a thunderstorm keeps only indoor (not the beach)");

  const late = { local_time: "2026-07-11T22:47:00-04:00" };
  const early = { local_time: "2026-07-11T19:47:00-04:00" };
  const openPlaces = [{ name: "A", open_now: true }, { name: "B", open_now: false }, { name: "C", open_now: true }];
  ok(qualifyingPlaces("still_open", openPlaces, late).length === 2, "still_open after 22:00 keeps the 2 open places");
  ok(qualifyingPlaces("still_open", openPlaces, early).length === 0, "still_open gate closed at 19:47");
}

// ── unbuildable types are refused, never faked ──
{
  for (const id of ["locals_vs_tourists", "most_divisive", "price_gradient", "hundred_dollar_saturday", "three_hours"]) {
    ok(LIST_TYPE_BY_ID[id] && LIST_TYPE_BY_ID[id].available === false, `${id} must be present but available:false`);
    ok(qualifyingPlaces(id, [{ name: "X", rating: 5, review_count: 50, price_level: 1 }], {}).length === 0, `${id} must never return qualifying places (it is unbuildable)`);
  }
  const sel = selectListTypes([{ name: "X", rating: 4.8, review_count: 50 }], {});
  ok(!sel.some((t) => LIST_TYPE_BY_ID[t.id].available === false), "selectListTypes must never surface an unavailable type");
}

// ── selection ranks by support ──
{
  const places = Array.from({ length: 8 }, (_, i) => ({ name: "P" + i, rating: 4.8, review_count: 50, price_level: 1 }));
  const sel = selectListTypes(places, {});
  ok(sel.length >= 2 && sel[0].count >= sel[sel.length - 1].count, "selectListTypes returns supported types sorted by count desc");
  ok(sel.some((t) => t.id === "underexposed") && sel.some((t) => t.id === "value_shock"), "both underexposed and value_shock should qualify for this pool");
}

// ── buildListInput slims + pins the type ──
{
  const input = buildListInput({ city: "Sarasota", category: "eat", list_type: "underexposed", local_time: "2026-07-11T19:00:00-04:00", weather: null, places: [{ name: "Twenty Pho Hour", rating: 4.8, review_count: 71, price_level: 1, distance_mi: 3.2, tags: ["vietnamese"], secret: "SHOULD_NOT_LEAK" }] });
  ok(input.list_type === "underexposed" && input.headline_job === "contradiction", "buildListInput pins type + headline job");
  ok(input.places.length === 1 && input.places[0].secret === undefined, "buildListInput slims places to the whitelisted fields only");
}

// ── the hard-rule validator ──
function goodList() {
  return {
    headline: "The best restaurant in Sarasota right now has 71 reviews.",
    subhead: "Ten places, ranked by rating and how few people know yet.",
    method: "Ranked by rating, review depth, distance, and open now. No ads. Nobody paid to be here.",
    share_card_headline: "The best in Sarasota has 71 reviews",
    share_card_teaser: "Number one has 71 reviews and closes in an hour.",
    og_description: "Ten Sarasota spots ranked by rating and obscurity. Number one has 71 reviews. Tap to see who.",
    hook: { lines: ["Sarasota's #1 hot dog", "is at a gas station."], accent: "gas station" },
    bar_label: "See which one",
    hook_type: "surprise",
    generated_at: "2026-07-11T19:14:00-04:00",
    items: [
      { rank: 1, name: "Twenty Pho Hour", verdict: "The broth is the whole point.", reason: "Highest rating in the set with the fewest reviews.", contrarian: false },
      { rank: 2, name: "Bocas House", verdict: "Go for the arepas.", reason: "Nearly the same rating, twice the reviews.", contrarian: true },
      { rank: 3, name: "Second Street Deli", verdict: "The sandwich locals send people to.", reason: "Strong rating, still under the radar.", contrarian: false },
    ],
  };
}
{
  ok(validateListOutput(goodList(), "eat").ok, "a clean list validates");

  const dash = goodList(); dash.items[0].verdict = "The broth is the point, well-made.";
  ok(!validateListOutput(dash, "eat").ok, "an inter-word hyphen in copy is flagged");

  const emdash = goodList(); emdash.headline = "Two miles inland — half the price.";
  ok(!validateListOutput(emdash, "eat").ok, "an em dash in copy is flagged");

  const bang = goodList(); bang.subhead = "You will love these!";
  ok(!validateListOutput(bang, "eat").ok, "an exclamation point is flagged");

  const twoC = goodList(); twoC.items[2].contrarian = true;
  ok(!validateListOutput(twoC, "eat").ok, "two contrarian items are flagged");

  const zeroC = goodList(); zeroC.items[1].contrarian = false;
  ok(!validateListOutput(zeroC, "eat").ok, "zero contrarian items are flagged");

  const longHead = goodList(); longHead.share_card_headline = "x".repeat(61);
  ok(!validateListOutput(longHead, "eat").ok, "share_card_headline over 60 chars is flagged");

  const longOg = goodList(); longOg.og_description = "y".repeat(156);
  ok(!validateListOutput(longOg, "eat").ok, "og_description over 155 chars is flagged");

  const gem = goodList(); gem.subhead = "A real hidden gem list.";
  ok(!validateListOutput(gem, "eat").ok, '"hidden gem" outside category=gems is flagged');
  ok(validateListOutput(gem, "gems").ok === true || validateListOutput(gem, "gems").violations.every((v) => !/hidden gem/.test(v)), '"hidden gem" is allowed when category is gems');

  const gap = goodList(); gap.items = gap.items.concat([{ rank: 5, name: "Skips four", verdict: "x", reason: "y", contrarian: false }]);
  ok(!validateListOutput(gap, "eat").ok, "non-sequential ranks are flagged");

  const big = goodList(); big.items = Array.from({ length: 11 }, (_, i) => ({ rank: i + 1, name: "P" + i, verdict: "v", reason: "r", contrarian: i === 0 }));
  ok(!validateListOutput(big, "eat").ok, "more than 10 items is flagged");

  const noHead = goodList(); noHead.headline = "";
  ok(!validateListOutput(noHead, "eat").ok, "an empty required field is flagged");
}

// ── the share-card hook rules (Part 2) ──
{
  const noHook = goodList(); delete noHook.hook;
  ok(!validateListOutput(noHook, "eat").ok, "a missing hook object is flagged");

  const threeLines = goodList(); threeLines.hook = { lines: ["a", "b", "c"], accent: "a" };
  ok(!validateListOutput(threeLines, "eat").ok, "a hook with 3 lines is flagged");

  const longLine = goodList(); longLine.hook = { lines: ["This line is way too long to fit", "ok"], accent: "ok" };
  ok(!validateListOutput(longLine, "eat").ok, "a hook line over 24 chars is flagged");

  const badAccent = goodList(); badAccent.hook = { lines: ["Sarasota's #1 hot dog", "is at a gas station."], accent: "airport lounge" };
  ok(!validateListOutput(badAccent, "eat").ok, "an accent phrase not present in a line is flagged");

  const noBar = goodList(); delete noBar.bar_label;
  ok(!validateListOutput(noBar, "eat").ok, "a missing bar_label is flagged");

  const longBar = goodList(); longBar.bar_label = "See which one is best now";
  ok(!validateListOutput(longBar, "eat").ok, "a bar_label over 16 chars is flagged");

  const badType = goodList(); badType.hook_type = "clever";
  ok(!validateListOutput(badType, "eat").ok, "a hook_type off the ladder is flagged");

  const dashHook = goodList(); dashHook.hook = { lines: ["Two-for-one tonight", "downtown only"], accent: "downtown only" };
  ok(!validateListOutput(dashHook, "eat").ok, "a dash inside a hook line is flagged");
}

// ── card helpers (Part 3/4) ──
{
  ok(headlineSize(["short", "line"]) === 101, "headlineSize: <=20 chars -> 101");
  ok(headlineSize(["Sarasota's number one hot dog spot", "x"]) === 62, "headlineSize: >30 chars -> 62");
  ok(headlineSize(["twenty two chars here!", "x"]) === 88, "headlineSize: 21-24 chars -> 88");
  ok(headlineSize(["twenty seven characters here", "x"]) === 74, "headlineSize: 25-30 chars -> 74");

  ok(truncName("Georgie's Dogs") === "Georgie's Dogs", "truncName: short name unchanged");
  ok(truncName("The Very Long Restaurant Name Co").length === 18, "truncName: long name capped to 18");
  ok(truncName("The Very Long Restaurant Name Co").endsWith("…"), "truncName: capped name ends with ellipsis");

  const many = fitTickerItems([
    { rank: 2, name: "Aaaaaaaaaaaaaaaaaaaaaaaa", rating: 4.7 },
    { rank: 3, name: "Bbbbbbbbbbbbbbbbbbbbbbbb", rating: 4.6 },
    { rank: 4, name: "Cccccccccccccccccccccccc", rating: 4.5 },
    { rank: 5, name: "Dddddddddddddddddddddddd", rating: 4.4 },
  ]);
  ok(many.every((it) => it.name.length <= 18), "fitTickerItems: all names truncated to <=18");
  ok(many.length >= 2 && many.length <= 4, "fitTickerItems: keeps 2-4, drops from the end to avoid overflow");

  const segs = splitAccent("is at a gas station.", "gas station");
  ok(segs.length === 3 && segs[1].accent === true && segs[1].text === "gas station", "splitAccent: isolates the accent phrase with the plain text around it");
  ok(splitAccent("no accent here", "missing").length === 1, "splitAccent: a non-substring accent yields one plain segment");
}

// ── the share card's fonts must exist (Satori has no fallback for a missing
// face; a deleted font silently wrecks the card). Guard the subset .ttf files.
{
  const fontDir = new URL("../app/api/og/list/fonts/", import.meta.url);
  for (const f of ["Anton-Latin.ttf", "Archivo-600-Latin.ttf", "Archivo-700-Latin.ttf", "Archivo-900-Latin.ttf"]) {
    let sz = 0;
    try { sz = statSync(new URL(f, fontDir)).size; } catch (e) {}
    ok(sz > 5000, `share-card font ${f} must exist and be a real subset (>5KB), got ${sz} bytes`);
  }
}

if (failures) { console.error(`test-list-engine: ${failures} failure(s)`); process.exit(1); }
console.log("test-list-engine: OK — conditions, gates, hook rules, card helpers, and the share-card fonts all hold");
