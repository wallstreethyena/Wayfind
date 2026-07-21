// scripts/test-shopping.mjs — lock test for Shopping (lib/shopping.js).
import { isShopping, shopHeadline, pickShoppingHero, SHOP_HEADLINES, RAW_CATEGORY_NAMES } from "../lib/shopping.js";
let n = 0, fail = 0;
const ok = (c, m) => { n++; if (!c) { fail++; console.error("FAIL:", m); } };

ok(SHOP_HEADLINES.every((h) => !RAW_CATEGORY_NAMES.includes(h)), "headlines never a raw category name");
ok(isShopping({ types: ["shopping_mall"] }) === true, "mall detected");
ok(isShopping({ name: "St. Armands Circle Boutiques", types: ["point_of_interest"] }) === true, "boutique by name");
ok(isShopping({ types: ["restaurant"], name: "Grill" }) === false, "restaurant is not shopping");

const center = { lat: 27.34, lng: -82.53 };
const p = (id, o) => ({ place_id: id, name: id, types: ["shopping_mall"], lat: 27.34, lng: -82.53, ...o });
const places = [
  p("s1", { rating: 4.3, reviewCount: 1200 }),
  p("s2", { rating: 4.7, reviewCount: 2000 }),  // best
  p("s3", { rating: 4.1, reviewCount: 300 }),
  { place_id: "r", name: "Diner", types: ["restaurant"], rating: 4.9, reviewCount: 999, lat: 27.34, lng: -82.53 },
];
const hero = pickShoppingHero(places, { center });
ok(hero.show === true && hero.place.place_id === "s2", "picks the highest-signal shopping hero");
ok(hero.place.place_id !== "r", "restaurant never chosen as shopping hero");
ok(hero.cta === "Start Browsing →", "cta present");

// hidden when nothing shopping nearby
const none = pickShoppingHero([{ place_id: "r", types: ["restaurant"], rating: 4.9, lat: 27.34, lng: -82.53 }], { center });
ok(none.show === false, "hidden when no shopping nearby");

// headline deterministic + a real story line
ok(SHOP_HEADLINES.includes(shopHeadline({ place_id: "s2" })), "headline from the story set");
ok(shopHeadline({ place_id: "s2" }) === shopHeadline({ place_id: "s2" }), "headline deterministic");

console.log(`test-shopping: ${n - fail}/${n} passed`);
if (fail) process.exit(1);
