import * as Tags from "../lib/tags.js";
import * as D from "../lib/dining.js";
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log("PASS  " + name); } else { fail++; console.log("FAIL  " + name); } };
const diagon = ["tourist_attraction", "amusement_park", "point_of_interest"];
const bocas = ["restaurant", "bar", "food", "point_of_interest"];
const moma = ["cafe", "restaurant", "food"];
const bakery = ["bakery", "food", "store"];
const eola = ["park", "tourist_attraction"];
const trex = ["restaurant", "tourist_attraction", "food"];
const seaworld = ["amusement_park", "aquarium", "tourist_attraction"];
const springs = ["shopping_mall", "tourist_attraction"];
// 1 Diagon: no Nature & trails, no Outdoor; family/entertainment survive
let g = Tags.filterAllowed(Tags.resolveIdentity(diagon), ["nature", "outdoor", "family", "entertainment", "instagram"]);
ok("Diagon blocks nature", g.blocked.some(b => b.key === "nature"));
ok("Diagon blocks outdoor", g.blocked.some(b => b.key === "outdoor"));
ok("Diagon shows family+entertainment", g.shown.includes("family") && g.shown.includes("entertainment"));
// 2 Bocas: dining identity; nature/museum impossible even with fake evidence
g = Tags.filterAllowed(Tags.resolveIdentity(bocas), ["seafood", "nature", "museum"]);
ok("Bocas is dining", Tags.resolveIdentity(bocas) === "dining");
ok("Bocas shows seafood, blocks nature+museum", g.shown.includes("seafood") && g.blocked.length === 2);
// 3 true coffee shop shows Coffee
g = Tags.filterAllowed(Tags.resolveIdentity(moma), ["coffee", "gem"]);
ok("Cafe shows Coffee", g.shown.includes("coffee"));
// 4 real bakery shows Bakery & sweets
ok("Bakery is dining", Tags.resolveIdentity(bakery) === "dining");
g = Tags.filterAllowed("dining", ["dessert"]);
ok("Bakery shows dessert", g.shown.includes("dessert"));
// 5 park/trail shows Nature & trails and Outdoor
g = Tags.filterAllowed(Tags.resolveIdentity(eola), ["nature", "outdoor", "family"]);
ok("Park identity", Tags.resolveIdentity(eola) === "park");
ok("Park shows nature+outdoor", g.shown.includes("nature") && g.shown.includes("outdoor"));
// 6 theme park gets attraction-style tags, not restaurant or nature tags
g = Tags.filterAllowed("themePark", ["steak", "coffee", "nature", "family", "entertainment"]);
ok("Theme park blocks steak/coffee/nature", g.blocked.length === 3 && g.shown.length === 2);
// 7 Disney Springs restaurant: no park admission
ok("T-Rex no admission cue", Tags.requiresParkAdmission(trex) === false);
ok("T-Rex is dining + What to order", Tags.resolveIdentity(trex) === "dining" && Tags.sectionLabel("dining") === "What to order");
// 8 Universal in-park attraction: admission cue on
ok("Diagon admission cue", Tags.requiresParkAdmission(diagon) === true);
ok("SeaWorld admission cue", Tags.requiresParkAdmission(seaworld) === true);
ok("Disney Springs itself no cue", Tags.requiresParkAdmission(springs) === false);
// 9 event uses event language
ok("Event label", Tags.sectionLabel(Tags.resolveIdentity([], true)) === "Know before you go");
ok("Attraction label", Tags.sectionLabel(Tags.resolveIdentity(diagon)) === "Don't miss");
ok("Park label", Tags.sectionLabel("park") === "What to see");
// 10 missing price still honest
ok("Missing price says not listed", D.costForTwo({ types: ["restaurant"] }).text === "Price not listed");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
