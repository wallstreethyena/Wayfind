// scripts/test-morning-picks.mjs — lock test for Morning Picks (lib/morningPicks.js).
// Pure + deterministic. Pins the pre-11am LOCAL gate + honest café pick. Wire into prebuild.
import { isMorning, isCafe, storyHeadline, getMorningPick, MORNING_HEADLINES } from "../lib/morningPicks.js";
let n = 0, fail = 0;
const ok = (c, m) => { n++; if (!c) { fail++; console.error("FAIL:", m); } };
const ET = "America/New_York";
const at = (utc) => new Date(utc);

// July = EDT (UTC-4): 13:00Z = 9:00 ET (morning); 15:30Z = 11:30 ET (not)
ok(isMorning(at("2026-07-21T13:00:00Z"), ET) === true, "9:00 ET is morning");
ok(isMorning(at("2026-07-21T14:59:00Z"), ET) === true, "10:59 ET is morning");
ok(isMorning(at("2026-07-21T15:30:00Z"), ET) === false, "11:30 ET is not morning");
// location-local: pass a west-coast tz — 15:30Z = 8:30 PT (morning)
ok(isMorning(at("2026-07-21T15:30:00Z"), "America/Los_Angeles") === true, "8:30 PT is morning (location-local)");

ok(isCafe({ types: ["coffee_shop"] }) === true, "coffee_shop is café");
ok(isCafe({ name: "Buddy Brew Coffee", types: ["food"] }) === true, "name → café");
ok(isCafe({ types: ["restaurant"], name: "Steakhouse" }) === false, "non-café rejected");

// after 11 → hidden
ok(getMorningPick([{ types: ["cafe"], rating: 4.8 }], { now: at("2026-07-21T16:00:00Z"), tz: ET }).show === false, "after 11 hides");

// before 11 → picks the highest-signal café, excludes non-cafés
const places = [
  { place_id: "a", name: "Chain Coffee", types: ["cafe"], rating: 3.9, lat: 27.34, lng: -82.53 },
  { place_id: "b", name: "Local Roastery", types: ["cafe"], rating: 4.8, lat: 27.34, lng: -82.53 },
  { place_id: "r", name: "Dinner Place", types: ["restaurant"], rating: 4.9, lat: 27.34, lng: -82.53 },
];
const pick = getMorningPick(places, { now: at("2026-07-21T13:00:00Z"), tz: ET, center: { lat: 27.34, lng: -82.53 } });
ok(pick.show === true && pick.place.place_id === "b", "picks higher-rated café, excludes restaurant");
ok(pick.cta === "Explore Morning Picks →", "cta present");

// headline is a real story line, never "Best Coffee"
const h = storyHeadline({ place_id: "b" });
ok(MORNING_HEADLINES.includes(h) && !/best coffee|top cafe/i.test(h), "story headline, not 'Best Coffee'");
ok(storyHeadline({ place_id: "b" }) === storyHeadline({ place_id: "b" }), "headline deterministic");

console.log(`test-morning-picks: ${n - fail}/${n} passed`);
if (fail) process.exit(1);
