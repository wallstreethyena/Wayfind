// check-family: the family layer must explain the moment, live.
import { familyWhy, familyProfile } from "../lib/family.js";
const fail = (m) => { console.error("check-family: FAIL — " + m); process.exit(1); };
const mk = (name, types, extra) => ({ name, types, ...extra });

let r = familyWhy(mk("Bounce Kingdom Trampoline Park", ["amusement_center"]), { temp: 96, rainy: false, distMi: 4.2, openNow: true });
if (!r || !/beat the heat indoors/.test(r.line)) fail("hot day must sell indoor play as heat escape");
if (!/Big-kid energy/.test(r.line)) fail("trampoline park should read big kids");

r = familyWhy(mk("Parrish Branch Library", ["library"]), { temp: 90, rainy: true, distMi: 2.1, openNow: true });
if (!r || !/rain-proof/.test(r.line)) fail("rainy day must sell the library as rain-proof");
if (!/free/.test(r.line)) fail("library must read free");
if (r.cost !== "Free") fail("library cost estimate must be Free");

r = familyWhy(mk("Sunshine Splash Pad", ["park"]), { temp: 82, rainy: false, distMi: 6.5, openNow: true });
if (!r || !/great weather for it/.test(r.line)) fail("mild day must endorse outdoor play");
if (!/Great for little ones/.test(r.line)) fail("splash pad should read toddlers");

r = familyWhy(mk("Riverside Park", ["park"]), { temp: 97, rainy: false, distMi: 3.0 });
if (!r || !/go early before the heat/.test(r.line)) fail("97F outdoor park needs the go-early honesty note");

r = familyWhy(mk("South Florida Museum", ["museum"], { priceLevel: 2 }), { temp: 75, rainy: false, distMi: 12 });
if (!r) fail("museum must profile");
if (/free/.test(r.line)) fail("paid museum must not claim free");

if (familyWhy(mk("Joe's Crab Shack", ["restaurant"]), { temp: 80 }) !== null) fail("non-family places must return null and fall back to pickReason");
if (familyProfile(mk("Hunsader Farms", ["tourist_attraction"])).cat !== "farm") fail("farm name must profile as farm");

console.log("check-family: OK — 7 moments explained: heat, rain, mild, honesty note, paid vs free, fallback, farms");
