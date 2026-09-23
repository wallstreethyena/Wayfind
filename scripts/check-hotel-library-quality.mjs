// check-hotel-library-quality — the owned hotel library may only serve places
// you can book a room at (2026-09-23, before the app launch).
//
// WHAT WENT WRONG. lib/ownedHotels.json is ingested data, and ingestion swept
// in a nail salon, a symphony, a tomato grower, two party-bike operators, a
// campground, several condo associations, a few private homes, an amenity
// ("Pool at Holiday Inn Express & Suites", "Hyatt Pool") and one row whose
// name is an email address. Every one of them was being served as a hotel card
// with a "Check rates" button pointing at a booking site — a promise Wayfind
// cannot keep, on the surface that earns commission.
//
// WHAT THIS GUARD HOLDS. Three things, and it can fail on each:
//   1. every row named in lib/ownedHotelExclusions.js is actually gone from
//      what lib/hotels.js serves, and carries a reason;
//   2. real hotels are STILL served — the expensive failure here is not a
//      stray salon, it is quietly deleting the Ritz-Carlton;
//   3. no served row matches the non-lodging name shapes at all, so the next
//      ingestion cannot reintroduce the same class of row unnoticed.
import { readFileSync } from "node:fs";
import { OWNED_HOTEL_EXCLUSIONS, ownedHotelKey, isExcludedOwnedHotel } from "../lib/ownedHotelExclusions.js";

let pass = 0;
const fail = [];
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };

const rows = JSON.parse(readFileSync(new URL("../lib/ownedHotels.json", import.meta.url), "utf8"));

// Mirrors lib/hotels.js's isJunkHotel. Asserted to stay in step below, so this
// copy can never drift into testing a rule the app does not apply.
const namedJunk = (h) => {
  const n = ((h && h.name) || "").trim();
  if (!n) return true;
  if (/^\d+\s+[A-Za-z]/.test(n)) return true;
  return /\bvacation rental|\brentals\b|\bby owner\b|redawning/i.test(n);
};
const served = rows.filter((h) => !namedJunk(h) && !isExcludedOwnedHotel(h));

// 1 — the app actually consults the exclusion list.
const hotelsSrc = readFileSync(new URL("../lib/hotels.js", import.meta.url), "utf8");
// The CALL, not the import (an earlier draft matched the identifier and passed
// with the call deleted — the same trap that made a sibling guard vacuous).
ok(/isExcludedOwnedHotel\s*\(\s*h\s*\)/.test(hotelsSrc), "L1: lib/hotels.js CALLS the exclusion check on each row");
ok(/ownedHotelExclusions/.test(hotelsSrc), "L2: and imports it from lib/ownedHotelExclusions.js");

// 2 — every exclusion is real, reasoned, and gone.
const servedKeys = new Set(served.map(ownedHotelKey));
const rowKeys = new Set(rows.map(ownedHotelKey));
for (const e of OWNED_HOTEL_EXCLUSIONS) {
  ok(!servedKeys.has(e.key), `L3: excluded row is not served — ${e.name}`);
  ok(rowKeys.has(e.key), `L4: exclusion matches a real row (a typo would silently protect nothing) — ${e.name}`);
  ok(typeof e.reason === "string" && e.reason.length > 10, `L5: exclusion carries a reason — ${e.name}`);
}

// 3 — REAL HOTELS ARE STILL THERE. The costly mistake is over-pruning.
const KEEP = [
  "The Ritz-Carlton, Sarasota", "Zota Beach Resort", "Palmetto Riverside Bed & Breakfast",
  "Hampton Inn & Suites", "Palmetto Marriott Resort & Spa", "Deluxe Inn/Mini Storage",
  "The Westin Sarasota", "Holiday Inn Sarasota-Lido Beach-@the Beach", "Siesta Breakers Resort",
];
const servedNames = new Set(served.map((h) => h.name));
for (const n of KEEP) ok(servedNames.has(n), `L6: a real hotel is still served — ${n}`);
ok(served.length > 350, `L7: the library still serves a full list (got ${served.length})`);

// 4 — the shapes themselves may not appear in what we serve.
const FORBIDDEN = [
  [/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i, "an email address"],
  [/\brestaurant\b|bar (&|and) grill|late night/i, "a restaurant or bar"],
  [/condo association|\bapt\b|\bapartments\b/i, "a condo or apartment building"],
  [/campground|\brv park\b|\br v park\b/i, "a campground or RV park"],
  [/^pool at |poolside$/i, "an amenity"],
  [/\bnails?\b|massage|slim down/i, "a personal-care business"],
];
for (const [re, what] of FORBIDDEN) {
  const hit = served.find((h) => re.test(h.name || ""));
  ok(!hit, `L8: nothing served looks like ${what}${hit ? ` — found "${hit.name}"` : ""}`);
}

// 5 — MUTATION CONTROL. A guard that cannot go red is decoration: prove the
// rule bites by running it against a library with a salon put back in.
{
  const sabotaged = [...served, { name: "Aqua Nails Spa", lat: 27.26724, lng: -82.51569 }];
  const caught = FORBIDDEN.some(([re]) => sabotaged.some((h) => re.test(h.name || "")));
  ok(caught, "L9: MUTATION CONTROL — putting a nail salon back into the served list is caught");
  const stillHidden = isExcludedOwnedHotel({ name: "Aqua Nails Spa", lat: 27.26724 });
  ok(stillHidden, "L10: and the exclusion list itself still refuses that exact row");
}

if (fail.length) {
  console.error(`check-hotel-library-quality: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-hotel-library-quality: OK — ${pass} assertions; ${OWNED_HOTEL_EXCLUSIONS.length} rows excluded, ${served.length} hotels served`);
