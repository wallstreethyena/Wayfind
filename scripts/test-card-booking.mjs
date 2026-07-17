// scripts/test-card-booking.mjs — locks the card-level PAID booking link
// (owner: "multiple of these cards can be booked and they are not offering
// that to the user... no tracking will be generated"). Bookable cards carry
// the Tickets CTA through the verified /api/viator/go gate, and the card's
// ticket gate must MATCH the Detail sheet's ticket-render gate (TICKETY place
// types) so the paid CTA never renders on free parks/beaches/scenic.
import { readFileSync } from "fs";
import { isTicketyPlace } from "../lib/affiliates.js";

let pass = 0;
const fail = (m) => { console.error("test-card-booking: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const aff = readFileSync(new URL("../lib/affiliates.js", import.meta.url), "utf8");

ok(/src: "place_card"/.test(home) && /\/api\/viator\/go\?q=/.test(home),
  "PlaceCard carries the paid booking CTA through /api/viator/go (attributed on every click)");

// The card CTA gates on Aff.isTicketyPlace(p) — the SAME TICKETY place-type gate
// the Detail sheet's ticketsUrl() uses — so the two surfaces can never diverge on
// which places show a paid ticket CTA.
ok(/Aff\.isTicketyPlace\(p\)/.test(home),
  "the card 'Tickets & tours' CTA gates on Aff.isTicketyPlace(p)");
ok(/export function isTicketyPlace/.test(aff) && /export function ticketsUrl/.test(aff) &&
   (aff.match(/TICKETY\.test\(types\)/g) || []).length >= 2,
  "isTicketyPlace and ticketsUrl share the one TICKETY place-type gate (card matches the sheet)");
ok(!/\.includes\(placeKind\(p\)\)/.test(home),
  "the card CTA no longer gates on a broad placeKind allowlist (no beach/nature/scenic leak)");
ok(/cardBookingHref\(p\)/.test(home), "CTA href is built by cardBookingHref (name + city + kind + placeId)");

const ctaLine = home.split("\n").find((l) => l.includes('src: "place_card"')) || "";
ok(/e\.stopPropagation\(\)/.test(ctaLine), "CTA click never hijacks the card tap (stopPropagation)");
ok(/target="_blank"/.test(ctaLine), "CTA opens in a new tab");
ok(/rel="sponsored/.test(ctaLine), "CTA carries rel=sponsored (FTC/affiliate hygiene)");
ok(/tickets_out/.test(ctaLine), "CTA click logs tickets_out for revenue tracking");

// Behavioral lock: TICKETY admits ticketed venues and excludes free inventory.
ok(isTicketyPlace({ types: ["museum"] }) === true && isTicketyPlace({ types: ["zoo"] }) === true &&
   isTicketyPlace({ types: ["aquarium"] }) === true && isTicketyPlace({ types: ["amusement_park", "point_of_interest"] }) === true &&
   isTicketyPlace({ types: ["water_park"] }) === true && isTicketyPlace({ types: ["tourist_attraction"] }) === true,
  "ticketed venues (museum/zoo/aquarium/amusement/water park/attraction) DO get the CTA");
ok(isTicketyPlace({ types: ["park"] }) === false && isTicketyPlace({ types: ["natural_feature"] }) === false &&
   isTicketyPlace({ types: ["beach"] }) === false && isTicketyPlace({ types: ["restaurant"] }) === false &&
   isTicketyPlace({}) === false && isTicketyPlace(null) === false,
  "free parks / beaches / scenic / restaurants / typeless / null NEVER get the paid CTA");

console.log(`test-card-booking: OK — ${pass} assertions (paid CTA on ticketed cards only; card gate matches the sheet's TICKETY gate)`);
