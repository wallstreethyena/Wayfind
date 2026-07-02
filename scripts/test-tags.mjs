import * as Tags from "../lib/tags.js";
import * as D from "../lib/dining.js";
import * as R from "../lib/ranking.js";
import * as Cats from "../lib/categories.js";
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

// v2.3 surface-consistency fixtures (cuisine identity + hero copy)
ok("Bocas-style noisy cafe token is not Café", D.cuisineLabel({ name: "Bocas Grill Orlando", types: ["restaurant", "bar", "cafe", "food"] }) === null);
ok("Real cuisine beats noisy cafe token", D.cuisineLabel({ name: "Bocas Grill Orlando", types: ["seafood_restaurant", "cafe", "restaurant"] }) === "Seafood");
ok("True coffee shop keeps its label", !!D.cuisineLabel({ name: "Seek First Coffee Shop", types: ["cafe", "food"] }));
ok("Named cafe with restaurant token keeps its label", !!D.cuisineLabel({ name: "Moma's Cafe", types: ["cafe", "restaurant", "food"] }));
const _park = { name: "Leu Gardens", types: ["park", "botanical_garden"] };
const _diag = { name: "Diagon Alley", types: ["tourist_attraction", "amusement_park"] };
let _ctx = null;
for (const w of [{ temp: 74, rain: 5 }, { temp: 72, rain: 0, wet: false }, { temp: 78, rain: 10 }]) {
  if (R.heroReason(_park, { weather: w, hour: 13 }) === "Great weather to get outside") { _ctx = { weather: w, hour: 13 }; break; }
}
ok("a real park earns the get-outside hero line", !!_ctx);
if (_ctx) {
  ok("a paid theme park never gets the get-outside line", R.heroReason(_diag, _ctx) !== "Great weather to get outside");
  ok("a paid theme park never gets the beach line", R.heroReason(_diag, _ctx) !== "Prime beach weather right now");
}


// v3.1 discovery-regression fixtures: core categories may never disappear.
const _ids = new Set(Cats.allIds());
ok("discovery config has no duplicate ids", _ids.size === Cats.INTENTS.length + Cats.DISCOVER.length);
const _missing = Cats.REQUIRED.filter((r) => !_ids.has(r));
ok("all core discovery categories present" + (_missing.length ? " (missing: " + _missing.join(", ") + ")" : ""), _missing.length === 0);
ok("every category has a valid action", [...Cats.INTENTS, ...Cats.DISCOVER].every((x) => Cats.validAct(x.act)));

ok("home renders exactly six category tiles", Cats.CATEGORY_TILES.length === 6);
ok("tile ids are the canonical six", ["food","nightlife","attractions","beach","hotels","shopping"].every((id, i) => Cats.CATEGORY_TILES[i] && Cats.CATEGORY_TILES[i].id === id));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
