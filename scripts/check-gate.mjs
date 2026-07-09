// Guardrail: the junk-filter contract (v4.90). The category gate lives in ONE
// place — lib/sources.js junkGate — and every place search must flow through
// it. This check fails the build loudly if:
//   1. known junk (service businesses) would pass the gate,
//   2. known legit places would be wrongly killed,
//   3. app/page.js stops importing searchPlaces from lib/sources (i.e. some
//      view goes back to Google-only and bypasses the shared gate).
// Regex fixtures are extracted from the real source file so this can never
// drift silently from what actually ships.
import { readFileSync } from "fs";
const fail = (m) => { console.error("check-gate: FAIL — " + m); process.exit(1); };
const src = readFileSync(new URL("../lib/sources.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");

// 3. single-pipe wiring
if (!/import \{ searchPlaces \} from "\.\.\/lib\/sources"/.test(page)) fail("page.js no longer imports searchPlaces from lib/sources — views are bypassing the shared gate");
if (/import \{[^}]*\bsearchPlaces\b[^}]*\} from "\.\.\/lib\/google"/.test(page)) fail("page.js imports searchPlaces directly from lib/google — junk gate bypassed");
if (!src.includes("export function junkGate")) fail("junkGate missing from lib/sources.js");
if (!src.includes("junkGate(categoryId, p)")) fail("merged pool is not filtered through junkGate before ranking");

// 1+2. behavior fixtures against the SHIPPED regexes
const rx = (name) => {
  const m = src.match(new RegExp("const " + name + " = (\\/(?:[^\\/\\\\]|\\\\.)+\\/[a-z]*);"));
  if (!m) fail("could not extract " + name + " from lib/sources.js");
  return eval(m[1]);
};
const SERVICE_RX = rx("SERVICE_RX");
const SERVICE_TYPES_RX = rx("SERVICE_TYPES_RX");
const BEACH_ALLOW_RX = rx("BEACH_ALLOW_RX");
const TODO_ALLOW_RX = rx("TODO_ALLOW_RX");
const gate = (cat, name, types = []) => {
  const hay = (types.join(" ") + " " + name).toLowerCase();
  if (SERVICE_TYPES_RX.test(hay) || SERVICE_RX.test(hay)) return false;
  if (cat === "beach") return BEACH_ALLOW_RX.test(hay);
  if (cat === "attractions") return TODO_ALLOW_RX.test(hay);
  return true;
};

const MUST_BLOCK = [
  ["attractions", "Bob's Cooling and Heating", ["point_of_interest"]],
  ["attractions", "Two Men and a Truck Moving & Storage", []],
  ["attractions", "Suncoast Roofing & Solar", []],
  ["beach", "America's Best Contacts & Eyeglasses", ["store"]],
  ["beach", "Parrish Family Dental", []],
  ["food", "Statewide Insurance Agency", ["insurance_agency"]],
  ["nightlife", "AAA Self Storage", ["storage"]],
  ["attractions", "Manatee Urgent Care Clinic", ["doctor"]],
  ["attractions", "Precision Auto Repair", ["car_repair"]],
];
for (const [cat, name, types] of MUST_BLOCK) {
  if (gate(cat, name, types)) fail(`junk passed the gate: [${cat}] ${name}`);
}

const MUST_PASS = [
  ["beach", "Manatee Public Beach", ["beach"]],
  ["beach", "Fort De Soto Park", ["park"]],
  ["beach", "Historic Bridge Street Pier", ["pier"]],
  ["attractions", "Florida Railroad Museum", ["museum", "tourist_attraction"]],
  ["attractions", "The Ringling", ["museum", "art_gallery"]],
  ["attractions", "Emerson Point Preserve", ["park"]],
  ["attractions", "De Soto National Memorial", ["tourist_attraction", "park", "national_memorial"]],
  ["food", "Star Fish Company", ["restaurant", "seafood"]],
  ["nightlife", "The Gator Club", ["night_club", "bar"]],
];
for (const [cat, name, types] of MUST_PASS) {
  if (!gate(cat, name, types)) fail(`legit place wrongly killed: [${cat}] ${name}`);
}
console.log(`check-gate: OK — single shared gate wired, ${MUST_BLOCK.length} junk fixtures blocked, ${MUST_PASS.length} legit fixtures pass`);
