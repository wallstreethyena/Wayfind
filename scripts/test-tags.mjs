import * as Tags from "../lib/tags.js";
import * as D from "../lib/dining.js";
import * as R from "../lib/ranking.js";
import * as Hol from "../lib/holidays.js";
import * as Cats from "../lib/categories.js";
import * as WC from "../lib/wc.js";
import * as Gems from "../lib/gems.js";
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

let _hot = null;
for (const w of [{ temp: 99, rain: 5 }, { temp: 101 }]) {
  if (R.heroReason({ name: "Orange County Museum", types: ["museum"] }, { weather: w, hour: 13 }) === "A cool escape from the heat right now") { _hot = w; break; }
}
ok("hot day surfaces the indoor-escape hero line", !!_hot);
if (_hot) ok("hot day never tells you to get outside", R.heroReason({ name: "Leu Gardens", types: ["park", "botanical_garden"] }, { weather: _hot, hour: 13 }) !== "Great weather to get outside");

const _h26 = Object.fromEntries(Hol.holidaysFor(2026).map((h) => [h.key, h.date]));
ok("july4 2026 lands on July 4", _h26.july4.getMonth() === 6 && _h26.july4.getDate() === 4);
ok("memorial day 2026 is May 25", _h26.memorial.getMonth() === 4 && _h26.memorial.getDate() === 25);
ok("thanksgiving 2026 is Nov 26", _h26.thanksgiving.getMonth() === 10 && _h26.thanksgiving.getDate() === 26);
ok("mlk 2026 is Jan 19", _h26.mlk.getMonth() === 0 && _h26.mlk.getDate() === 19);
ok("july4 window active once juneteenth passes", Hol.activeHoliday(new Date(2026, 5, 20, 12)) && Hol.activeHoliday(new Date(2026, 5, 20, 12)).key === "july4");
ok("overlapping windows: nearest holiday wins", Hol.activeHoliday(new Date(2026, 5, 14, 12)) && Hol.activeHoliday(new Date(2026, 5, 14, 12)).key === "juneteenth");
ok("window closes after the holiday", Hol.activeHoliday(new Date(2026, 6, 5, 9)) === null || Hol.activeHoliday(new Date(2026, 6, 5, 9)).key !== "july4");
ok("june 12 is outside the window", !(Hol.activeHoliday(new Date(2026, 5, 12, 12)) && Hol.activeHoliday(new Date(2026, 5, 12, 12)).key === "july4"));

ok("member signal silent below 3 authors", R.memberDelta({ authors: 2, warnAuthors: 0 }) === 0 && R.memberDelta(null) === 0);
ok("member signal positive and capped", R.memberDelta({ authors: 3, warnAuthors: 0 }) === 0.45 && R.memberDelta({ authors: 10, warnAuthors: 0 }) === 0.75);
ok("warnings pull down within caps", R.memberDelta({ authors: 4, warnAuthors: 2 }) === 0.1 && R.memberDelta({ authors: 3, warnAuthors: 3 }) === -0.3);


// --- World Cup copy + badge rules ---
const wcList = [
  { id: "sb1", name: "Draft House Grill", types: ["bar", "restaurant"] },
  { id: "sb2", name: "Winghouse Sports Bar", types: ["bar"] },
  { id: "sb3", name: "Stadium Taproom", types: ["bar"] },
  { id: "sb4", name: "Alehouse Game Day", types: ["bar"] },
  { id: "sb5", name: "Draft Kings Sports Bar", types: ["bar"] },
  { id: "br1", name: "Sabor do Brasil", types: ["restaurant"] },
  { id: "st1", name: "Prime Steakhouse", types: ["restaurant"], price: "$$$$" },
  { id: "re1", name: "Garden Bistro", types: ["restaurant"], rating: 4.7, reviews: 900 },
];
const wcCopies = wcList.map((pl, i) => WC.wcCopy(pl, wcList, i));
ok("WC: no two cards share copy", new Set(wcCopies).size === wcCopies.length);
ok("WC: brazil venue gets brazil framing", /brazil|sele\u00e7\u00e3o|green and yellow/i.test(WC.wcCopy(wcList[5], wcList, 5)));
const allVariants = Object.values(WC.BANKS).flat().join(" | ");
ok("WC: generator never claims watch party", !/watch party/i.test(allVariants));
ok("WC: banned generic phrases absent", !/reliable, well-rated meal|night out|evening drinks|close by/i.test(allVariants));
ok("WC: curated Sports & Social evidence copy", /104/.test(WC.wcCopy({ name: "Sports & Social" }, [], 0)));
ok("WC: upscale steakhouse badge", (WC.wcBadge({ name: "Prime Steakhouse", types: ["restaurant"], price: "$$$$" }, []) || {}).label === "Upscale watch dinner");
ok("WC: family label badge", (WC.wcBadge({ name: "Garden Bistro", types: ["restaurant"], labels: ["Good for kids"] }, []) || {}).label === "Family-friendly");
ok("WC: closest strong option is comparative", (WC.wcBadge({ id: "a", name: "Corner Grill", types: ["restaurant"], rating: 4.6, reviews: 200, distMi: 0.8 }, [{ id: "a", rating: 4.6, reviews: 200, distMi: 0.8 }, { id: "b", rating: 4.7, reviews: 500, distMi: 2.4 }]) || {}).label === "Closest strong option");

ok("WC calendar: July 5 is a match day (card on top)", Hol.worldCupMatchToday(new Date(2026, 6, 5, 12)));
ok("WC calendar: July 8 is an off day (card mid-page)", !Hol.worldCupMatchToday(new Date(2026, 6, 8, 12)));
ok("WC calendar: July 19 final is a match day", Hol.worldCupMatchToday(new Date(2026, 6, 19, 12)));

// v6.15 TRUTHFUL CLAIM: "Where to watch" eligibility — a no-signal restaurant
// (a Brazilian churrascaria with no TVs, the exact live offender) can NEVER
// enter the list; real bars/sports bars/screens and curated venues do.
ok("WC watch: no-TV brazilian grill is INELIGIBLE", !Hol.worldCupEligible({ name: "Brasa Brazilian Grill", types: ["brazilian_restaurant", "restaurant", "food"] }));
ok("WC watch: plain restaurant is INELIGIBLE", !Hol.worldCupEligible({ name: "Garden Bistro", types: ["restaurant", "food"] }));
ok("WC watch: steakhouse (no bar) is INELIGIBLE", !Hol.worldCupEligible({ name: "Prime Steakhouse", types: ["restaurant"] }));
ok("WC watch: cafe is INELIGIBLE", !Hol.worldCupEligible({ name: "Orange Blossom Coffee", types: ["coffee_shop", "cafe"] }));
ok("WC watch: sports bar IS eligible", Hol.worldCupEligible({ name: "Winghouse Sports Bar", types: ["bar"] }));
ok("WC watch: pub IS eligible", Hol.worldCupEligible({ name: "The Local Pub", types: ["bar", "pub"] }));
ok("WC watch: brewery IS eligible", Hol.worldCupEligible({ name: "Motorworks Brewing", types: ["bar", "brewery"] }));
ok("WC watch: brazilian spot WITH a bar IS eligible", Hol.worldCupEligible({ name: "Eskina Brazilian Bar", types: ["restaurant", "bar"] }));
ok("WC watch: curated venue IS eligible by evidence", Hol.worldCupEligible({ name: "American Social", types: ["restaurant"] }));
ok("WC fit: cuisine alone scores 0 (no bar/screen boost)", Hol.fitFor("worldcup", { name: "Sabor do Brasil", types: ["restaurant"] }) <= 0);
ok("WC fit: sports bar outranks a food-first spot", Hol.fitFor("worldcup", { name: "Winghouse Sports Bar", types: ["bar"] }) > Hol.fitFor("worldcup", { name: "Garden Bistro", types: ["restaurant"] }));
ok("WC content: worldcup exclude drops ineligible venues", Hol.contentFor("worldcup", "World Cup").exclude({ name: "Brasa Brazilian Grill", types: ["brazilian_restaurant"] }) === true);
ok("WC content: worldcup exclude keeps a real sports bar", Hol.contentFor("worldcup", "World Cup").exclude({ name: "Winghouse Sports Bar", types: ["bar"] }) === false);

ok("gems: Twenty Pho Hour carries verified Michelin award", (Gems.gemFor("Twenty Pho Hour") || {}).award && Gems.gemFor("Twenty Pho Hour").award.label === "MICHELIN Guide");
ok("gems: prefix match resolves Google-style names", (Gems.gemFor("Domu Orlando") || {}).key === "domu");
ok("gems: every note is unique", new Set(Gems.GEMS.map((g) => g.note)).size === Gems.GEMS.length);
ok("gems: notes stay card-sized", Gems.GEMS.every((g) => g.note.length > 40 && g.note.length <= 220));
ok("gems: unknown venue returns null", Gems.gemFor("Random Diner 123") === null);
ok("gems: S&S note carries the smoke cannons", /smoke cannons/.test(WC.wcCopy({ name: "Sports & Social" }, [], 0)));

ok("gems: Se7en Bites carries the verified Michelin chip", (Gems.gemFor("Se7en Bites") || {}).award && Gems.gemFor("Se7en Bites").award.label === "MICHELIN Guide");
ok("gems: The Hen & Hog resolves with and without the The", (Gems.gemFor("The Hen & Hog") || {}).key === "henandhog" && (Gems.gemFor("Hen & Hog Winter Park") || {}).key === "henandhog");
ok("gems: Deli Desires resolves", (Gems.gemFor("Deli Desires") || {}).key === "delidesires");

ok("gems: Helena never boosts food rankings", (Gems.gemFor("Helena Modern Riviera") || {}).boost === 0);
ok("gems: boosts are nudges, never overrides", Gems.GEMS.every((g) => g.boost == null || g.boost <= 2));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
