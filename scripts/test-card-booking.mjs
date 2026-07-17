// scripts/test-card-booking.mjs — locks the place-card booking CTA.
// booking-integrity (v2): the card has no per-card verified-offer precompute, so it
// must NOT show a verified-sounding "Tickets & tours" — it renders the honest generic
// "Search Viator", gated on Aff.isTicketyPlace so it only appears on ticketed venues
// (never free parks/beaches). The /api/viator/go URL is built in lib/affiliates
// (experienceGoUrl), never hand-rolled in home.js. The /go route still upgrades to
// the exact product at click time when one clears the geo-gated resolver.
import { readFileSync } from "fs";
import { isTicketyPlace } from "../lib/affiliates.js";

let pass = 0;
const fail = (m) => { console.error("test-card-booking: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const aff = readFileSync(new URL("../lib/affiliates.js", import.meta.url), "utf8");
const ctaLine = home.split("\n").find((l) => l.includes('src: "place_card"')) || "";

ok(/src: "place_card"/.test(home) && /cardBookingHref\(p\)/.test(home),
  "PlaceCard renders the booking CTA via cardBookingHref (attributed on every click)");
// The /go URL is built in exactly one place — lib/affiliates.experienceGoUrl — not here.
ok(/Aff\.experienceGoUrl/.test(home), "the card delegates /go construction to lib/affiliates (experienceGoUrl)");
ok(/export function experienceGoUrl/.test(aff) && /\/api\/viator\/go/.test(aff),
  "experienceGoUrl (in affiliates) is the one place that builds /api/viator/go");

// Honesty: the card shows the generic "Search Viator", never a verified-sounding
// "Tickets & tours" (no per-card verified-offer confirmation exists at build time).
ok(/Search Viator/.test(ctaLine), "the card CTA is the honest 'Search Viator' label");
ok(!/Tickets & tours/.test(ctaLine), "the card CTA never claims a verified 'Tickets & tours'");

// Gated on Aff.isTicketyPlace(p) — the same TICKETY place-type gate the Detail sheet
// uses — so it only shows on ticketed venues, never a broad placeKind allowlist.
ok(/Aff\.isTicketyPlace\(p\)/.test(home), "the card CTA gates on Aff.isTicketyPlace(p)");
ok(/export function isTicketyPlace/.test(aff) && /export function ticketsUrl/.test(aff) &&
   (aff.match(/TICKETY\.test\(types\)/g) || []).length >= 2,
  "isTicketyPlace and ticketsUrl share the one TICKETY place-type gate");
ok(!/\.includes\(placeKind\(p\)\)/.test(home), "the card CTA does not gate on a broad placeKind allowlist");

ok(/e\.stopPropagation\(\)/.test(ctaLine), "CTA click never hijacks the card tap (stopPropagation)");
ok(/target="_blank"/.test(ctaLine), "CTA opens in a new tab");
ok(/rel="sponsored/.test(ctaLine), "CTA carries rel=sponsored (FTC/affiliate hygiene)");
ok(/tickets_out/.test(ctaLine), "CTA click logs tickets_out for attribution");

// Behavioral lock: TICKETY admits ticketed venues and excludes free inventory.
ok(isTicketyPlace({ types: ["museum"] }) === true && isTicketyPlace({ types: ["zoo"] }) === true &&
   isTicketyPlace({ types: ["aquarium"] }) === true && isTicketyPlace({ types: ["amusement_park", "point_of_interest"] }) === true &&
   isTicketyPlace({ types: ["water_park"] }) === true && isTicketyPlace({ types: ["tourist_attraction"] }) === true,
  "ticketed venues (museum/zoo/aquarium/amusement/water park/attraction) DO get the CTA");
ok(isTicketyPlace({ types: ["park"] }) === false && isTicketyPlace({ types: ["natural_feature"] }) === false &&
   isTicketyPlace({ types: ["beach"] }) === false && isTicketyPlace({ types: ["restaurant"] }) === false &&
   isTicketyPlace({}) === false && isTicketyPlace(null) === false,
  "free parks / beaches / scenic / restaurants / typeless / null NEVER get the paid CTA");

console.log(`test-card-booking: OK — ${pass} assertions (honest 'Search Viator' card CTA; /go built only in affiliates; TICKETY gate)`);
