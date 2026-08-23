#!/usr/bin/env node
// check-florida-icons — the "Florida Icons" marquee shelf. Same doctrine as
// check-major-music-festivals (a tag with no consumer is invisible and silent,
// so the wire gets a guard the day it is laid), plus the two things that make
// THIS rail different and therefore break differently:
//
//   1. It RAISES composeRail's two-famous cap. Nearly every icon is a household
//      name (Ultra, the Daytona 500, Art Basel, four Disney festivals), so the
//      default cap would ration a twelve-strong shelf down to two. The rail
//      declares `maxFamous`, buildRail must honour it, and if that wire is ever
//      cut the shelf silently shrinks — no error, just a worse page. Asserted
//      against the real modules, with composeRail's default as the red-proof.
//   2. It spans EVERY category. major-music-festivals lives inside music;
//      "florida-icons" must accept a NASCAR race, an art fair and a food
//      festival side by side, so a category predicate creeping in would empty
//      most of it. A cross-category fixture set proves the qualifier is the tag.
//
// EXECUTES the chain (tagged rows in, shelf out) rather than matching text.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RAIL_LIBRARY, buildRail, isEligible, composeRail, rankEvents } from "../lib/curatedEvents.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const KEY = "florida-icons";
const TAG = "florida-icon";

// Fixtures shaped like wf_events, dated FAR out so the guard cannot rot when a
// real event passes. `pop` drives composeRail's FAMOUS test (>= 8.5).
const row = (over = {}) => ({
  event_id: "fixture-1", event_series_id: "fixture", event_name: "Icon Fixture",
  year: 2099, slug: "icon-fixture-2099",
  start_date: "2099-03-01", end_date: "2099-03-02",
  city: "Miami", state: "FL", lat: 25.7617, lng: -80.1918,
  category: "festival", subcategory: "icon",
  tags: [TAG], audience: ["adults"],
  event_status: "scheduled", source_tier: 1, verification_confidence: "high",
  popularity_score: 9, editorial_score: 8.5, uniqueness_score: 8,
  card_hook: "A statewide icon people plan a year around.",
  ...over,
});
const now = new Date("2099-01-01T12:00:00Z");

// 1. THE WIRE. Defined in the library AND requested by the hub page.
ok(!!RAIL_LIBRARY[KEY], `RAIL_LIBRARY defines "${KEY}"`);
const hub = readFileSync(path.join(ROOT, "app/florida-events/page.js"), "utf8");
ok(new RegExp(`RAILS\\s*=\\s*\\[[^\\]]*"${KEY}"`).test(hub),
  `app/florida-events/page.js must ASK for "${KEY}" in its RAILS array — a rail nothing requests is invisible and silent`);

// 2. THE QUALIFIER IS THE TAG, and it spans categories. Three DIFFERENT
//    categories, distinct series, all tagged: they all reach the shelf.
const cross = [
  row({ event_id: "a", slug: "a", event_series_id: "s-a", category: "motorsports" }),
  row({ event_id: "b", slug: "b", event_series_id: "s-b", category: "arts" }),
  row({ event_id: "c", slug: "c", event_series_id: "s-c", category: "food" }),
];
const built = buildRail(KEY, cross, { now });
ok(built && built.cards.length === 3,
  `a tagged, eligible, cross-category set of three builds the shelf (got ${built ? built.cards.length : "null"})`);
const untagged = cross.map((e) => ({ ...e, tags: ["festival"] }));
ok(buildRail(KEY, untagged, { now }) === null,
  "an untagged event never reaches the icons shelf — a category is not the qualifier, the explicit tag is");

// 3. THE RAISED FAMOUS CAP is honoured — and it is load-bearing. Six famous
//    (pop 9) tagged icons all show, because the rail declares maxFamous. The
//    red-proof: composeRail's DEFAULT cap keeps only two of the same six, so if
//    buildRail ever stops passing the rail's maxFamous the shelf silently
//    shrinks. This is the one behaviour that separates this rail from every
//    other, so it is proven both directions.
const sixFamous = Array.from({ length: 6 }, (_, i) =>
  row({ event_id: "f" + i, slug: "f" + i, event_series_id: "s-f" + i, popularity_score: 9, uniqueness_score: 7 }));
const iconRail = buildRail(KEY, sixFamous, { now });
ok(iconRail && iconRail.cards.length === 6,
  `the icons shelf shows all six famous icons, not a rationed two (got ${iconRail ? iconRail.cards.length : "null"}) — maxFamous must be wired through buildRail`);
ok(RAIL_LIBRARY[KEY].maxFamous && RAIL_LIBRARY[KEY].maxFamous > 2,
  "the rail must declare a raised maxFamous (> 2)");
const defaultCapped = composeRail(rankEvents(sixFamous, { now }), { size: 8 });
const famousInDefault = defaultCapped.filter((e) => Number(e.popularity_score) >= 8.5).length;
ok(famousInDefault === 2,
  `red-proof: composeRail's DEFAULT cap keeps only two famous of the six (got ${famousInDefault}) — proving the rail's raised cap is what does the work`);

// 4. THE THREE-CARD FLOOR still applies.
ok(buildRail(KEY, cross.slice(0, 2), { now }) === null,
  "two tagged icons do not ship a shelf (buildRail's floor)");

// 5. AN UNANNOUNCED ICON NEVER SURFACES. The two undated Disney festivals carry
//    the tag on purpose (they join the shelf the day their status flips) but
//    must stay invisible until then — a date nobody published must not print.
const unannounced = cross.map((e) => ({ ...e, event_status: "unannounced" }));
ok(unannounced.every((e) => !isEligible(e, { now })),
  "an unannounced icon is never eligible — its date is derived and must not reach a card");
ok(buildRail(KEY, unannounced, { now }) === null, "a shelf of only unannounced icons is no shelf");
const mixed = [...cross, ...unannounced.map((e, i) => ({ ...e, event_id: "u" + i, slug: "u" + i, event_series_id: "s-u" + i }))];
const mixedRail = buildRail(KEY, mixed, { now });
ok(mixedRail && mixedRail.cards.every((c) => !String(c.event_id || "").startsWith("u")),
  "mixing announced and unannounced icons yields a shelf of ONLY the announced ones");

// 6. STATEWIDE — no proximity gate. A Key West icon still reaches a Tampa-area
//    reader; this shelf is about what is iconic, not what is nearby.
const farAway = cross.map((e) => ({ ...e, lat: 24.5551, lng: -81.7800, city: "Key West" }));
const farRail = buildRail(KEY, farAway, { now, lat: 27.9506, lng: -82.4572 });
ok(farRail && farRail.cards.length === 3,
  "a home-market reader still sees a Key West icon — the shelf is statewide and must not inherit a proximity gate");

// 7. The copy names what it is.
ok(/icon/i.test(RAIL_LIBRARY[KEY].title), 'the shelf title says "icon"');

if (fail.length) {
  for (const m of fail) console.log("  FAIL:", m);
  console.log(`check-florida-icons: FAIL — ${fail.length} of ${pass + fail.length} assertions`);
  process.exit(1);
}
console.log(`check-florida-icons: OK — ${pass} assertions (tag reaches the hub, tag not category, cross-category, raised famous cap is load-bearing, three-card floor, unannounced invisible, statewide)`);
