#!/usr/bin/env node
/**
 * test-owner-places-2026-08-29e — lock Gabe's 2026-08-29e Florida markets /
 * places / events batch.
 *
 * Same law as #1019: two-beat hook only; empty if unsourced; no Book / /go;
 * no Places. Recurring markets are EVENT series, not grocery pins. Farmer's
 * Milk + both #1019 Frog Ponds stay already-in. North Redington Beach is the
 * one new Atlas card (official ChIJ). Asserted on the CALL (chipIdentity /
 * toHookLine / isUsableCardHook) and on the batch JSON.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chipIdentity } from "../lib/chipIdentity.js";
import { toHookLine, isUsableCardHook } from "../lib/editorialHook.js";
import { listPublishReadyAtlasIds } from "../lib/atlasPlaceAllowlist.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const batch = JSON.parse(readFileSync(join(ROOT, "data/atlas/owner-batch-2026-08-29e.json"), "utf8"));
const cards = JSON.parse(readFileSync(join(ROOT, "data/atlas/editorial-cards.json"), "utf8"));
const ingest = readFileSync(join(ROOT, "scripts/ingest-verified-2026-08-29e.mjs"), "utf8");
const notes = readFileSync(join(ROOT, "data/atlas/HOLD-2026-08-29e.md"), "utf8");
const byId = new Map(cards.filter((c) => c && c.placeId).map((c) => [c.placeId, c]));

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

ok(ADD.length === 1 && ADD[0].key === "frogPondNrb",
  `expected 1 ADD pin (Frog Pond NRB), got ${ADD.length}`);
ok(ALREADY.length === 3 &&
   ALREADY.some((p) => /Farmer'?s Milk/i.test(p.name)) &&
   ALREADY.some((p) => /Frog Pond SPB/i.test(p.name)) &&
   ALREADY.some((p) => /Frog Pond Downtown/i.test(p.name)),
  "Farmer's Milk + both #1019 Frog Ponds are already-in");
ok(HOLD_GOOGLE.length === 5, `expected 5 hold_google_id shops, got ${HOLD_GOOGLE.length}`);
ok(HOLD_GOOGLE.every((p) => /Cha Cha Coconuts|ofKors Bakery|ofKors Cafe|Turmeric Indian|Cinnaholic South Tampa/.test(p.name)),
  "hold_google_id names are Cha Cha, ofKors bakery/cafe, Turmeric, Cinnaholic South Tampa");

ok(listPublishReadyAtlasIds().length === 264,
  "Atlas publish-ready lock is 264 — 263 from #1019 plus the official NRB ChIJ");

for (const p of ADD) {
  ok(PLACE_ID.test(p.placeId), `${p.name}: real Google placeId, not invented`);
  const card = byId.get(p.placeId);
  ok(!!card, `${p.name}: missing Atlas card for ${p.placeId}`);
  if (!card) continue;
  ok(card.category === p.wantCategory, `${p.name}: Atlas category ${card.category} ≠ ${p.wantCategory}`);
  ok(card.knownFor === p.knownFor, `${p.name}: Atlas knownFor drifted from the batch`);
  const line = toHookLine(card.knownFor, p.name);
  ok(line.length >= 20, `${p.name}: toHookLine emptied the sourced two-beat (got "${line}")`);
  ok(isUsableCardHook(line, p.name), `${p.name}: two-beat failed isUsableCardHook`);
  ok(!/\b\d{1,2}:\d{2}\b/.test(card.knownFor), `${p.name}: hook dumped a clock`);
  ok(!/\b(?:fl|florida)\s+\d{5}\b/i.test(card.knownFor), `${p.name}: hook dumped a zip`);
  ok(!HOOK_STREET_NUM.test(card.knownFor), `${p.name}: hook dumped a house-number street`);
  ok(!/\/go\b|book tickets|book now/i.test(JSON.stringify(card)),
    `${p.name}: Book / /go leaked onto the card`);
  ok(!/across the street|beach across/i.test([card.knownFor, card.whyGo, card.vibeCheck].join(" ")),
    `${p.name}: invented beach-across-the-street — not on the official page`);
  ok(!/Mad Fish|3rd Ave|Tropicana/i.test(card.knownFor),
    `${p.name}: NRB hook must not steal the SPB or downtown sit`);
  const PERMITTED_HOST = /(?:^|\.)(?:google\.com|googleapis\.com|frogpondrestaurant\.com)$/i;
  for (const u of card.sourceUrls || []) {
    let host = "";
    try { host = new URL(u).hostname.replace(/^www\./, ""); } catch { host = ""; }
    ok(!!host && PERMITTED_HOST.test(host),
      `${p.name}: sourceUrl host "${host}" is not official / Google`);
  }
  const shaped = { name: p.name, types: p.types, primaryType: p.primaryType, primary_type: p.primaryType };
  for (const [cat, sub] of p.chipsKeep) {
    ok(chipIdentity(cat, sub, shaped) === true,
      `${p.name}: chipIdentity FAILED [${cat}:${sub}]`);
  }
  for (const [cat, sub] of p.chipsBlock) {
    ok(chipIdentity(cat, sub, shaped) === false,
      `${p.name}: chipIdentity LEAKED [${cat}:${sub}]`);
  }
}

ok(ADD[0].placeId === "ChIJbyotrqf-wogRJwMPtUFijn8",
  "NRB ChIJ is the official destination_place_id, not a CID conversion");
ok(ADD[0].lat === 27.818198 && ADD[0].lng === -82.8228863 && ADD[0].coordSource === "official-schema",
  "NRB coords are the official schema.org pair — not Places, not a street centroid");
ok(/16909 Gulf/.test(ADD[0].address) && /North Redington Beach/i.test(ADD[0].address),
  "NRB official address is 16909 Gulf Boulevard, North Redington Beach");

for (const p of ALREADY) {
  ok(PLACE_ID.test(p.placeId), `${p.name}: already-in placeId is a real ChIJ`);
  ok(p.knownFor == null, `${p.name}: already-in must not grow a second hook`);
}

ok(byId.has("ChIJYQCTNOCxwogR77eUWAEbqwQ"), "Farmer's Milk card stays on main — do not delete");
ok(byId.has("ChIJcX8K3HADw4gRCgXXlZf5ccY"), "Frog Pond SPB card stays on main — do not delete");
ok(byId.has("ChIJKyxHD4fhwogR1O-zkiFq51o"), "Frog Pond Downtown card stays on main — do not delete");
ok(byId.get("ChIJcX8K3HADw4gRCgXXlZf5ccY").placeId !== ADD[0].placeId,
  "NRB is a third Frog Pond pin — not a rewrite of SPB");

for (const p of HOLD_GOOGLE) {
  ok(p.placeId == null, `${p.name}: invented a Google id — HOLD the id`);
  ok(!PLACE_ID.test(String(p.placeId || "")), `${p.name}: placeId looks like a ChIJ`);
  ok(!cards.some((c) => c && c.name === p.name),
    `${p.name}: leaked an Atlas card without a public ChIJ`);
  ok(typeof p.address === "string" && p.address.trim().length >= 12,
    `${p.name}: official address is the publishable pin`);
  ok(!/\/go\b|book tickets|book now/i.test(JSON.stringify(p)),
    `${p.name}: Book / /go leaked`);
  const shaped = { name: p.name, types: p.types, primaryType: p.primaryType, primary_type: p.primaryType };
  for (const [cat, sub] of p.chipsKeep) {
    ok(chipIdentity(cat, sub, shaped) === true,
      `${p.name}: chipIdentity FAILED [${cat}:${sub}]`);
  }
  for (const [cat, sub] of p.chipsBlock) {
    ok(chipIdentity(cat, sub, shaped) === false,
      `${p.name}: chipIdentity LEAKED [${cat}:${sub}]`);
  }
}

const cha = HOLD_GOOGLE.find((p) => /Cha Cha/i.test(p.name));
ok(cha && /St\. Armands/i.test(cha.address) && !/marina/i.test(cha.address),
  "Cha Cha official pin is St. Armands Circle, not a marina");
ok(cha && cha.lat === 27.319116 && cha.lng === -82.577113 && cha.coordSource === "osm" && cha.osm?.node === 6438891340,
  "Cha Cha uses the named OSM node — not a Places geocode");
const chaLine = toHookLine(cha.knownFor, cha.name);
ok(chaLine.length >= 20 && isUsableCardHook(chaLine, cha.name),
  "Cha Cha two-beat is tropical drinks + the Circle sidewalk");

const bakery = HOLD_GOOGLE.find((p) => p.name === "ofKors Bakery");
ok(bakery && /1359 Main/i.test(bakery.address) && bakery.knownFor == null,
  "ofKors Bakery is 1359 Main; hook EMPTY (viral desserts unsourced)");
ok(bakery && bakery.osm?.way === 142122718 && bakery.lat === 27.336159,
  "ofKors Bakery records the named OSM way — not a street centroid");
ok(toHookLine(bakery.knownFor, bakery.name) === "",
  "ofKors Bakery toHookLine stays empty");

const cafe = HOLD_GOOGLE.find((p) => p.name === "ofKors Cafe");
ok(cafe && /1989 Main/i.test(cafe.address) && cafe.knownFor == null && cafe.lat == null,
  "ofKors Cafe is 1989 Main; no invented lat; hook EMPTY");
ok(cafe && cafe.address !== bakery.address,
  "ofKors Cafe is not the bakery pin");

const turmeric = HOLD_GOOGLE.find((p) => /Turmeric/i.test(p.name));
ok(turmeric && /1001 Cocoanut/i.test(turmeric.address),
  "Turmeric official address is 1001 Cocoanut Ave");
ok(turmeric && !/reviewers keep coming back|voted number 1/i.test([turmeric.knownFor, turmeric.whyGo].join(" ")),
  "Turmeric hook refuses anonymous reviewers and the unnamed Number 1 vote");
const turLine = toHookLine(turmeric.knownFor, turmeric.name);
ok(turLine.length >= 20 && isUsableCardHook(turLine, turmeric.name) && /three floors/i.test(turLine),
  "Turmeric two-beat is official three floors + Cocoanut Avenue");
ok(turmeric && turmeric.lat == null && turmeric.lng == null,
  "Turmeric does not invent lat/lng — no named OSM");

const cinna = HOLD_GOOGLE.find((p) => /Cinnaholic/i.test(p.name));
ok(cinna && /927 S Howard/i.test(cinna.address) && /33606/.test(cinna.address),
  "Cinnaholic is the official South Tampa Howard Ave shop");
ok(cinna && !/4th Street|St\. Petersburg/i.test(cinna.address),
  "Cinnaholic is not the St. Petersburg franchise");
ok(cinna && cinna.lat == null,
  "Cinnaholic does not use the unnamed OSM house geocode");
const cinLine = toHookLine(cinna.knownFor, cinna.name);
ok(cinLine.length >= 20 && isUsableCardHook(cinLine, cinna.name) && /plant-based/i.test(cinLine),
  "Cinnaholic two-beat is official plant-based rolls + South Tampa");

for (const h of HOLDS) {
  const stem = h.name.split(",")[0].toLowerCase().replace(/[^a-z0-9 #]/g, "").slice(0, 18);
  if (/#1024|#1025|#1026|actually worth|hidden gems|727living|rays at trop|hispanic heritage|red bull dance your style sep 16|anna maria/i.test(h.name)) continue;
  if (/frog pond|farmer/i.test(h.name)) continue;
  ok(!cards.some((c) => c && c.name && stem.length >= 8 && c.name.toLowerCase().includes(stem.trim())),
    `HOLD ${h.name} leaked into editorial-cards.json`);
}

ok(HOLDS.some((h) => /Sarasota Farmers Market/i.test(h.name) && /HOLD_EVENT_SERIES/.test(h.status)),
  "Sarasota Farmers Market is a weekly series HOLD, not a grocery pin");
ok(HOLDS.some((h) => /Detwiler/i.test(h.name) && /which location|do not pick/i.test(h.note)),
  "Detwiler's is HOLD until the owner names which store");
ok(HOLDS.some((h) => /Swamp Puppy/i.test(h.name) && /mobile/i.test(h.note)),
  "Swamp Puppy is a mobile HOLD");
ok(HOLDS.some((h) => /Anna Maria Island/i.test(h.name) && /destination/i.test(h.note)),
  "Anna Maria Island is a destination HOLD, not one card");
ok(HOLDS.some((h) => /Cross Creek Gourmet/i.test(h.name) && /500|official site/i.test(h.note)),
  "Cross Creek Gourmet HOLDs the down official site and the unsourced 20-year claim");
ok(HOLDS.some((h) => /Lumley/i.test(h.name)), "Lumley's Fall Festival is HOLD for dates");
ok(HOLDS.some((h) => /73.? Flea/i.test(h.name)), "73° Flea is HOLD");
ok(HOLDS.some((h) => /Big Bend/i.test(h.name)), "Big Bend Market is HOLD for next date");
ok(HOLDS.some((h) => /Night Market Sep 2/i.test(h.name) && /ALREADY_ON_MAIN/.test(h.status)),
  "Night Market Sep 2 is already-on-main, not rewritten");
ok(HOLDS.some((h) => /Sep 16/i.test(h.name) && /Sep 19/.test(h.note)),
  "Red Bull Sep 16 is HOLD; official date is Sep 19");
ok(HOLDS.some((h) => /Rays/i.test(h.name) && /11–13|11-13/.test(h.note)),
  "Rays HOLD lists official home nights without inventing promos");
ok(HOLDS.some((h) => /Actually Worth Eating|Hidden Gems/i.test(h.name) && /no new home chips/i.test(h.note)),
  "no new home chips");

const marketSeries = [
  ["hyde-park-fresh-market", 4, "2026-09-06"],
  ["carrollwood-market", 4, "2026-09-12"],
  ["seminole-heights-sunday-market", 4, "2026-09-13"],
  ["water-street-sunday-market", 4, "2026-09-20"],
  ["sunshine-market-midtown", 4, "2026-09-26"],
  ["westshore-marina-sunday-market", 4, "2026-09-27"],
  ["sunset-market-midtown", 4, "2026-09-03"],
  ["grand-central-3rd-thursday", 4, "2026-09-17"],
];
for (const [id, count, first] of marketSeries) {
  const rows = EVENTS.filter((e) => e.event_series_id === id);
  ok(rows.length === count, `${id}: expected ${count} remaining-2026 rows, got ${rows.length}`);
  ok(rows.every((e) => e.start_date === e.end_date), `${id}: each row is one calendar day`);
  ok(rows.some((e) => e.start_date === first), `${id}: includes ${first}`);
  ok(rows.every((e) => e.place_id == null), `${id}: does not invent a market ChIJ`);
}

const smm = EVENTS.filter((e) => e.event_series_id === "saturday-morning-market");
ok(smm.length === 1 && smm[0].start_date === "2026-10-03",
  "Saturday Morning Market is the official Oct 3 Al Lang return, not a September pin");
ok(smm[0] && /230 1st SE/i.test(smm[0].address) && /Al Lang/i.test(smm[0].venue),
  "SMM Oct 3 venue is official Al Lang / 230 1st SE");
ok(!EVENTS.some((e) => e.event_series_id === "saturday-morning-market" && /2026-09/.test(e.start_date)),
  "SMM has no September rows — official closed all September");

const nights = EVENTS.filter((e) => /st-pete-night-market/.test(e.event_id) || /st-pete-night-market/.test(e.event_series_id));
ok(nights.length === 0, "this batch does not rewrite #1019 Night Market rows");

const pumpkin = EVENTS.filter((e) => e.event_series_id === "bryer-patch-pumpkin-festival");
ok(pumpkin.length === 2 && pumpkin.every((e) => e.start_date === e.end_date),
  "Bryer Patch is two dated days, not a lying Oct 10–11 range");
ok(["2026-10-10", "2026-10-11"].every((d) => pumpkin.some((e) => e.start_date === d)),
  "Bryer Patch dates are the official Oct 10 and 11 2026");
ok(pumpkin.every((e) => /5700 SW 250th/i.test(e.address) && e.city === "Newberry"),
  "Bryer Patch address is the official directions-page street in Newberry");
ok(pumpkin.every((e) => e.place_id == null && e.start_time == null),
  "Bryer Patch does not invent a ChIJ or unsourced public clocks");
ok(pumpkin.every((e) => /4th-generation|4th generation/i.test(e.card_hook) && /Boyd Farm/i.test(e.card_hook)),
  "Bryer Patch hook keeps 4th-generation + Boyd Farm");

const mega = EVENTS.find((e) => e.event_id === "mega-night-market-hollywood-2026-09-27");
ok(!!mega && mega.start_date === "2026-09-27" && /Seminole Classic Casino/i.test(mega.venue),
  "Mega Night Market is official Sep 27 at Seminole Classic Casino Hollywood");
ok(mega && mega.start_time == null && !/no admission|free admission/i.test(mega.card_hook),
  "Mega Night Market omits unsourced 11am–9pm and no-admission");

const redbull = EVENTS.find((e) => e.event_id === "red-bull-dance-your-style-2026-09-19");
ok(!!redbull && redbull.start_date === "2026-09-19" && /Tampa Convention Center/i.test(redbull.venue),
  "Red Bull official date is Sep 19 at Tampa Convention Center, not Sep 16");
ok(!EVENTS.some((e) => e.start_date === "2026-09-16" && /red bull/i.test(e.event_name)),
  "no live Red Bull row on the screenshot's Sep 16");

const lbt = EVENTS.find((e) => e.event_id === "little-big-town-mahaffey-2026-09-24");
ok(!!lbt && lbt.start_date === "2026-09-24" && /For The Art Of It/i.test(lbt.card_hook),
  "Little Big Town is the official Mahaffey For The Art Of It night");
ok(lbt && !/hispanic heritage/i.test(JSON.stringify(lbt)),
  "Little Big Town does not invent Hispanic Heritage night");

const gecko = EVENTS.find((e) => e.event_id === "gulfport-geckofest-2026-09-05");
ok(!!gecko && gecko.start_date === "2026-09-05" && /complimentary admission/i.test(gecko.card_hook),
  "GeckoFest keeps official complimentary admission + Beach Boulevard");

for (const e of EVENTS) {
  ok(["scheduled", "sold_out"].includes(e.event_status), `${e.event_id}: displayable status`);
  ok(e.source_tier && e.source_tier <= 4, `${e.event_id}: source_tier must date an event`);
  ok(e.verification_confidence && e.verification_confidence !== "low", `${e.event_id}: confidence`);
  ok(e.card_hook && e.city, `${e.event_id}: a card with no hook is a calendar row`);
  ok(!/\/go\b|book now/i.test(JSON.stringify(e)), `${e.event_id}: Book / /go leaked`);
  ok(!/\b(?:fl|florida)\s+\d{5}\b/i.test(e.card_hook), `${e.event_id}: hook dumped a zip`);
}

ok(ingest.includes("ChIJbyotrqf-wogRJwMPtUFijn8"),
  "ingest pins the official NRB ChIJ");
ok(/Farmer'?s Milk/.test(ingest) && /Frog Pond SPB/.test(ingest) && /Frog Pond Downtown/.test(ingest),
  "ingest names the three already-in #1019 pins");
ok(/Cha Cha Coconuts/.test(ingest) && /ofKors/.test(ingest) && /Turmeric/.test(ingest) && /Cinnaholic/.test(ingest),
  "ingest names the hold_google_id shops");
ok(/Detwiler/.test(ingest) && /Swamp Puppy/.test(ingest) && /Anna Maria Island/.test(ingest),
  "ingest HOLDs Detwiler's / Swamp Puppy / AMI");
ok(/places\.googleapis\.com/.test(ingest) === false && !/\bsearchText\s*\(/.test(ingest),
  "ingest is fail-closed — no Places host and no searchText()");
ok(!/app\/home\.js|IconicPlaceCard|app\/globals/.test(ingest),
  "ingest does not touch homepage JS, IconicPlaceCard, or CSS");

ok(/Frog Pond North Redington Beach/.test(notes) && /ChIJbyotrqf-wogRJwMPtUFijn8/.test(notes),
  "HOLD notes name the official NRB ChIJ");
ok(/ALREADY ON MAIN/.test(notes) && /Farmer'?s Milk/.test(notes),
  "HOLD notes mark Farmer's Milk + #1019 Frog Ponds already-on-main");
ok(/Sarasota Farmers Market/.test(notes) && /1 N Lemon/.test(notes),
  "HOLD notes keep the official Saturday Main & Lemon series");
ok(/CLOSED all September|closed all September/i.test(notes) && /230 1st SE/.test(notes),
  "HOLD notes keep Saturday Morning Market Sep closed + Oct 3 Al Lang");
ok(/3659 Midtown/.test(notes) && /4900 Bridge/.test(notes),
  "HOLD notes keep official Midtown 3659 and Westshore 4900 Bridge");
ok(/Detwiler/.test(notes) && /six stores|Palmer/.test(notes),
  "HOLD notes refuse a random Detwiler's");
ok(/Swamp Puppy/.test(notes) && /Bake.?n Babes/.test(notes),
  "HOLD notes keep Swamp Puppy mobile and omit the unsourced collab");
ok(/Lumley/.test(notes) && /73/.test(notes) && /Big Bend/.test(notes),
  "HOLD notes name Lumley's / 73° Flea / Big Bend");
ok(/Sep 19/.test(notes) && /not Sep 16/.test(notes),
  "HOLD notes correct Red Bull to official Sep 19");
ok(/Hispanic Heritage/.test(notes) && /omitted|not on the venue/i.test(notes),
  "HOLD notes omit unsourced Hispanic Heritage night");
ok(/Actually Worth Eating|Hidden Gems/.test(notes) && /no new/i.test(notes),
  "HOLD notes refuse new home chips");
ok(/places\.googleapis\.com|Places API/.test(notes) && /not called|never called|ZERO/i.test(notes),
  "HOLD notes state Places was not called");
ok(/what would unblock|Maps share URL/i.test(notes),
  "HOLD notes say what would unblock each ChIJ");

ok(chipIdentity("attractions", "beaches", {
  name: "The Frog Pond North Redington Beach", types: ["beach"], primaryType: "beach", primary_type: "beach",
}) === true,
  "control: a beach primary WOULD pass Beaches — that is why NRB uses breakfast types");
ok(chipIdentity("attractions", "beaches", {
  name: "The Frog Pond North Redington Beach",
  types: ["breakfast_restaurant", "brunch_restaurant", "restaurant"],
  primaryType: "breakfast_restaurant", primary_type: "breakfast_restaurant",
}) === false, "the shipped NRB types must fail Activities → Beaches");

if (fail.length) {
  console.error("test-owner-places-2026-08-29e: FAIL");
  for (const m of fail) console.error("  - " + m);
  process.exit(1);
}
console.log(`test-owner-places-2026-08-29e: OK — ${n} assertions; ${ADD.length} Atlas cards; ${ALREADY.length} already-in; ${HOLD_GOOGLE.length} google-id holds; ${HOLDS.length} HOLDs; ${EVENTS.length} events`);
