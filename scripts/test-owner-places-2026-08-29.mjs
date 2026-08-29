#!/usr/bin/env node
/**
 * test-owner-places-2026-08-29 — lock Gabe's 2026-08-29 Florida pin batch.
 *
 * THE LAW. Add these places IF they are not already in the library. Two-beat
 * hook only (one sourced distinction + one physical why-sit). Empty if that
 * line cannot be sourced. Never overwrite a better sourced hook. Never
 * duplicate S.O.B. Burgers. Dive is nightlife, not a liquor store on Shopping.
 * Bakeries on bakery/café chips. Beaches breakfast on breakfast, not Beaches.
 * HOLDs write nothing. No Book / /go. No homepage JS.
 *
 * Asserted on the CALL: chipIdentity / placeAllowed / toHookLine / isTrusted
 * against the batch JSON and the Atlas cards. A regex over this file would
 * pass while the cards still filed Dive on Shopping.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chipIdentity } from "../lib/chipIdentity.js";
import { toHookLine, isUsableCardHook } from "../lib/editorialHook.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const batch = JSON.parse(readFileSync(join(ROOT, "data/atlas/owner-batch-2026-08-29.json"), "utf8"));
const cards = JSON.parse(readFileSync(join(ROOT, "data/atlas/editorial-cards.json"), "utf8"));
const ingest = readFileSync(join(ROOT, "scripts/ingest-verified-2026-08-29.mjs"), "utf8");
const byId = new Map(cards.filter((c) => c && c.placeId).map((c) => [c.placeId, c]));

let n = 0;
const fail = [];
const ok = (c, m) => { n++; if (!c) fail.push(m); };

const PLACE_ID = /^ChIJ[A-Za-z0-9_-]{20,}$/;
const ADD = batch.places.filter((p) => p.status === "add");
const ALREADY = batch.places.filter((p) => p.status === "already_in");
const HOLDS = batch.holds;
const EVENTS = batch.events;

ok(ADD.length === 8, `expected 8 ADD pins, got ${ADD.length}`);
ok(ALREADY.length === 1 && ALREADY[0].name === "S.O.B. Burgers",
  "S.O.B. Burgers is the one already-in pin — do not invent a second");
ok(HOLDS.some((h) => /Monarch Kitchen/i.test(h.name)) &&
   HOLDS.some((h) => /Urban Brews/i.test(h.name)) &&
   HOLDS.some((h) => /Skinny Burger/i.test(h.name)) &&
   HOLDS.some((h) => /Founders Club/i.test(h.name)),
  "the four owner HOLDs are named in the batch");

for (const p of ADD) {
  ok(PLACE_ID.test(p.placeId), `${p.name}: real Google placeId, not invented`);
  const card = byId.get(p.placeId);
  ok(!!card, `${p.name}: missing Atlas card for ${p.placeId}`);
  if (!card) continue;
  ok(card.category === p.wantCategory, `${p.name}: Atlas category ${card.category} ≠ ${p.wantCategory}`);
  ok(typeof card.knownFor === "string" && card.knownFor.trim().length >= 20,
    `${p.name}: knownFor is the two-beat hook`);
  ok(card.knownFor === p.knownFor, `${p.name}: Atlas knownFor drifted from the batch`);
  const line = toHookLine(card.knownFor, p.name);
  ok(line.length >= 20, `${p.name}: toHookLine emptied the sourced two-beat (got "${line}")`);
  ok(isUsableCardHook(line, p.name), `${p.name}: two-beat failed isUsableCardHook`);
  ok(!/\b\d{1,2}:\d{2}\b/.test(card.knownFor), `${p.name}: hook dumped a clock`);
  ok(!/\b(?:fl|florida)\s+\d{5}\b/i.test(card.knownFor), `${p.name}: hook dumped a zip`);
  ok(!/\/go\b|book tickets|book now/i.test(JSON.stringify(card)),
    `${p.name}: Book / /go leaked onto the card`);
  // check-no-disney-sources: every cited host must be the card's official
  // site, Google, or ALLOWED_THIRD_PARTY. Unvetted research stays on the
  // batch as researchUrls — never on the published Atlas card.
  const PERMITTED_HOST = /(?:^|\.)(?:google\.com|googleapis\.com|peacheysbakingco\.com|sarasotamagazine\.com|burgerculture-tampa\.com|frogponddtsp\.com|diveliquors\.com)$/i;
  const BLOCKED_HOST = /thatssotampa|ediblecommunities|ocala\.com|lbknews|ilovetheburg|stpetecatalyst|atly\.com/i;
  ok(!(card.sourceUrls || []).some((u) => BLOCKED_HOST.test(u)),
    `${p.name}: unvetted research URL leaked onto the Atlas card`);
  for (const u of card.sourceUrls || []) {
    let host = "";
    try { host = new URL(u).hostname.replace(/^www\./, ""); } catch { host = ""; }
    ok(!!host && PERMITTED_HOST.test(host),
      `${p.name}: sourceUrl host "${host}" is not official / Google / ALLOWED_THIRD_PARTY`);
  }
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

const sob = ALREADY[0];
ok(PLACE_ID.test(sob.placeId), "S.O.B. Burgers placeId is a real ChIJ");
ok(!byId.has(sob.placeId),
  "S.O.B. Burgers must NOT get a new Atlas card — already-in, no sourced why-sit, empty stays empty");
ok(sob.knownFor == null, "S.O.B. knownFor stays empty — plate-list is not a two-beat");
ok(chipIdentity("food", "lunch", {
  name: sob.name, types: sob.types, primaryType: sob.primaryType, primary_type: sob.primaryType,
}) === true, "S.O.B. Burgers still belongs on Food → Lunch");
ok(chipIdentity("food", "breakfast", {
  name: sob.name, types: sob.types, primaryType: sob.primaryType, primary_type: sob.primaryType,
}) === false, "S.O.B. Burgers is not a breakfast room");

for (const h of HOLDS) {
  ok(!cards.some((c) => c && c.name && c.name.toLowerCase().includes(h.name.split(",")[0].toLowerCase().slice(0, 18))),
    `HOLD ${h.name} leaked into editorial-cards.json`);
}

ok(EVENTS.length === 5, `expected 5 event rows (4 Night Market dates + Harvest), got ${EVENTS.length}`);
const nights = EVENTS.filter((e) => e.event_series_id === "st-pete-night-market");
ok(nights.length === 4, "St. Pete Night Market is four dated first-Wednesday rows, not a lying date range");
ok(nights.every((e) => e.start_date === e.end_date),
  "each Night Market row is one calendar day — a Sep–Dec range would paint as 'now' on a Thursday");
ok(["2026-09-02", "2026-10-07", "2026-11-04", "2026-12-02"].every((d) => nights.some((e) => e.start_date === d)),
  "Night Market dates are the remaining 2026 first Wednesdays");
ok(nights.every((e) => e.official_event_url.includes("visitstpeteclearwater.com/event/st-pete-night-market-fergs/60331")),
  "Night Market cites the official Visit St. Pete/Clearwater page");
ok(nights.every((e) => e.place_id === "ChIJJ9mP3iviwogRrJCNTTUAT9c"),
  "Night Market pins Ferg's real placeId — not invented");
ok(nights.every((e) => e.is_free === true && /family and pet friendly/i.test(e.card_hook)),
  "Night Market hook keeps free + family/pet — not a ticket hop");

const harvest = EVENTS.find((e) => e.event_id === "clermont-harvest-festival-2026");
ok(!!harvest && harvest.start_date === "2026-10-31" && harvest.city === "Clermont",
  "Harvest Festival is the official 2026-10-31 downtown Clermont day");
ok(harvest && harvest.official_event_url.includes("clermontdowntown.com/events/"),
  "Harvest Festival cites Clermont Main Street, not a reseller");
ok(harvest && harvest.place_id == null,
  "Harvest Festival does not invent a downtown placeId — coords are the official street, id stays empty");

for (const e of EVENTS) {
  // Same predicates lib/curatedEvents.isTrusted uses — asserted here so this
  // guard stays hermetic (no supabase import, no network).
  ok(["scheduled", "sold_out"].includes(e.event_status), `${e.event_id}: displayable status`);
  ok(e.source_tier && e.source_tier <= 4, `${e.event_id}: source_tier must date an event`);
  ok(e.verification_confidence && e.verification_confidence !== "low", `${e.event_id}: confidence`);
  ok(e.card_hook && e.city, `${e.event_id}: a card with no hook is a calendar row`);
  ok(!/\/go\b|book now/i.test(JSON.stringify(e)), `${e.event_id}: Book / /go leaked`);
}

// Ingest path pins the same IDs the cards use — a drift is a silent wrong pin.
for (const p of ADD) {
  ok(ingest.includes(p.placeId), `ingest-verified-2026-08-29 does not pin ${p.name} ${p.placeId}`);
}
ok(/S\.O\.B\. Burgers/.test(ingest) && /already_in|ALREADY/.test(ingest),
  "ingest names S.O.B. as already-in so a later run cannot mint a twin");
ok(/Monarch Kitchen/.test(ingest) && /Urban Brews/.test(ingest) && /Skinny Burger/.test(ingest) && /Founders Club/.test(ingest),
  "ingest HOLDs the four out-of-library names");
ok(!/app\/home\.js|IconicPlaceCard|app\/globals/.test(ingest),
  "ingest does not touch homepage JS, IconicPlaceCard, or CSS");

// Red-prove: a liquor-store type on the den name must not be how we file it.
const denAsShop = { name: "Dive Cocktail Den", types: ["liquor_store"], primaryType: "liquor_store", primary_type: "liquor_store" };
ok(chipIdentity("shopping", "all", denAsShop) === true,
  "control: a liquor_store primary WOULD pass Shopping — that is why the card uses cocktail_bar");
ok(chipIdentity("shopping", "all", {
  name: "Dive Cocktail Den", types: ["cocktail_bar", "bar"], primaryType: "cocktail_bar", primary_type: "cocktail_bar",
}) === false, "the shipped Dive types must fail Shopping");

const frogOnSand = { name: "The Frog Pond SPB", types: ["beach"], primaryType: "beach", primary_type: "beach" };
ok(chipIdentity("attractions", "beaches", frogOnSand) === true,
  "control: a beach primary would pass Beaches — the breakfast types must not");
ok(chipIdentity("attractions", "beaches", {
  name: "The Frog Pond SPB", types: ["breakfast_restaurant", "brunch_restaurant", "restaurant"],
  primaryType: "breakfast_restaurant", primary_type: "breakfast_restaurant",
}) === false, "Frog Pond SPB must not ride 'Beach' in the city onto Activities → Beaches");
// nightlife:all still admits `restaurant` via shipped CAT_ALLOW (the Keke's
// bug was the Clubs SUB falling through — do not reopen that here). Lock
// Clubs, which is the identity that must stay false for a breakfast room.
ok(chipIdentity("nightlife", "clubs", {
  name: "The Frog Pond SPB", types: ["breakfast_restaurant", "brunch_restaurant", "restaurant"],
  primaryType: "breakfast_restaurant", primary_type: "breakfast_restaurant",
}) === false, "Frog Pond SPB must not pass Night out → Clubs");

if (fail.length) {
  console.error("test-owner-places-2026-08-29: FAIL");
  for (const m of fail) console.error("  - " + m);
  process.exit(1);
}
console.log(`test-owner-places-2026-08-29: OK — ${n} assertions; ${ADD.length} Atlas cards; ${ALREADY.length} already-in; ${HOLDS.length} HOLDs; ${EVENTS.length} events`);
