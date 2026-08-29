// Guardrail: the junk-filter contract (v4.94). The filter is ONE module —
// lib/placeFilter.js — and this check EXECUTES the real exported function
// (not a copy) against fixtures, then verifies every result path is wired
// through it. The build fails loudly if junk passes, legit places are
// killed, or any path bypasses the shared filter. This is what stops a
// future push from quietly reintroducing nail salons under "Museums".
import { mkdtempSync, copyFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const fail = (m) => { console.error("check-gate: FAIL — " + m); process.exit(1); };

// Execute the real module (dependency-free by contract; copied to .mjs the
// same way check-libs.mjs runs the culture/guide libs).
const tmp = mkdtempSync(join(tmpdir(), "wf-gate-"));
copyFileSync(new URL("../lib/placeCategory.js", import.meta.url), join(tmp, "placeCategory.js"));
// v8.18 — placeFilter now imports NATIONAL_QUICK_RX from lib/breakfast.js
// (ONE national-chain veto for the browse Breakfast tab AND the rail).
// breakfast.js is itself import-free, so the standalone property holds.
copyFileSync(new URL("../lib/breakfast.js", import.meta.url), join(tmp, "breakfast.js"));
copyFileSync(new URL("../lib/placeFilter.js", import.meta.url), join(tmp, "placeFilter.mjs"));
const { placeAllowed } = await import(join(tmp, "placeFilter.mjs"));
if (typeof placeAllowed !== "function") fail("placeAllowed not exported from lib/placeFilter.js");

// Wiring: every result path routes through the shared module.
const sources = readFileSync(new URL("../lib/sources.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
if (!sources.includes('from "./placeFilter"')) fail("lib/sources.js no longer imports lib/placeFilter — aggregator bypasses the shared filter");
if (!/junkGate\(categoryId, p, subId\)/.test(sources)) fail("aggregator does not pass subId to the gate — sub-filter contracts (Museums, Tours) unenforced");
if (!page.includes('from "../lib/placeFilter"')) fail("app/home.js no longer imports the shared filter");
if (!/import \{ searchPlaces \} from "\.\.\/lib\/sources"/.test(page)) fail("page.js no longer imports searchPlaces from lib/sources — views bypass the shared filter");
if (/import \{[^}]*\bsearchPlaces\b[^}]*\} from "\.\.\/lib\/google"/.test(page)) fail("page.js imports searchPlaces directly from lib/google — filter bypassed");
if ((page.match(/searchNearbyPlaces\(([^)]*)\)\.then\(\(l\) => \(l \|\| \[\]\)\.filter\(\(p\) => placeAllowed\(null, null, p\)\)\)/g) || []).length < 2) fail("composite/Top-10 pools no longer route searchNearbyPlaces through placeAllowed");

// Behavior fixtures — junk that must NEVER pass. [categoryId, subId, name, types]
const MUST_BLOCK = [
  // v8.17 (owner, live screenshot 2026-08-19: "Adobe Kava is not a cafe, it's
  // a bar"). Kava/kratom lounges are Google-typed tea_house/coffee_shop/cafe —
  // these are the EXACT live types measured on the Adobe Kava inventory row —
  // so only the name carries the truth. Out of Cafés and Breakfast; Food·All
  // keeps them (asserted in MUST_PASS below).
  ["food", "cafes", "Adobe Kava", ["tea_house", "coffee_shop", "cafe", "food_store", "store", "food"]],
  ["food", "breakfast", "Mad Hatter Kava", ["coffee_shop", "cafe", "food_store", "store"]],
  ["food", "cafes", "Cloud 9 Hookah Lounge", ["cafe", "lounge"]],
  // v8.50 — Lunch is a midday meal. A breakfast-only cafe and a coffee shop
  // are not the answer, even when they score well enough to lead unfiltered food.
  ["food", "lunch", "Keke's Breakfast Cafe", ["breakfast_restaurant", "cafe"]],
  ["food", "lunch", "Ryan's Coffee House", ["coffee_shop"]],
  ["food", "lunch", "Pomegranate Frozen Yogurt", ["dessert_shop"]],
  ["attractions", "museums", "La Nails & Spa", ["nail_salon"]],
  ["attractions", "museums", "La Nails & Spa", []],           // even with no types, the name is enough
  ["attractions", "tours", "La Nails & Spa", []],
  ["attractions", "all", "Bob's Cooling and Heating", ["point_of_interest"]],
  ["attractions", "all", "Two Men and a Truck Moving & Storage", []],
  ["attractions", "all", "Suncoast Roofing & Solar", []],
  ["beach", "all", "America's Best Contacts & Eyeglasses", ["store"]],
  ["beach", "beaches", "Parrish Family Dental", []],
  ["food", "all", "Statewide Insurance Agency", ["insurance_agency"]],
  ["nightlife", "all", "AAA Self Storage", ["storage"]],
  ["attractions", "all", "Manatee Urgent Care Clinic", ["doctor"]],
  ["attractions", "all", "Precision Auto Repair", ["car_repair"]],
  ["attractions", "museums", "Ellenton Premium Outlets", ["shopping_mall"]], // right category, wrong sub
  [null, null, "Sunshine Hair Studio & Barber", []],           // blocklist applies even with no category
  // v4.95 — the exact live offender from the user's screenshot: "Eye Glasses"
  // as TWO words slipped the one-word "eyeglass" pattern and ranked #1 in Food.
  ["food", "all", "America's Best Contacts & Eye Glasses", ["store", "health"]],
  ["food", "all", "America's Best Contacts & Eye Glasses", []],
  ["food", "all", "Parrish Tire & Auto Repair", []],
  ["nightlife", "all", "SecureSpace Self Storage", []],
  ["hotels", "all", "Coastal Vision Center", []],
  ["shopping", "all", "Elite Movers of Bradenton", []],
  // v4.96 — the "names lie" class from the live audit: "best …" queries
  // keyword-match businesses NAMED Best, and "best breakfast" matches
  // Bed & Breakfast LODGINGS. Types veto; names can't qualify.
  ["food", "all", "Best Metal Recycling", []],
  ["food", "all", "Best Aunt Ever Office", ["point_of_interest"]],
  ["attractions", "all", "Best Aunt Ever Office", []],
  ["food", "breakfast", "Southern Comfort Bed and Breakfast", ["lodging", "bed_and_breakfast"]],
  ["food", "all", "Southern Comfort Bed and Breakfast", ["lodging", "bed_and_breakfast"]],
  ["food", "all", "Jimmy Dean Bed and Breakfast", ["lodging"]],
  ["food", "breakfast", "Jimmy Dean Bed and Breakfast", []],
  ["shopping", "all", "Best Metal Recycling", ["recycling_center"]],
  // v4.97 — the live audit's Things to do → Outdoors junk class.
  ["attractions", "outdoors", "2A Lawn & Nursery", ["plant_nursery", "store"]],
  ["attractions", "outdoors", "Outdoor Kitchen Cabinets", ["furniture_store"]],
  ["attractions", "outdoors", "National Outdoor Furniture", ["furniture_store", "store"]],
  ["attractions", "outdoors", "SiteWorx Pools", ["general_contractor"]],
  ["attractions", "outdoors", "Sunscape Pools & Screen Enclosures", []],
  ["attractions", "outdoors", "Total Outdoor Care", []],
  ["attractions", "outdoors", "Ecopro Outdoor Solutions", []],
  // v5.06 — the scoring-system audit's find: a 4.9-star PARKING LOT named
  // after its beach ranked #4 under Beach day. Parking is never a destination.
  ["beach", "all", "Coquina Beach Parking", ["parking"]],
  ["beach", "all", "Coquina Beach Parking", []],
  ["beach", "beaches", "Coquina Beach Parking", []],
  ["attractions", "all", "Siesta Key Public Beach Parking", []],
  ["attractions", "all", "Manatee Park & Ride", []],
  // v6.15 — the shared classifier's cross-category veto. Food/service/outdoor
  // identities never leak into a discovery list they don't belong to, even when
  // a generic store/shop/market/park token is present. These are the exact live
  // offenders the owner caught (bagel/coffee in Shopping, an auto shop in
  // Shopping, a grocery market leading Shopping "All", a nature-preserve concert
  // venue in Nightlife).
  ["shopping", "all", "Detwiler's Farm Market", ["grocery_store", "butcher_shop", "market", "deli", "food_store", "food"]],
  ["shopping", "all", "Jersey Bagels", ["bagel_shop", "deli", "bakery", "cafe", "food_store", "food", "store"]],
  ["shopping", "all", "Orange Blossom Coffee", ["coffee_shop", "tea_house", "cafe", "food_store", "food"]],
  ["shopping", "all", "The Shop", ["auto_parts_store", "car_repair", "service", "store"]],
  ["nightlife", "all", "Habitat House Concerts", ["live_music_venue", "nature_preserve", "event_venue", "park"]],
  // These fail SUB_ALLOW itself (no rainy/beach token). chipIdentity covers
  // the museum-shaped leaks below — those regexes must not ride the homepage JS.
  ["family", "rainy", "River Walk", ["park", "tourist_attraction"]],
  ["family", "rainy", "Siesta Key Beach", ["beach"]],
  ["attractions", "beaches", "Ca' d'Zan", ["museum", "tourist_attraction"]],
];
for (const [cat, sub, name, types] of MUST_BLOCK) {
  if (placeAllowed(cat, sub, { name, types })) fail(`junk passed the gate: [${cat}:${sub}] ${name}`);
}

// Legit places that must NEVER be killed.
const MUST_PASS = [
  // v8.17 — the kava veto is SURGICAL: the lounge stays findable under
  // Food·All, and a real coffee-forward café is untouched under Cafés.
  ["food", "all", "Adobe Kava", ["tea_house", "coffee_shop", "cafe", "food_store", "store", "food"]],
  ["food", "cafes", "Spinning Coffee", ["coffee_shop", "cafe", "food"]],
  ["beach", "all", "Manatee Public Beach", ["beach"]],
  ["beach", "beaches", "Coquina Beach", ["beach"]],
  ["beach", "marinas", "Marina Jack", ["marina"]],
  ["attractions", "all", "Florida Railroad Museum", ["museum", "tourist_attraction"]],
  ["attractions", "museums", "The Ringling", ["museum", "art_gallery"]],
  ["attractions", "museums", "The Dalí Museum", ["museum"]],
  ["attractions", "tours", "LeBarge Tropical Cruises", ["boat_tour"]],
  ["attractions", "spa", "The Spa at The Don CeSar", ["spa"]],
  ["attractions", "family", "Sarasota Jungle Gardens", ["zoo"]],
  ["attractions", "landmarks", "Unconditional Surrender", ["tourist_attraction", "monument"]],
  ["attractions", "all", "De Soto National Memorial", ["tourist_attraction", "park", "national_memorial"]],
  ["attractions", "all", "Emerson Point Preserve", ["park"]],
  ["food", "all", "Star Fish Company", ["restaurant", "seafood"]],
  ["nightlife", "all", "The Gator Club", ["night_club", "bar"]],
  [null, null, "Detwiler's Farm Market", ["grocery_store"]],
  // v4.95 — category allowlists must not kill the real stuff.
  ["food", "all", "Good Liquid Brewing - Parrish Creekside Commons", ["bar", "brewery"]],
  ["food", "all", "Toasted Mango Cafe", ["cafe", "restaurant"]],
  ["food", "breakfast", "La Croisette", ["restaurant", "breakfast_restaurant"]],
  ["nightlife", "all", "Pangea Alchemy Lab", ["bar", "lounge"]],
  ["hotels", "all", "The Westin Sarasota", ["lodging", "hotel"]],
  ["shopping", "all", "Ellenton Premium Outlets", ["shopping_mall"]],
  // v4.96 — the flip side: the same B&B IS a legit Stay, and real breakfast
  // restaurants must keep passing the food gate under types-first judgment.
  ["hotels", "all", "Southern Comfort Bed and Breakfast", ["lodging", "bed_and_breakfast"]],
  ["food", "breakfast", "The Breakfast House", ["restaurant", "breakfast_restaurant"]],
  ["food", "all", "First Watch", ["restaurant", "breakfast_restaurant"]],
  ["food", "lunch", "S.O.B. Burgers", ["hamburger_restaurant"]],
  ["food", "lunch", "Burger Culture Lutz", ["hamburger_restaurant"]],
  ["food", "cafes", "Farmer's Milk Cafe & Bakery", ["cafe", "bakery", "coffee_shop"]],
  ["food", "breakfast", "Farmer's Milk Cafe & Bakery", ["cafe", "bakery", "breakfast_restaurant", "coffee_shop"]],
  ["food", "cafes", "Peachey's Baking Co — Landings", ["donut_shop", "bakery", "coffee_shop"]],
  ["food", "dessert", "Peachey's Baking Co — Landings", ["donut_shop", "bakery", "coffee_shop"]],
  ["food", "breakfast", "The Frog Pond SPB", ["breakfast_restaurant", "brunch_restaurant", "restaurant"]],
  ["food", "breakfast", "The Frog Pond Downtown St. Petersburg", ["breakfast_restaurant", "brunch_restaurant"]],
  ["food", "cafes", "Campfired", ["cafe", "brunch_restaurant", "breakfast_restaurant"]],
  ["food", "breakfast", "Campfired", ["brunch_restaurant", "breakfast_restaurant", "cafe"]],
  ["nightlife", "all", "Dive Cocktail Den", ["cocktail_bar", "bar"]],
  ["nightlife", "speakeasy", "Dive Cocktail Den", ["cocktail_bar", "bar"]],
  ["food", "lunch", "P J's Sandwich Shop", ["sandwich_shop"]],
  ["food", "cafes", "Toasted Mango Cafe", ["cafe", "coffee_shop"]],
  ["nightlife", "all", "The Office Pub", ["bar", "pub"]],
  ["food", "all", "Buttermilk Handcrafted Food", ["restaurant"]],
  ["attractions", "outdoors", "Emerson Point Preserve", ["park", "tourist_attraction"]],
  ["attractions", "outdoors", "Riverwalk", ["park", "tourist_attraction"]],
  ["attractions", "outdoors", "Robinson Preserve", ["park"]],
  // v5.06 — the parking veto must not clip real parks and beaches whose names
  // merely CONTAIN "park", and the actual Coquina Beach stays in.
  ["beach", "all", "Coquina Beach", ["beach"]],
  ["attractions", "outdoors", "Nathan Benderson Park", ["park"]],
  ["beach", "all", "Fort De Soto Park", ["park", "beach"]],
  ["attractions", "museums", "Bishop Museum of Science and Nature", ["museum", "science_museum"]],
  ["family", "rainy", "Bishop Museum of Science and Nature", ["museum", "science_museum"]],
  ["family", "kids", "Kids Empire", ["amusement_center", "entertainment"]],
  ["family", "toddlers", "Toddler Playground", ["playground", "park"]],
  ["attractions", "beaches", "Siesta Key Beach", ["beach"]],
  ["attractions", "beaches", "Fort De Soto Park", ["park", "beach"]],
];
for (const [cat, sub, name, types] of MUST_PASS) {
  if (!placeAllowed(cat, sub, { name, types })) fail(`legit place wrongly killed: [${cat}:${sub}] ${name}`);
}

// Named CHIP_IDENTITY — server-side. These rows pass a loose SUB_ALLOW
// (museum → rainy, nature → toddlers, escape → kids, key → beaches) and
// must still fail the tapped chip. Do not copy these regexes into
// placeFilter; that is homepage JS and the 496KB ratchet.
const { chipIdentity } = await import(new URL("../lib/chipIdentity.js", import.meta.url));
const CHIP_BLOCK = [
  ["family", "rainy", "Ca' d'Zan", ["museum", "tourist_attraction"], "museum"],
  ["family", "rainy", "Tibbals Learning Center & Circus Museum at The Ringling", ["museum"], "museum"],
  ["attractions", "beaches", "Siesta Key Tennis Club", ["tennis_court"], "tennis_court"],
  // Live Parrish screenshot, 2026-08-26. Both are filed category=beach in
  // wf_inventory and BOTH reached the chip on the word "Beach" in their NAME:
  // the pavilion carries no primary and no types beyond point_of_interest, the
  // preserve is typed nature_preserve + park. A coarse inventory bucket is not
  // identity. Real rows, verbatim from wf_inventory.
  ["attractions", "beaches", "E.G. Simmons Beach Pavilion 12", ["point_of_interest", "establishment"], null],
  ["attractions", "beaches", "Apollo Beach Preserve", ["nature_preserve", "tourist_attraction", "park"], "nature_preserve"],
  ["attractions", "beaches", "Apollo Beach Marina", ["marina", "point_of_interest"], "marina"],
  ["attractions", "beaches", "Apollo Beach Dog Park", ["dog_park", "park"], "dog_park"],
  // 2026-08-29 owner pins: a Gulf Blvd breakfast room is not sit-on-sand,
  // and a cocktail den is not a liquor store on Shopping.
  ["attractions", "beaches", "The Frog Pond SPB", ["breakfast_restaurant", "brunch_restaurant", "restaurant"], "breakfast_restaurant"],
  ["shopping", "all", "Dive Cocktail Den", ["cocktail_bar", "bar"], "cocktail_bar"],
  ["family", "kids", "Intense Escape", ["amusement_center"], "amusement_center"],
  ["family", "toddlers", "Bishop Museum of Science and Nature", ["museum", "science_museum"], "museum"],
];
for (const [cat, sub, name, types, primaryType] of CHIP_BLOCK) {
  if (chipIdentity(cat, sub, { name, types, primaryType, primary_type: primaryType })) {
    fail(`chipIdentity leaked [${cat}:${sub}] ${name}`);
  }
}
const CHIP_KEEP = [
  ["family", "rainy", "Bishop Museum of Science and Nature", ["museum", "science_museum"], "museum"],
  ["attractions", "museums", "Bishop Museum of Science and Nature", ["museum", "science_museum"], "museum"],
  ["attractions", "beaches", "Siesta Key Beach", ["beach"], "beach"],
  ["attractions", "beaches", "Fort De Soto Park", ["park", "beach"], "park"],
  // The tightening above must not clip a real beach whose Google types are
  // thin. Real row: primary_type beach, google_types [park, point_of_interest].
  ["attractions", "beaches", "Fort De Soto Beach", ["park", "point_of_interest"], "beach"],
  ["family", "kids", "Kids Empire", ["amusement_center", "entertainment"], "amusement_center"],
  ["food", "breakfast", "The Frog Pond SPB", ["breakfast_restaurant", "brunch_restaurant", "restaurant"], "breakfast_restaurant"],
  ["nightlife", "all", "Dive Cocktail Den", ["cocktail_bar", "bar"], "cocktail_bar"],
];
for (const [cat, sub, name, types, primaryType] of CHIP_KEEP) {
  if (!chipIdentity(cat, sub, { name, types, primaryType, primary_type: primaryType })) {
    fail(`chipIdentity wrongly killed [${cat}:${sub}] ${name}`);
  }
}

console.log(`check-gate: OK — real module executed; ${MUST_BLOCK.length} junk fixtures blocked (incl. nail salon under Museums), ${MUST_PASS.length} legit fixtures pass, ${CHIP_BLOCK.length} chip-identity leaks blocked`);
