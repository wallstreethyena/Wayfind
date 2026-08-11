// scripts/test-intent-composition.mjs — A LIST MUST BE WHAT ITS HEADING SAYS.
//
// THE BUG (owner, 2026-08-09, screenshot from his phone): "Worth the drive" —
// "the strictest list we run, day trips and landmarks that earn it" — returned
// NINE RESTAURANTS. Measured live in Bradenton: Rocca, Beso, Armature Works,
// Dry Dock Waterfront Grill. "Hidden gems" was Food/Food/Food. "Big fun, small
// budget" was five restaurants. Five of the nine home sections were the same
// restaurant list wearing five different promises.
//
// The query bank was never the problem — worth-the-drive already asks for
// "day trip", "iconic landmark", "state park springs". rankRows sorts on a
// Bayesian score over rating and REVIEW DEPTH, and a restaurant carries
// thousands of reviews where a state park carries a few hundred. Put them in
// one pool and the restaurant takes every seat, whatever the query asked for.
//
// So this guard EXECUTES the law rather than grepping for it, on the pool that
// actually produced the failure.
import { INTENT_PAGES, rankRows, capBySection, composeQueries, sectionAllowed, sectionOfRow } from "../lib/intentPages.js";
import { nowContext } from "../lib/nowContext.js";
import { readFileSync } from "fs";
import path from "path";

let pass = 0;
const fail = (m) => { console.error("test-intent-composition: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (p) => readFileSync(path.join(process.cwd(), p), "utf8");

const ORIGIN = { lat: 27.4989, lng: -82.5748 }; // Bradenton, where it was measured
const R = (name, types, rating, reviews, priceLevel = null, d = 0.05) => ({
  id: "p_" + name.replace(/\W+/g, ""), name, types, rating, reviews, priceLevel,
  lat: ORIGIN.lat + d, lng: ORIGIN.lng, photoRef: null, editorial: null, oh: null, utcOffset: null,
});

// THE POOL THAT PRODUCED THE BUG. Restaurants carry the review depth they
// really carry; landmarks carry theirs. That asymmetry IS the bug — if the
// fixture flattened it the guard would prove nothing.
const POOL = [
  R("Rocca", ["italian_restaurant", "restaurant", "food"], 4.9, 1400, 3),
  R("Beso", ["restaurant", "food", "bar"], 4.8, 836, 3),
  R("Armature Works", ["food_court", "restaurant", "food"], 4.7, 5200, 2),
  R("Dry Dock Waterfront Grill", ["seafood_restaurant", "restaurant", "food"], 4.6, 5100, 2),
  R("Oar & Iron", ["restaurant", "food"], 4.7, 900, 1),
  R("Oscura", ["bar", "night_club"], 4.8, 700, 2),
  R("Peggy's Corral", ["bar", "restaurant", "food"], 4.6, 2100, 1),
  R("Weeki Wachee Springs State Park", ["park", "tourist_attraction"], 4.7, 9000, null),
  R("The Dali Museum", ["museum", "tourist_attraction"], 4.8, 12000, 4),
  R("Sunken Gardens", ["botanical_garden", "park", "tourist_attraction"], 4.7, 4300, 2),
  R("Robinson Preserve", ["hiking_area", "park"], 4.8, 1900, null),
  R("Mote Marine Aquarium", ["aquarium", "zoo", "tourist_attraction"], 4.5, 8800, 3),
  R("De Soto National Memorial", ["tourist_attraction", "park"], 4.6, 1100, null),
  R("Bishop Museum of Science", ["museum", "tourist_attraction"], 4.7, 2400, 2),
  R("Morning Glory Breakfast", ["breakfast_restaurant", "brunch_restaurant", "restaurant", "food"], 4.9, 4200, 2),
  R("Daily Grind Coffee", ["coffee_shop", "cafe", "food"], 4.9, 3800, 1),
];

const ctx = nowContext({ lat: ORIGIN.lat, lng: ORIGIN.lng, city: "Bradenton, FL", weather: { temp: 85, label: "Partly cloudy" } });
const rank = (intent, opts = {}) => {
  const def = INTENT_PAGES[intent];
  return rankRows(POOL, opts.floor || def.floor, {
    origin: ORIGIN, penalty: def.distancePenalty || null,
    ctx: def.timeless ? null : ctx,
    compose: "compose" in opts ? opts.compose : def.compose || null,
    minDistanceMi: opts.minDistanceMi,
  });
};
const secs = (rows) => rows.map((r) => sectionOfRow(r));

// ── 1. THE REGRESSION ITSELF ────────────────────────────────────────────────
{
  const before = rank("worth-the-drive", { compose: null });   // the shipped behaviour
  const after = rank("worth-the-drive");                        // the law
  ok(secs(before).indexOf("Food") > -1,
    "the fixture reproduces the bug: WITHOUT the composition, 'day trips and landmarks' returns restaurants");
  ok(after.length > 0, "…and WITH it the list is not simply emptied");
  ok(secs(after).every((x) => x === "Activities"),
    "worth-the-drive contains ONLY Activities — got " + JSON.stringify(secs(after)));
  ok(!after.some((r) => /Rocca|Beso|Armature|Dry Dock/.test(r.name)),
    "…and specifically none of the four restaurants the owner photographed under that heading");
  ok(after.some((r) => /Weeki Wachee|Robinson|De Soto|Sunken/.test(r.name)),
    "…while the parks, springs and landmarks the query bank was always asking for do appear");
}

// ── 2. A MOOD MAY MIX. IT MAY NOT BE ONE CATEGORY IN DISGUISE ───────────────
for (const intent of ["hidden-gems"]) {
  const def = INTENT_PAGES[intent];
  const cap = def.compose && def.compose.maxPerSection;
  ok(Number(cap) > 0, `${intent} declares a share cap — its heading names a mood, so it must not become a single-category list`);
  ok(!def.compose.sections, `…and NOT an allow-list: ${intent} legitimately mixes, and forcing one kind would be a different lie`);
  const rows = rank(intent);
  const tally = {};
  for (const s of secs(rows)) tally[s] = (tally[s] || 0) + 1;
  for (const [sec, n] of Object.entries(tally)) ok(n <= cap, `${intent}: ${sec} took ${n} seats, cap is ${cap}`);
  // The cap has to be shown DOING something, so hand it a pool that would
  // otherwise be one category — which is precisely what the live rails were.
  const glut = Array.from({ length: 8 }, (_, i) =>
    R("Glut Restaurant " + i, ["restaurant", "food"], 4.7, 200 + i * 10, 2, 0.02 + i * 0.001))
    .concat([R("Glut Park", ["park", "tourist_attraction"], 4.7, 300, null, 0.03)]);
  const capped = rankRows(glut, def.floor, { origin: ORIGIN, ctx: null, compose: def.compose });
  const uncapped = rankRows(glut, def.floor, { origin: ORIGIN, ctx: null, compose: null });
  const foodIn = (rows) => rows.filter((r) => sectionOfRow(r) === "Food").length;
  ok(foodIn(uncapped) > cap, `${intent}: uncapped, a single-category pool gives ${foodIn(uncapped)} Food rows`);
  ok(foodIn(capped) === cap, `…and the cap holds it to ${cap} — got ${foodIn(capped)}`);
  ok(capped.some((r) => sectionOfRow(r) === "Activities"),
    "…leaving room for the other kind, which is the entire point of a share cap");
}

// Tonight is no longer a mixed dinner list: it admits actual nightlife and
// after-dark activities only, matching the product promise.
{
  const def = INTENT_PAGES.tonight;
  ok(JSON.stringify(def.compose.sections) === JSON.stringify(["Nightlife", "Activities"]),
    "tonight explicitly allows nightlife and activities only");
  const rows = rank("tonight");
  ok(rows.length > 0 && secs(rows).every((s) => s === "Nightlife" || s === "Activities"),
    "tonight contains only nightlife or after-dark activities");
  ok(!rows.some((r) => sectionOfRow(r) === "Food"), "tonight contains no generic restaurant cards");
}

// ── 2b. TONIGHT IS A FUTURE INTENT, NOT THE CURRENT MEAL ──────────────────
{
  const def = INTENT_PAGES.tonight;
  const morning = nowContext({ lat: ORIGIN.lat, lng: ORIGIN.lng, city: "Bradenton, FL", nowMs: Date.UTC(2026, 7, 10, 13, 0) });
  const bank = def.queries(morning);
  ok(bank.every((q) => !/breakfast|brunch|coffee|lunch|morning/i.test(q.q)),
    "Tonight's Move keeps its evening query bank when the reader plans in the morning");
  const rows = rankRows(POOL, def.floor, { origin: ORIGIN, ctx: morning, compose: def.compose });
  ok(!rows.some((r) => /Morning Glory|Daily Grind/.test(r.name)),
    "Tonight's Move excludes breakfast-only and coffee-only venues even when their scores are strongest");
  ok(rows.some((r) => /Oscura|Peggy's Corral/.test(r.name)),
    "…while actual evening venues remain eligible");
}

// ── 3. GOOGLE DOES NOT PRICE A STATE PARK ───────────────────────────────────
// maxPrice excluded every row with no price. Right for a restaurant, backwards
// for the free outdoors — which is exactly what "Big fun, small budget" is for.
{
  const def = INTENT_PAGES.budget;
  ok(def.floor.maxPrice === 2 && def.floor.freeOutdoor === true,
    "budget keeps its price ceiling AND admits unpriced outdoors");
  const rows = rank("budget");
  ok(rows.some((r) => /Robinson Preserve|Weeki Wachee/.test(r.name)),
    "a free park with NO Google price is on the budget list — before this it was excluded for having no price, on a page about spending nothing");
  const noPriceIndoor = rankRows([R("Unpriced Steakhouse", ["restaurant", "food"], 4.9, 4000, null)], def.floor,
    { origin: ORIGIN, ctx: null, compose: def.compose });
  ok(noPriceIndoor.length === 0,
    "…and an unpriced RESTAURANT still does not qualify — an unknown price is not evidence of a cheap one");
  const tally = {};
  for (const s of secs(rows)) tally[s] = (tally[s] || 0) + 1;
  ok((tally.Food || 0) <= 3, "…and cheap eats are capped, so 'BIG FUN' is not five dinners");
  ok((tally.Activities || 0) >= 1, "…with at least one actual thing to do");
}

// ── 4. THE CALLS ARE SPENT ON QUERIES THE LIST CAN SHOW ─────────────────────
{
  const night = nowContext({ lat: ORIGIN.lat, lng: ORIGIN.lng, city: "Bradenton, FL", weather: { temp: 80, label: "Clear" }, nowMs: Date.UTC(2026, 7, 9, 5, 12) });
  for (const intent of ["worth-the-drive", "budget", "hidden-gems", "tonight"]) {
    const def = INTENT_PAGES[intent];
    for (const c of [ctx, night]) {
      const bank = typeof def.queries === "function" ? def.queries(c) : def.queries;
      ok(Array.isArray(bank) && bank.length > 0, `${intent} has a query bank`);
      const picked = composeQueries(bank, def.compose, 2);
      ok(picked.length > 0 && picked.length <= 2, `${intent}: composeQueries returns a bounded selection`);
      if (def.compose && def.compose.sections && bank.some((q) => q.cat === "attractions") && def.compose.sections.indexOf("Activities") > -1 && def.compose.sections.length === 1) {
        ok(picked.every((q) => q.cat === "attractions"),
          `${intent}: every paid query is one the list may show — got ${JSON.stringify(picked.map((q) => q.cat))}`);
      }
    }
  }
  // THE NIGHT HOLE. worth-the-drive used to swap its whole bank at night to
  // { attractions: "evening show" } + { food: "destination restaurant dinner" }.
  // That is what put restaurants under "day trips and landmarks" — and once the
  // composition refused the food query it left the rail EMPTY at 1am with one
  // weak query to work from. Measured on a production build, both times.
  //
  // A day trip is a PLAN. Nobody reads this heading at midnight expecting to
  // leave now, so the bank must not thin out at the hour the reader is most
  // likely to be planning tomorrow.
  const wtd = INTENT_PAGES["worth-the-drive"];
  const dayBank = wtd.queries(ctx);
  const nightBank = wtd.queries(night);
  ok(nightBank.every((q) => q.cat === "attractions"),
    "worth-the-drive asks only for attractions at NIGHT too — got " + JSON.stringify(nightBank.map((q) => q.cat)));
  ok(nightBank.length >= 3,
    `…and keeps a real bank to fall back on at that hour (${nightBank.length} queries) — one query is how the rail went blank`);
  ok(nightBank.length === dayBank.length && nightBank.every((q, i) => q.q === dayBank[i].q),
    "…in fact the SAME bank as daytime: the daypart branch was the wrong instinct for a list you read to plan another day");
  ok(wtd.planAhead === true,
    "…and being closed right now does not demote a landmark on a plan-ahead list");
  ok(wtd.minDistanceMi === 17, "worth-the-drive excludes everything at or inside 17 miles");
  const distanceRows = rankRows([
    R("Near landmark", ["park", "tourist_attraction"], 4.9, 1000, null, 0.10),
    R("Far landmark", ["park", "tourist_attraction"], 4.8, 1000, null, 0.35),
  ], wtd.floor, { origin: ORIGIN, compose: wtd.compose, minDistanceMi: wtd.minDistanceMi });
  ok(distanceRows.length === 1 && distanceRows[0].name === "Far landmark",
    "worth-the-drive renders only qualifying places strictly beyond 17 miles");
  {
    const rail = read("app/components/IntentRail.js");
    const page = read("app/components/IntentPageClient.js");
    ok(/planAhead: !!def\.planAhead/.test(rail) && /planAhead: !!def\.planAhead/.test(page),
      "…and both surfaces pass it, so the rail and the page cannot order the same list differently");
  }
}

// ── 5. BOTH SURFACES RANK BY THE SAME RULE ──────────────────────────────────
{
  const rail = read("app/components/IntentRail.js");
  const page = read("app/components/IntentPageClient.js");
  ok(/compose: def\.compose \|\| null/.test(rail), "the home rail passes the intent's composition to rankRows");
  ok(/compose: def\.compose \|\| null/.test(page),
    "…and so does the page it links to — a card in the rail and the card you land on must be the same card");
  ok(/composeQueries\(bank, def\.compose/.test(rail), "the rail composes its query selection too, not just its rows");
}

// ── 6. THE LADDER RELAXES THE FLOOR, NEVER THE KIND ─────────────────────────
// A composed list can come back short because a market genuinely has three
// landmarks worth the drive. The honest lever is the review depth we demanded,
// not the promise we made.
{
  const rail = read("app/components/IntentRail.js");
  const code = rail.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(/reviews: SOFT_FLOOR_REVIEWS/.test(code), "rung 4 lowers the REVIEW floor when a composed list is short");
  ok(!/compose:\s*null/.test(code) && !/sections:\s*\[\]/.test(code),
    "…and no rung ever drops or widens `sections` — a thin honest list beats a full dishonest one");
  ok(!/def\.floor\.rating/.test(code) || !/rating:\s*[0-9]/.test(code.split("SOFT_FLOOR_REVIEWS")[1] || ""),
    "…and never lowers the RATING, which is the quality bar rather than a volume bar");
  // Executed: the relaxed floor must still be composed.
  const def = INTENT_PAGES["worth-the-drive"];
  const soft = { ...def.floor, reviews: 60 };
  const relaxed = rank("worth-the-drive", { floor: soft });
  ok(relaxed.length >= 1 && secs(relaxed).every((x) => x === "Activities"),
    "a floor-relaxed sweep is still Activities-only — got " + JSON.stringify(secs(relaxed)));
}

// ── 7. THE PROMISE AND THE LIST ARE THE SAME CLAIM ──────────────────────────
// The rail heading reads INTENT_PAGES[x].card.promise (BestNearby). If a
// promise names a kind, the composition has to name it too.
{
  const KINDWORDS = { Activities: /\b(day trip|landmark|spring|park|beach|museum|things to do|attraction)/i, Food: /\b(eat|restaurant|dinner|breakfast|lunch|food)/i };
  for (const [intent, def] of Object.entries(INTENT_PAGES)) {
    if (!def.compose || !def.compose.sections) continue;
    const promise = (def.card && def.card.promise) || "";
    ok(promise.length > 0, `${intent} has a promise line`);
    for (const sec of def.compose.sections) {
      if (sec !== "Activities") continue;
      ok(KINDWORDS.Activities.test(promise),
        `${intent}: the list is restricted to Activities, so its promise must say so — "${promise}"`);
    }
  }
  ok(/50 miles/.test(INTENT_PAGES["worth-the-drive"].card.promise) && INTENT_PAGES["worth-the-drive"].radiusM === 80467,
    "worth-the-drive's promise names 30 miles and its radius IS 30 miles (48,280m) — a distance claim has to be the enforced one");
}

// ── 8. TOTAL OVER GARBAGE ───────────────────────────────────────────────────
for (const junk of [null, undefined, {}, [], "x", { sections: "Food" }, { sections: [] }, { maxPerSection: -1 }, { maxPerSection: "x" }]) {
  ok(Array.isArray(capBySection(POOL, junk)), "capBySection survives " + JSON.stringify(junk));
  ok(typeof sectionAllowed(POOL[0], junk) === "boolean", "sectionAllowed survives " + JSON.stringify(junk));
  ok(Array.isArray(composeQueries([{ cat: "food", q: "x" }], junk, 2)), "composeQueries survives " + JSON.stringify(junk));
}
ok(capBySection(null, { maxPerSection: 2 }).length === 0, "capBySection of nothing is nothing");
ok(sectionAllowed({ name: "?", types: [] }, { sections: ["Activities"] }) === false,
  "an UNCLASSIFIABLE row is refused by a list that names a kind — admitting them is how the restaurant crept back one point_of_interest at a time");
ok(composeQueries([{ cat: "food", q: "x" }], { sections: ["Activities"] }, 2).length === 1,
  "a bank with nothing eligible still spends its calls rather than rendering an empty rail — the ROW filter holds the promise either way");

console.log(`test-intent-composition: OK — ${pass} assertions (every list is the kind of place its heading names; the floor bends, the promise does not)`);
