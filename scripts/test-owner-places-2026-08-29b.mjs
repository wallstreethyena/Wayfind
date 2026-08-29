#!/usr/bin/env node
/**
 * test-owner-places-2026-08-29b — lock Gabe's second 2026-08-29 Florida pin batch.
 *
 * Same law as #1019: two-beat hook only; empty if unsourced; no Book / /go;
 * no Places. This batch has no public ChIJ, so there are ZERO Atlas cards.
 * hold_google_id rows keep official addresses + sourced hooks. HOLDs write
 * nothing. Asserted on the CALL (chipIdentity / toHookLine / isUsableCardHook)
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
const batch = JSON.parse(readFileSync(join(ROOT, "data/atlas/owner-batch-2026-08-29b.json"), "utf8"));
const cards = JSON.parse(readFileSync(join(ROOT, "data/atlas/editorial-cards.json"), "utf8"));
const ingest = readFileSync(join(ROOT, "scripts/ingest-verified-2026-08-29b.mjs"), "utf8");
const notes = readFileSync(join(ROOT, "data/atlas/HOLD-2026-08-29b.md"), "utf8");

let n = 0;
const fail = [];
const ok = (c, m) => { n++; if (!c) fail.push(m); };

const PLACE_ID = /^ChIJ[A-Za-z0-9_-]{20,}$/;
// House-number + street in a hook is the address restatement the house bar forbids.
const HOOK_STREET_NUM = /\b\d{3,6}\s+(?:[nsew]\.?\s+)?[A-Za-z]/;
const ADD = batch.places.filter((p) => p.status === "add");
const ALREADY = batch.places.filter((p) => p.status === "already_in");
const HOLD_GOOGLE = batch.places.filter((p) => p.status === "hold_google_id");
const HOLDS = batch.holds;
const EVENTS = batch.events;

ok(ADD.length === 0, `this batch has no public ChIJ — expected 0 ADD pins, got ${ADD.length}`);
ok(ALREADY.length === 0, "no already-in rows on this batch");
ok(HOLD_GOOGLE.length === 9, `expected 9 hold_google_id rows, got ${HOLD_GOOGLE.length}`);
ok(HOLD_GOOGLE.every((p) => /SoFresh Lakewood Ranch|Mobius Sarasota|Icy-N-Spicy|Belladukes Gourmet Market|Chicken Guy Cypress Creek|La Birra Bar Coral Gables|Canelita Cheesecake Coral Gables|Canelita Cheesecake Miami|Divilma Clermont/.test(p.name)),
  "the nine hold_google_id names are the intended ADD list");
ok(HOLDS.some((h) => /SoFresh Bradenton/i.test(h.name)) &&
   HOLDS.some((h) => /Dirty Sara-Soda/i.test(h.name)) &&
   HOLDS.some((h) => /Happy Hands World/i.test(h.name)) &&
   HOLDS.some((h) => /Sloan'?s Ice Cream/i.test(h.name)) &&
   HOLDS.some((h) => /Divilma Orlando/i.test(h.name)) &&
   HOLDS.some((h) => /Meacham Urban Farm/i.test(h.name)) &&
   HOLDS.some((h) => /Dancing Goat Dairy/i.test(h.name)) &&
   HOLDS.some((h) => /Fat Beet Farm/i.test(h.name)),
  "COMING_SOON / mobile / planned HOLDs plus the three still-held Tampa farms are named");

ok(listPublishReadyAtlasIds().length === 263,
  "Atlas publish-ready lock stays 263 — this batch must not mint cards without a public ChIJ");

for (const p of HOLD_GOOGLE) {
  ok(p.placeId == null, `${p.name}: invented a Google id — HOLD the id, do not mint a ChIJ`);
  ok(!PLACE_ID.test(String(p.placeId || "")), `${p.name}: placeId looks like a ChIJ`);
  ok(!cards.some((c) => c && c.name === p.name),
    `${p.name}: leaked an Atlas card without a public ChIJ`);
  ok(typeof p.address === "string" && p.address.trim().length >= 12,
    `${p.name}: official address is the publishable pin`);
  ok(typeof p.knownFor === "string" && p.knownFor.trim().length >= 20,
    `${p.name}: two-beat is sourced on the batch even while the Google id is held`);
  const line = toHookLine(p.knownFor, p.name);
  ok(line.length >= 20, `${p.name}: toHookLine emptied the sourced two-beat (got "${line}")`);
  ok(isUsableCardHook(line, p.name), `${p.name}: two-beat failed isUsableCardHook`);
  ok(!/\b\d{1,2}:\d{2}\b/.test(p.knownFor), `${p.name}: hook dumped a clock`);
  ok(!/\b(?:fl|florida)\s+\d{5}\b/i.test(p.knownFor), `${p.name}: hook dumped a zip`);
  ok(!HOOK_STREET_NUM.test(p.knownFor), `${p.name}: hook dumped a house-number street`);
  ok(!/\/go\b|book tickets|book now/i.test(JSON.stringify(p)),
    `${p.name}: Book / /go leaked`);
  ok(!/espresso frosty/i.test([p.knownFor, p.whyGo].join(" ")),
    `${p.name}: invented Espresso Frosty`);
  ok(!/dubai/i.test([p.knownFor, p.whyGo].join(" ")),
    `${p.name}: Dubai 2026 leaked into the hook — official page did not print it`);
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

const sofresh = HOLD_GOOGLE.find((p) => /SoFresh Lakewood Ranch/i.test(p.name));
ok(sofresh && sofresh.lat === 27.434089 && sofresh.lng === -82.426148 && sofresh.coordSource === "official-maps-embed",
  "SoFresh LWR uses the official Maps-embed ll= — not a Places geocode");
ok(sofresh && sofresh.officialMapsCid === "12960599191770957252",
  "SoFresh LWR records the official embed CID and does not promote it to a ChIJ");
ok(sofresh && /olive oil/i.test(sofresh.knownFor) && /Fresh Market Plaza/i.test(sofresh.knownFor),
  "SoFresh LWR two-beat is cooked-to-order olive oil + Fresh Market Plaza");

const mobius = HOLD_GOOGLE.find((p) => /Mobius/i.test(p.name));
ok(mobius && mobius.lat == null && mobius.lng == null,
  "Mobius does not invent lat/lng — OSM had no named pin");
ok(mobius && /thrift/i.test(mobius.knownFor) && /Whitfield Park/i.test(mobius.knownFor),
  "Mobius two-beat keeps curated thrift + the warehouse suite");
ok(mobius && chipIdentity("food", "all", {
  name: mobius.name, types: mobius.types, primaryType: mobius.primaryType, primary_type: mobius.primaryType,
}) === false, "Mobius must not file on Food");

const icy = HOLD_GOOGLE.find((p) => /Icy-N-Spicy/i.test(p.name));
ok(icy && icy.lat == null && icy.lng == null,
  "Icy-N-Spicy does not use the OSM house geocode as the shop pin");
ok(icy && /family dessert/i.test(icy.knownFor) && /Building E/i.test(icy.knownFor),
  "Icy-N-Spicy two-beat is family dessert + Miramar Pkwy Bldg E");

const bella = HOLD_GOOGLE.find((p) => /Belladukes/i.test(p.name));
ok(bella && bella.lat === 26.3515972 && bella.lng === -80.0848375 && bella.coordSource === "osm",
  "Belladukes uses the OSM named pin — not a Places geocode");
ok(bella && bella.osm && bella.osm.node === 11466075111,
  "Belladukes records OSM node 11466075111");
ok(bella && /gourmet market/i.test(bella.knownFor) && /East Boca Raton Road/i.test(bella.knownFor),
  "Belladukes two-beat is gourmet market + East Boca Raton Road");
ok(bella && !/espresso frosty/i.test([bella.knownFor, bella.whyGo].join(" ")),
  "Belladukes hook does not invent Espresso Frosty");

const guy = HOLD_GOOGLE.find((p) => /Chicken Guy/i.test(p.name));
ok(guy && guy.lat == null && guy.lng == null,
  "Chicken Guy does not steal the Hyatt Place OSM pin");
ok(guy && /Guy Fieri/i.test(guy.knownFor) && /Tampa Premium Outlets/i.test(guy.knownFor),
  "Chicken Guy two-beat is Guy Fieri tenders + across from Tampa Premium Outlets");

const birra = HOLD_GOOGLE.find((p) => /La Birra/i.test(p.name));
ok(birra && birra.lat == null && birra.lng == null,
  "La Birra does not use the 219 Miracle Mile house-number node as the restaurant pin");
ok(birra && /world-champion burger/i.test(birra.knownFor) && /Miracle Mile/i.test(birra.knownFor),
  "La Birra two-beat is the official world-champion line + Miracle Mile");
ok(birra && !/dubai/i.test(birra.knownFor + birra.whyGo),
  "La Birra omits Dubai 2026 — not on the official page");

const canGables = HOLD_GOOGLE.find((p) => /Canelita Cheesecake Coral Gables/i.test(p.name));
const canMiami = HOLD_GOOGLE.find((p) => /Canelita Cheesecake Miami/i.test(p.name));
ok(canGables && canMiami && canGables.address !== canMiami.address,
  "Canelita is two place rows — Miracle Mile and North Miami Avenue do not collapse");
ok(canGables && /gluten-free Basque/i.test(canGables.knownFor) && /Miracle Mile/i.test(canGables.knownFor),
  "Canelita Gables two-beat is gluten-free Basque + Miracle Mile");
ok(canMiami && /gluten-free Basque/i.test(canMiami.knownFor) && /North Miami Avenue/i.test(canMiami.knownFor),
  "Canelita Miami two-beat is gluten-free Basque + North Miami Avenue");
ok(canMiami && canMiami.lat == null && canMiami.lng == null,
  "Canelita Miami does not steal the Doughnut Break OSM pin at 1653 N Miami Ave");

const divilma = HOLD_GOOGLE.find((p) => /Divilma Clermont/i.test(p.name));
ok(divilma && /pistachio/i.test(divilma.knownFor) && /blueberry/i.test(divilma.knownFor) && /Biscoff/i.test(divilma.knownFor),
  "Divilma two-beat keeps pistachio / blueberry / Biscoff from the official menu");
ok(divilma && /Clermont shop/i.test(divilma.knownFor),
  "Divilma why-sit is the Clermont shop, not a plate list alone");
ok(divilma && divilma.lat == null && divilma.lng == null,
  "Divilma does not steal Cookie Queen / florist OSM pins at 639 8th St");

for (const h of HOLDS) {
  const stem = h.name.split(",")[0].toLowerCase().slice(0, 18);
  ok(!cards.some((c) => c && c.name && c.name.toLowerCase().includes(stem)),
    `HOLD ${h.name} leaked into editorial-cards.json`);
}

ok(EVENTS.length === 0, `this batch has no events, got ${EVENTS.length}`);

ok(/PINNED_IDS = \{\}/.test(ingest) || /export const PINNED_IDS = \{\}/.test(ingest),
  "ingest pins an empty ChIJ map — a minted id would be PINNED_IDS drift");
ok(/SoFresh Lakewood Ranch/.test(ingest) && /Mobius Sarasota/.test(ingest) && /Belladukes/.test(ingest),
  "ingest names the hold_google_id shops");
ok(/SoFresh Bradenton/.test(ingest) && /Dirty Sara-Soda/.test(ingest) && /Happy Hands World/.test(ingest) && /Sloan/.test(ingest) && /Divilma Orlando/.test(ingest),
  "ingest HOLDs the coming-soon / mobile / planned names");
ok(!/places\.googleapis\.com/.test(ingest) && !/\bsearchText\s*\(/.test(ingest),
  "ingest is fail-closed — no Places host and no searchText()");
ok(!/app\/home\.js|IconicPlaceCard|app\/globals/.test(ingest),
  "ingest does not touch homepage JS, IconicPlaceCard, or CSS");

ok(/SoFresh Bradenton/.test(notes) && /Coming Soon/.test(notes),
  "HOLD notes name SoFresh Bradenton Coming Soon");
ok(/Dirty Sara-Soda/.test(notes) && /Happy Hands World/.test(notes) && /Sloan/.test(notes) && /Divilma Orlando/.test(notes),
  "HOLD notes name the four requested HOLDs");
ok(/Meacham Urban Farm/.test(notes) && /Dancing Goat/.test(notes) && /Fat Beet/.test(notes),
  "HOLD notes keep the three Tampa farms from #1019");
ok(/places\.googleapis\.com|Places API/.test(notes) && /not called|never called|ZERO/i.test(notes),
  "HOLD notes state Places was not called");

// Red-prove: a grocery typed as restaurant must not be how we file Belladukes.
ok(chipIdentity("food", "all", {
  name: "Belladukes Gourmet Market", types: ["restaurant"], primaryType: "restaurant", primary_type: "restaurant",
}) === true,
  "control: a restaurant primary WOULD pass Food — that is why the card uses gourmet_grocery");
ok(chipIdentity("food", "all", {
  name: "Belladukes Gourmet Market", types: ["gourmet_grocery", "grocery_store", "store"],
  primaryType: "gourmet_grocery", primary_type: "gourmet_grocery",
}) === false, "the shipped Belladukes types must fail Food");

if (fail.length) {
  console.error("test-owner-places-2026-08-29b: FAIL");
  for (const m of fail) console.error("  - " + m);
  process.exit(1);
}
console.log(`test-owner-places-2026-08-29b: OK — ${n} assertions; ${ADD.length} Atlas cards; ${HOLD_GOOGLE.length} google-id holds; ${HOLDS.length} HOLDs`);
