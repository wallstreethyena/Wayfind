#!/usr/bin/env node
// scripts/test-pairs-well-with.mjs — the detail-sheet discovery loop.
// Owner voice note 2026-08-11: complements around the place, at this hour,
// one place leading to another. These asserts execute the pairing law.
import { readFileSync } from "node:fs";
import { pairsWellWith, pairRole, PAIRINGS, PAIR_RADIUS_MI } from "../lib/pairsWellWith.js";

let pass = 0;
const fail = (m) => { console.error("test-pairs-well-with: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

const at = (id, name, types, lat, lng, wfScore) => ({ id, name, types, lat, lng, wfScore });
const dinner = at("d1", "Harlow Steakhouse", ["restaurant", "steak_house"], 27.33, -82.53, 9.1);
const pool = [
  at("p1", "Gelato Lab", ["ice_cream_shop", "cafe"], 27.331, -82.531, 8.9),
  at("p2", "The Cellar", ["wine_bar", "bar", "restaurant"], 27.332, -82.529, 8.7),
  at("p3", "Rival Steakhouse", ["restaurant", "steak_house"], 27.331, -82.53, 9.6),
  at("p4", "Far Dessert Bar", ["dessert_shop"], 27.6, -82.53, 9.9),
  at("p5", "Morning Roasters", ["coffee_shop", "cafe"], 27.329, -82.531, 9.0),
  at("p6", "City Art Museum", ["museum", "tourist_attraction"], 27.334, -82.528, 9.2),
];

// Roles come from types; a wine bar carrying "restaurant" is still drinks.
ok(pairRole(dinner) === "dinner" && pairRole(pool[1]) === "drinks" && pairRole(pool[0]) === "dessert",
  "types decide the pairing role, in discriminating order");
ok(pairRole({ id: "b", category: "beach", types: [] }) === "beach", "category fallback still resolves a role");

// Night: dinner pairs with dessert and a nightcap — never a second steakhouse.
const night = pairsWellWith(dinner, pool, { bucket: "night" });
ok(JSON.stringify(night.map((x) => x.p.id)) === JSON.stringify(["p1", "p2"]),
  "at night dinner leads to dessert then a nightcap, in role-priority order");
ok(!night.some((x) => x.p.id === "p3"), "a rival of the SAME kind is never a pairing, however strong (that is Worth Comparing's job)");
ok(!night.some((x) => x.p.id === "p4"), "a dessert 18 miles away is not the next stop on this outing");
ok(night.every((x) => typeof x.reason === "string" && x.reason.length > 0 && Number.isFinite(x.pairDistMi)),
  "every pairing states its reason and its real distance from the place");

// Morning: the same restaurant pairs forward into coffee and culture instead.
const morning = pairsWellWith(dinner, pool, { bucket: "morning" });
ok(morning.length && morning[0].p.id === "p5" && morning.some((x) => x.p.id === "p6"),
  "the same place pairs differently by daypart — coffee and culture in the morning, not a nightcap");
ok(!morning.some((x) => x.p.id === "p2"), "a bar is not a morning pairing");

// Beach afternoon: food and drinks around the sand.
const beach = at("b1", "Siesta Beach", ["beach", "tourist_attraction"], 27.267, -82.549, 9.7);
const beachPool = [at("f1", "Sand Bar Grill", ["restaurant", "bar_and_grill"], 27.268, -82.548, 8.8)];
ok(pairsWellWith(beach, beachPool, { bucket: "afternoon" }).length === 1,
  "a beach afternoon pairs into the food right off the sand");

// Determinism + role caps + self/dup exclusion.
const dup = pairsWellWith(dinner, [...pool, dinner, ...pool], { bucket: "night" });
ok(!dup.some((x) => x.p.id === dinner.id) && new Set(dup.map((x) => x.p.id)).size === dup.length,
  "the place never pairs with itself and duplicates collapse");
const manyDesserts = [1, 2, 3, 4].map((i) => at("md" + i, "Sweet " + i, ["dessert_shop"], 27.331 + i / 1000, -82.53, 8));
const capped = pairsWellWith(dinner, manyDesserts.concat(pool), { bucket: "night" });
ok(capped.filter((x) => pairRole(x.p) === "dessert").length <= 2,
  "one role can never crowd out the plan — at most two per role");

// Structural law: merit only. The module must not read commission surfaces.
const src = read("lib/pairsWellWith.js");
ok(!/commission|affiliate|offer|partner|deals/i.test(src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "")),
  "pairing code never touches commission, offers or partners — order is merit only");
ok(/bucketForHour|siteHourFloat/.test(src) && !/new Date\(\)\.getHours/.test(src), "the daypart comes from the one clock");
for (const role of Object.keys(PAIRINGS)) {
  for (const b of ["morning", "afternoon", "night"]) {
    ok(Array.isArray(PAIRINGS[role][b]) && !PAIRINGS[role][b].includes(role), `${role}/${b} never pairs with itself`);
  }
}
ok(PAIR_RADIUS_MI <= 5, "the pairing radius keeps the loop on the same outing");

// UI wiring: the sheet renders the loop and a tap opens the NEXT detail.
const ui = read("app/components/sheets/Detail.js");
ok(ui.includes('pairsWellWith(detail, nextPool, { max: 3, radiusMi: 8 })') && ui.includes("data-where-to-go-next"),
  "the detail sheet runs the pairing law over the already-loaded pool for Where to go next");
ok(/data-where-to-go-next[\s\S]{0,700}Where to go next/.test(ui),
  "the place-specific discovery loop is visibly named Where to go next");
ok(/WhereToGoNextRow[\s\S]{0,300}openDetail=\{openDetail\}/.test(ui),
  "tapping a next stop opens ITS detail sheet — one place leads to another");

console.log(`test-pairs-well-with: OK — ${pass} assertions (roles from types, daypart pairings, radius, merit-only, loop wiring)`);
