// scripts/test-atlas-reclassify.mjs — locks the two rules that shrink the retry
// set before any money is spent on it.
//
// 1. IN-PARK GEOFENCE. RIDE_RX is a name denylist, and names are the weak
//    signal: it missed 22 real in-park attractions, which then sat in
//    PENDING SOURCE as if they were sourcing failures — The Seas with Nemo &
//    Friends, The American Adventure, Antarctica: Empire of the Penguin.
//    Broadening the regex was TRIED AND REJECTED. Measured against the live 540:
//    ride-ish words matched Nona Adventure Park, TreeUmph! Adventure Course and
//    Tampa Theatre — real standalone destinations. The structural question
//    (is this INSIDE a park) cannot make that mistake.
//
// 2. §7-BLOCKED IS NOT PENDING. A venue whose only official source is a Disney
//    host can never be sourced; §7 forbids the fetch permanently. Labelling it
//    PENDING SOURCE parked it in the retry queue forever, where every attempt is
//    a guaranteed no-op that still costs a Places call.
//    The NAME rule was tried here too and was wrong 4 times out of 4: every
//    "Disney" name among the candidates was a third-party tenant
//    (Planet Hollywood -> planethollywoodintl.com, City Works ->
//    cityworksrestaurant.com, AMC DINE-IN -> amctheatres.com, Virtual Disney VIP
//    Tours -> calendly.com) while 17 genuinely Disney-hosted rows carried no
//    "Disney" token at all (France Pavilion, Turtle Talk With Crush, ...).
//    Host, never name.
import { readFileSync } from "fs";
import { isInsidePark } from "../lib/parkZones.js";
import { isDeniedHost, hostOfUrl } from "../lib/nightlifeRail.js";

let pass = 0;
const fail = (m) => { console.error("test-atlas-reclassify: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// ── in-park, with REAL coordinates from wf_inventory ──────────────────────
const IN_PARK = [
  ["The Seas with Nemo & Friends", 28.3715, -81.5510],
  ["The American Adventure",       28.3703, -81.5497],
  ["France Pavilion",             28.3696, -81.5518],
  ["Alien Swirling Saucers",      28.3556, -81.5605],
  ["Adventureland",               28.4184, -81.5836],
];
for (const [name, lat, lng] of IN_PARK) {
  ok(isInsidePark(lat, lng, name) !== null, `"${name}" is detected as in-park`);
}
// ...and the ones a broader NAME rule would have destroyed. Every one of these
// is a real, standalone, ticketed destination that must keep its card.
const STANDALONE = [
  ["Nona Adventure Park",        28.3667, -81.2436],
  ["TreeUmph! Adventure Course", 27.4670, -82.2790],
  ["Tampa Theatre",              27.9506, -82.4595],
  ["Smugglers Cove Adventure Golf", 28.0300, -82.4000],
  ["Planet Obstacle - Adventure Park", 27.9200, -82.3400],
];
for (const [name, lat, lng] of STANDALONE) {
  ok(isInsidePark(lat, lng, name) === null,
    `"${name}" is a real standalone destination and must NOT be swept up — this is what the lexical rule got wrong`);
}
ok(IN_PARK.length >= 5 && STANDALONE.length >= 5, "both sides of the geofence are exercised");

// The park itself keeps its card — it is the parent, not something inside it.
ok(isInsidePark(28.3747, -81.5494, "EPCOT") === null, "EPCOT itself is not 'inside EPCOT'");
ok(isInsidePark(28.4114, -81.4614, "SeaWorld Orlando") === null, "SeaWorld itself keeps its card");
ok(isInsidePark(28.4749, -81.4664, "Universal Studios Florida") === null, "Universal Studios itself keeps its card");

// Total over junk — a missing coordinate must not throw inside the cron.
ok(isInsidePark(null, null, "x") === null && isInsidePark(undefined, 1, "x") === null,
  "isInsidePark returns null on missing coordinates rather than throwing");
// Far away is far away.
ok(isInsidePark(25.7617, -80.1918, "Bayside Marketplace") === null, "Miami is not inside an Orlando park");

// ── §7: host, never name ──────────────────────────────────────────────────
// The exact rows the name rule got wrong, measured 2026-07-29.
for (const [name, host] of [
  ["Planet Hollywood at Disney Springs", "locations.planethollywoodintl.com"],
  ["City Works (Disney Springs - Orlando)", "cityworksrestaurant.com"],
  ["AMC DINE-IN Disney Springs 24", "amctheatres.com"],
  ["Virtual Disney VIP Tours", "calendly.com"],
]) ok(!isDeniedHost(host), `"${name}" is a THIRD-PARTY tenant (${host}) — a name rule would have wrongly blocked it`);
// ...and the ones with no Disney token in the name that ARE Disney-hosted.
for (const name of ["France Pavilion", "Turtle Talk With Crush", "The American Adventure", "Canada Pavilion"])
  ok(isDeniedHost(hostOfUrl("https://disneyworld.disney.go.com/attractions/epcot/x/")),
    `"${name}" resolves to a Disney host and IS blocked — no Disney token in its name`);

// ── the route applies both ────────────────────────────────────────────────
const route = readFileSync(new URL("../app/api/cron/atlas-build/route.js", import.meta.url), "utf8");
ok(/RIDE_RX\.test\(String\(place\.name \|\| ""\)\) \|\| parkZone/.test(route),
  "the route checks the geofence ALONGSIDE the name regex, not instead of it — the regex still catches rides outside these nine parks");
ok(/blocked \? "BLOCKED — §7 source" : "PENDING SOURCE"/.test(route),
  "a §7-blocked source gets its own label instead of being parked in the retry queue forever");
ok(/isDeniedHost\(hostOfUrl\(d\.websiteUri\)\)/.test(route),
  "the §7 decision is made on the resolved HOST, not on the name");
const zones = readFileSync(new URL("../lib/parkZones.js", import.meta.url), "utf8");
ok((zones.match(/lat: 2[78]\./g) || []).length >= 9, "all nine park zones are declared with coordinates");
ok(/import \{ isInsidePark \}/.test(route), "the route imports the predicate from lib rather than owning it — a reusable rule does not live in a cron route");

console.log(`test-atlas-reclassify: OK — ${pass} assertions (in-park geofence both ways, parks keep their own cards, §7 on host not name, route applies both)`);
