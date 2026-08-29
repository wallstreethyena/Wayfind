#!/usr/bin/env node
/**
 * test-owner-places-2026-08-29d — lock Gabe's 2026-08-29d Florida pin batch.
 *
 * Same law as #1019: two-beat hook only; empty if unsourced; no Book / /go;
 * no Places. This batch has no public ChIJ, so there are ZERO Atlas cards.
 * Delicieux hook stays EMPTY (no official award). BrewKini’s hook is
 * official Spaddy's + Shuffle. Rodeo is two dated event rows, not a
 * restaurant. HOLDs write nothing (unnamed venues, earlier-batch leftovers).
 * Asserted on the CALL (chipIdentity / toHookLine / isUsableCardHook)
 * and on the batch JSON — a regex over this file would pass while a minted
 * ChIJ leaked onto a card.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chipIdentity } from "../lib/chipIdentity.js";
import { toHookLine, isUsableCardHook } from "../lib/editorialHook.js";
import { listPublishReadyAtlasIds } from "../lib/atlasPlaceAllowlist.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const batch = JSON.parse(readFileSync(join(ROOT, "data/atlas/owner-batch-2026-08-29d.json"), "utf8"));
const cards = JSON.parse(readFileSync(join(ROOT, "data/atlas/editorial-cards.json"), "utf8"));
const ingest = readFileSync(join(ROOT, "scripts/ingest-verified-2026-08-29d.mjs"), "utf8");
const notes = readFileSync(join(ROOT, "data/atlas/HOLD-2026-08-29d.md"), "utf8");

let n = 0;
const fail = [];
const ok = (c, m) => { n++; if (!c) fail.push(m); };

const PLACE_ID = /^ChIJ[A-Za-z0-9_-]{20,}$/;
const HOOK_STREET_NUM = /\b\d{3,6}\s+(?:[nsew]\.?\s+)?[A-Za-z]/;
const ADD = batch.places.filter((p) => p.status === "add");
const ALREADY = batch.places.filter((p) => p.status === "already_in");
const HOLD_GOOGLE = batch.places.filter((p) => p.status === "hold_google_id");
const HOLDS = batch.holds;
const EVENTS = batch.events;

ok(ADD.length === 0, `this batch has no public ChIJ — expected 0 ADD pins, got ${ADD.length}`);
ok(ALREADY.length === 0, "no already-in rows on this batch");
ok(HOLD_GOOGLE.length === 2, `expected 2 hold_google_id rows, got ${HOLD_GOOGLE.length}`);
ok(HOLD_GOOGLE.every((p) => /Delicieux Food Truck|BrewKini.?s Coffee Co/.test(p.name)),
  "the two hold_google_id names are Delicieux and BrewKini’s");
ok(!HOLD_GOOGLE.some((p) => /Wilmington|Brew-Kini/i.test(p.name)),
  "Wilmington NC Brew-Kini is not this pin");
ok(HOLDS.some((h) => /Neon|Blacklight/i.test(h.name)) &&
   HOLDS.some((h) => /Sugared Lime/i.test(h.name)) &&
   HOLDS.some((h) => /Plant City/i.test(h.name)) &&
   HOLDS.some((h) => /Florida Beach Experience/i.test(h.name)) &&
   HOLDS.some((h) => /Chicken Guy/i.test(h.name)) &&
   HOLDS.some((h) => /Sloan'?s Ice Cream/i.test(h.name)) &&
   HOLDS.some((h) => /Dirty Sara/i.test(h.name)) &&
   HOLDS.some((h) => /Happy Hands/i.test(h.name)) &&
   HOLDS.some((h) => /Eiswerkstatt/i.test(h.name)) &&
   HOLDS.some((h) => /Meacham Urban Farm/i.test(h.name)) &&
   HOLDS.some((h) => /Dancing Goat Dairy/i.test(h.name)) &&
   HOLDS.some((h) => /Fat Beet Farm/i.test(h.name)) &&
   HOLDS.some((h) => /#1025/i.test(h.name)) &&
   HOLDS.some((h) => /Actually Worth Eating/i.test(h.name)),
  "unnamed-venue HOLDs, earlier-batch leftovers, #1025 list, and the Actually Worth Eating intent are named");

ok(listPublishReadyAtlasIds().length === 264,
  "Atlas publish-ready lock is 264 — this batch minted none; 2026-08-29e added the official NRB ChIJ");

for (const p of HOLD_GOOGLE) {
  ok(p.placeId == null, `${p.name}: invented a Google id — HOLD the id, do not mint a ChIJ`);
  ok(!PLACE_ID.test(String(p.placeId || "")), `${p.name}: placeId looks like a ChIJ`);
  ok(!cards.some((c) => c && c.name === p.name),
    `${p.name}: leaked an Atlas card without a public ChIJ`);
  ok(typeof p.address === "string" && p.address.trim().length >= 12,
    `${p.name}: official / documented address is the publishable pin`);
  ok(!/\/go\b|book tickets|book now/i.test(JSON.stringify(p)),
    `${p.name}: Book / /go leaked`);
  ok(!/best burger|best food truck|tampa mag/i.test([p.knownFor, p.whyGo, p.vibeCheck].join(" ")),
    `${p.name}: invented a Tampa Mag award`);
  ok(!/tiny umbrella/i.test([p.knownFor, p.whyGo].join(" ")),
    `${p.name}: tiny umbrellas leaked — official page did not print them`);
  const shaped = { name: p.name, types: p.types, primaryType: p.primaryType, primary_type: p.primaryType };
  for (const [cat, sub] of p.chipsKeep) {
    ok(chipIdentity(cat, sub, shaped) === true,
      `${p.name}: chipIdentity FAILED [${cat}:${sub}] — identity-before-rank`);
  }
  for (const [cat, sub] of p.chipsBlock) {
    ok(chipIdentity(cat, sub, shaped) === false,
      `${p.name}: chipIdentity LEAKED [${cat}:${sub}]`);
  }
}

const delicieux = HOLD_GOOGLE.find((p) => /Delicieux/i.test(p.name));
ok(delicieux && delicieux.knownFor == null && delicieux.whyGo == null,
  "Delicieux hook stays EMPTY — no official-page award or sourced two-beat");
ok(delicieux && toHookLine(delicieux.knownFor, delicieux.name) === "",
  "Delicieux toHookLine is empty — empty stays empty");
ok(delicieux && /1031 W Busch/i.test(delicieux.address) && /Tampa/i.test(delicieux.address),
  "Delicieux standing lot is 1031 W Busch Blvd Tampa — not a roaming pin");
ok(delicieux && delicieux.lat == null && delicieux.lng == null,
  "Delicieux does not invent lat/lng — no official coords, no named OSM pin");
ok(delicieux && /standing lot|home lot|fence/i.test(delicieux.note + delicieux.researchNote),
  "Delicieux records the documented standing lot without minting a card");
ok(delicieux && chipIdentity("food", "cafes", {
  name: delicieux.name, types: delicieux.types, primaryType: delicieux.primaryType, primary_type: delicieux.primaryType,
}) === false, "Delicieux food truck must not file on Cafes");

const brew = HOLD_GOOGLE.find((p) => /BrewKini/i.test(p.name));
ok(brew && typeof brew.knownFor === "string" && brew.knownFor.trim().length >= 20,
  "BrewKini’s two-beat is sourced on the batch even while the Google id is held");
const brewLine = toHookLine(brew.knownFor, brew.name);
ok(brewLine.length >= 20, `BrewKini’s: toHookLine emptied the sourced two-beat (got "${brewLine}")`);
ok(isUsableCardHook(brewLine, brew.name), "BrewKini’s: two-beat failed isUsableCardHook");
ok(!/\b\d{1,2}:\d{2}\b/.test(brew.knownFor), "BrewKini’s: hook dumped a clock");
ok(!/\b(?:fl|florida)\s+\d{5}\b/i.test(brew.knownFor), "BrewKini’s: hook dumped a zip");
ok(!HOOK_STREET_NUM.test(brew.knownFor), "BrewKini’s: hook dumped a house-number street");
ok(brew && brew.lat === 27.9675568 && brew.lng === -82.4611897 && brew.coordSource === "official-maps-url",
  "BrewKini’s uses the official Maps-URL !2d pair — not a Places geocode, not the @40.43 NJ viewport");
ok(brew && brew.officialMapsFid === "0xabe5d28ac407ddb5:0x1973c287449c06cf",
  "BrewKini’s records the official hex FID and does not promote it to a ChIJ");
ok(brew && /33605/.test(brew.address) && !/33602/.test(brew.address),
  "BrewKini’s official zip is 33605, not Yelp 33602");
ok(brew && /Spaddy/i.test(brew.knownFor) && /Shuffle/i.test(brew.knownFor) && /Tampa Heights/i.test(brew.knownFor),
  "BrewKini’s two-beat is official Spaddy's beans + the Tampa Heights trailer next to Shuffle");
ok(brew && /brewkinisco\.com/.test(brew.officialWebsite),
  "BrewKini’s cites the official Tampa site, not Wilmington");

for (const h of HOLDS) {
  const stem = h.name.split(",")[0].toLowerCase().replace(/[^a-z0-9 #]/g, "").slice(0, 18);
  if (/#1025|actually worth/.test(h.name.toLowerCase())) continue;
  ok(!cards.some((c) => c && c.name && stem.length >= 8 && c.name.toLowerCase().includes(stem.trim())),
    `HOLD ${h.name} leaked into editorial-cards.json`);
}

const neon = HOLDS.find((h) => /Neon|Blacklight/i.test(h.name));
ok(neon && /did not name|until the owner names/i.test(neon.note),
  "Neon / Blacklight HOLD waits for the owner to name the venue");
ok(neon && /Marcolina|Painting with a Twist|Lume/i.test(neon.note),
  "Neon HOLD records the candidate list without picking one");

const lime = HOLDS.find((h) => /Sugared Lime/i.test(h.name));
ok(lime && /Alessi/i.test(lime.note) && /do not pin/i.test(lime.note),
  "Sugared Lime HOLD refuses an Alessi / porch-bakery guess");

const bakery = HOLDS.find((h) => /Plant City/i.test(h.name));
ok(bakery && /El Mirasol/i.test(bakery.note) && /Exclusively Yours/i.test(bakery.note),
  "Plant City bakery HOLD names the guesses it refuses");

const beach = HOLDS.find((h) => /Florida Beach Experience/i.test(h.name));
ok(beach && /not a place/i.test(beach.note) && /random beach/i.test(beach.note),
  "Florida Beach clip is held as not-a-place");

const eating = HOLDS.find((h) => /Actually Worth Eating/i.test(h.name));
ok(eating && /no new chip|taxonomy|home\.js/i.test(eating.note),
  "Actually Worth Eating stays an intent note — no new home chip");

ok(EVENTS.length === 2, `expected 2 rodeo night rows, got ${EVENTS.length}`);
ok(EVENTS.every((e) => e.event_series_id === "tampa-bay-rodeo-family-festival"),
  "both nights share the Tampa Bay Rodeo series id");
ok(EVENTS.every((e) => e.start_date === e.end_date),
  "each rodeo row is one calendar day — a Sep 4–5 range would paint as 'now' on Saturday morning after Friday");
ok(["2026-09-04", "2026-09-05"].every((d) => EVENTS.some((e) => e.start_date === d)),
  "Rodeo dates are the official Labor Day weekend nights");
ok(EVENTS.every((e) => e.official_event_url === "https://tamparodeo.com/"),
  "Rodeo cites the official tamparodeo.com page");
ok(EVENTS.every((e) => e.place_id == null),
  "Rodeo does not invent a fairgrounds ChIJ");
ok(EVENTS.every((e) => e.lat == null && e.lng == null),
  "Rodeo does not use the unnamed OSM house geocode or a Visit Tampa Bay street centroid as a pin");
ok(EVENTS.every((e) => e.venue === "Hillsborough County Fairgrounds" && /215 Sydney Washer/i.test(e.address) && e.city === "Dover"),
  "Rodeo venue is the official fairgrounds street in Dover — not a restaurant");
ok(EVENTS.every((e) => /first Labor Day/i.test(e.card_hook) && /Hillsborough County Fairgrounds/i.test(e.card_hook)),
  "Rodeo hook keeps first Labor Day + the fairgrounds sit");
ok(EVENTS.every((e) => !/\b\d{1,2}:\d{2}\b/.test(e.card_hook)),
  "Rodeo hook does not dump the 4:30 / 5:45 / 7:30 clocks");
ok(EVENTS.every((e) => e.is_free === false && e.price_band === "tickets"),
  "Rodeo is a ticketed event, not a free always-open card");

for (const e of EVENTS) {
  ok(["scheduled", "sold_out"].includes(e.event_status), `${e.event_id}: displayable status`);
  ok(e.source_tier && e.source_tier <= 4, `${e.event_id}: source_tier must date an event`);
  ok(e.verification_confidence && e.verification_confidence !== "low", `${e.event_id}: confidence`);
  ok(e.card_hook && e.city, `${e.event_id}: a card with no hook is a calendar row`);
  ok(!/\/go\b|book now/i.test(JSON.stringify(e)), `${e.event_id}: Book / /go leaked`);
}

ok(/PINNED_IDS = \{\}/.test(ingest) || /export const PINNED_IDS = \{\}/.test(ingest),
  "ingest pins an empty ChIJ map — a minted id would be PINNED_IDS drift");
ok(/Delicieux Food Truck/.test(ingest) && /BrewKini/.test(ingest),
  "ingest names the hold_google_id shops");
ok(/Tampa Bay Rodeo/.test(ingest) && /Sep 4/.test(ingest),
  "ingest names the rodeo as dated event rows");
ok(/Neon|Blacklight/.test(ingest) && /Sugared Lime/.test(ingest) && /Plant City/.test(ingest) && /Florida Beach/.test(ingest),
  "ingest HOLDs the unnamed-venue names");
ok(/Chicken Guy/.test(ingest) && /Dirty Sara/.test(ingest) && /Happy Hands/.test(ingest) && /Sloan/.test(ingest) && /Eiswerkstatt/.test(ingest),
  "ingest HOLDs the earlier-batch leftovers");
ok(!/places\.googleapis\.com/.test(ingest) && !/\bsearchText\s*\(/.test(ingest),
  "ingest is fail-closed — no Places host and no searchText()");
ok(!/app\/home\.js|IconicPlaceCard|app\/globals/.test(ingest),
  "ingest does not touch homepage JS, IconicPlaceCard, or CSS");

ok(/Delicieux Food Truck/.test(notes) && /1031 W Busch/.test(notes),
  "HOLD notes name Delicieux's standing lot");
ok(/EMPTY/.test(notes) && /Best Burger/.test(notes),
  "HOLD notes keep Delicieux hook empty and refuse the Tampa Mag awards");
ok(/BrewKini/.test(notes) && /Spaddy/.test(notes) && /Shuffle/.test(notes),
  "HOLD notes name BrewKini’s official two-beat");
ok(/33605/.test(notes) && /Wilmington/.test(notes),
  "HOLD notes keep official 33605 and refuse Wilmington Brew-Kini");
ok(/tiny umbrella/i.test(notes) && /omitted|Yelp-only|Yelp only/i.test(notes),
  "HOLD notes omit tiny umbrellas (Yelp only)");
ok(/Tampa Bay Rodeo/.test(notes) && /2026-09-04|Sep 4/.test(notes) && /not a restaurant|not a daily place/i.test(notes),
  "HOLD notes record the rodeo as an event, not a place card");
ok(/Neon|Blacklight/.test(notes) && /Sugared Lime/.test(notes) && /Plant City/.test(notes) && /Florida Beach Experience/.test(notes),
  "HOLD notes name the requested unnamed HOLDs");
ok(/Chicken Guy/.test(notes) && /Sloan/.test(notes) && /Dirty Sara/.test(notes) && /Happy Hands/.test(notes) && /Eiswerkstatt/.test(notes),
  "HOLD notes keep the earlier-batch leftovers");
ok(/Meacham Urban Farm/.test(notes) && /Dancing Goat/.test(notes) && /Fat Beet/.test(notes),
  "HOLD notes keep the three Tampa farms from #1019");
ok(/#1025/.test(notes) && /Actually Worth Eating/.test(notes),
  "HOLD notes keep the #1025 no-ChIJ list and refuse a new home chip");
ok(/places\.googleapis\.com|Places API/.test(notes) && /not called|never called|ZERO/i.test(notes),
  "HOLD notes state Places was not called");
ok(/what would unblock|Maps share URL/i.test(notes),
  "HOLD notes say what Maps share / named OSM node would unblock each ChIJ");

// Red-prove: a cafe typed as beach must not be how we file BrewKini’s.
ok(chipIdentity("attractions", "beaches", {
  name: "BrewKini’s Coffee Co", types: ["beach"], primaryType: "beach", primary_type: "beach",
}) === true,
  "control: a beach primary WOULD pass Beaches — that is why BrewKini’s uses coffee_shop");
ok(chipIdentity("attractions", "beaches", {
  name: "BrewKini’s Coffee Co", types: ["coffee_shop", "cafe"],
  primaryType: "coffee_shop", primary_type: "coffee_shop",
}) === false, "the shipped BrewKini’s types must fail Activities → Beaches");

// Red-prove: a food truck typed as cafe must not be how we file Delicieux.
ok(chipIdentity("food", "cafes", {
  name: "Delicieux Food Truck", types: ["cafe", "coffee_shop"], primaryType: "cafe", primary_type: "cafe",
}) === true,
  "control: a cafe primary WOULD pass Cafes — that is why Delicieux uses food_truck");
ok(chipIdentity("food", "cafes", {
  name: "Delicieux Food Truck", types: ["food_truck", "hamburger_restaurant"],
  primaryType: "food_truck", primary_type: "food_truck",
}) === false, "the shipped Delicieux types must fail Cafes");

if (fail.length) {
  console.error("test-owner-places-2026-08-29d: FAIL");
  for (const m of fail) console.error("  - " + m);
  process.exit(1);
}
console.log(`test-owner-places-2026-08-29d: OK — ${n} assertions; ${ADD.length} Atlas cards; ${HOLD_GOOGLE.length} google-id holds; ${HOLDS.length} HOLDs; ${EVENTS.length} events`);
