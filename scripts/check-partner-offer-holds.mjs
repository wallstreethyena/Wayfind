#!/usr/bin/env node
// scripts/check-partner-offer-holds.mjs — a partner button must lead somewhere
// a ticket can be bought, for the place the visitor is actually looking at.
//
// Two rules, both asserted BY CALL (import + invoke + read the return), never
// by grepping the source:
//
//   1. HOLDS (lib/partnerOfferHolds.js). An offer whose own partner page cannot
//      take an order paints no button on any surface — the exact place pick,
//      the geo-gated venue map, the metro rail — and the redirect refuses the
//      id, so a cached page cannot send anyone there either. Found 2026-11-11:
//      five Tiqets destinations answered 200 with nothing to buy (three parks
//      with every option unavailable, two product URLs that now land on a
//      category page) and every check we owned read only the status code.
//
//   2. NAMESAKES (lib/placePartnerPicks.js nameMatchIsHome). placePartnerPick
//      matches on the exact name alone. Three places in the inventory share a
//      name with a pick and are a different venue in another state — Adventure
//      Island in Orange Beach AL, Dinosaur World in Cave City KY, Titanic: The
//      Artifact Exhibition in Las Vegas — and each was offered the Florida
//      venue's ticket. A name-only match now also has to sit in the pick's own
//      region when the caller knows where the place is.
//
// The coordinates below are the real ones from wf_inventory on 2026-11-11, so
// the refusals and the controls are the shipped cases, not invented ones.
// What this guard CANNOT do is read a partner page: it proves a held id stays
// hidden and refused, not that the hold list is complete. The page evidence is
// in docs/audits/2026-11-11-tiqets-buttons/.
import { readFileSync } from "node:fs";
import { register } from "node:module";
register("./lib/placeDataNodeHook.mjs", import.meta.url);

const { HELD_PARTNER_OFFERS, isHeldPartnerOffer } = await import("../lib/partnerOfferHolds.js");
const { PLACE_PARTNER_PICKS, placePartnerPick, pinServeability, isBeachName } = await import("../lib/placePartnerPicks.js");
const { VENUE_OFFERS, venueOfferFor } = await import("../lib/venueOffers.js");
const { MENU_PARTNER_OFFERS } = await import("../lib/menuPartnerOffers.js");
const { PARTNER_OFFER_REGISTRY } = await import("../lib/partnerOfferRegistry.js");
const { resolveOffer } = await import("../lib/commerceProviders.js");
const { placePagePartner } = await import("../lib/placeData.js");

let pass = 0;
const fail = [];
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };
const idOf = (got) => (got ? got.offerId : null);
// Frozen past every dated overlay (the Trop / World Series swap), the same
// clock scripts/check-partner-hook-collisions.mjs uses.
const DAY = "2099-01-01";
const pick = (place) => placePartnerPick(place, undefined, DAY);

const pickRowById = new Map(PLACE_PARTNER_PICKS.map((row) => [row.offerId, row]));
const menuIds = new Set(MENU_PARTNER_OFFERS.map((row) => row.offerId));

// ── 0. POSITIVE CONTROLS, first — so every null below means something ─────
ok(idOf(pick({ name: "Busch Gardens Tampa Bay" })) === "tampa-hook-busch-gardens",
  `POSITIVE CONTROL: placePartnerPick still resolves Busch Gardens Tampa Bay by name (got ${idOf(pick({ name: "Busch Gardens Tampa Bay" }))})`);
ok(idOf(pick({ name: "Dinosaur World" })) === "tampa-hook-dinosaur-world",
  `POSITIVE CONTROL: a name-only call with no coordinates still resolves (got ${idOf(pick({ name: "Dinosaur World" }))})`);
ok(PLACE_PARTNER_PICKS.length >= 100 && MENU_PARTNER_OFFERS.length >= 60 && VENUE_OFFERS.length >= 60,
  `the three surfaces are populated (picks ${PLACE_PARTNER_PICKS.length}, menu ${MENU_PARTNER_OFFERS.length}, venues ${VENUE_OFFERS.length}) — an empty list makes the loops below vacuous`);

// ── 1. HOLDS ──────────────────────────────────────────────────────────────
ok(HELD_PARTNER_OFFERS.length > 0, "HELD_PARTNER_OFFERS is not empty — with nothing held, section 1 proves nothing");
ok(new Set(HELD_PARTNER_OFFERS).size === HELD_PARTNER_OFFERS.length, "no id is on the hold list twice");
// The loop below walks the list itself, so on its own it cannot notice an id
// quietly dropped from it. These are the five pages read on 2026-11-11; each
// stays held until someone re-reads the partner page. Lifting one on purpose
// means removing the id in BOTH places, with the date the page was re-read in
// the commit. No date is checked here — a hold never expires by itself.
const READ_AND_FOUND_UNBUYABLE = [
  "gurnee-hook-six-flags",
  "gurnee-hook-hurricane-harbor",
  "kissimmee-hook-island-h2o",
  "tampa-hook-selfie-wrld",
  "clearwater-hook-calypso-queen",
];
for (const id of READ_AND_FOUND_UNBUYABLE) {
  ok(isHeldPartnerOffer(id), `${id} is still held — its partner page had nothing to buy on 2026-11-11; lift it only after re-reading that page, and remove it here too`);
}
ok(isHeldPartnerOffer(null) === false && isHeldPartnerOffer(undefined) === false && isHeldPartnerOffer("") === false,
  "a missing offer id is not 'held' (null / undefined / empty)");
ok(isHeldPartnerOffer("tampa-hook-dinosaur-world") === false, "NEGATIVE CONTROL: an offer that is not on the list is not held");

let heldPickAliases = 0;
let heldVenueNames = 0;
for (const id of HELD_PARTNER_OFFERS) {
  // Nothing is deleted by a hold: the destination row must still be there, so
  // lifting a hold is one line. This also catches a typo'd id, which would
  // hold nothing and look like it worked.
  const reg = PARTNER_OFFER_REGISTRY[id];
  ok(!!reg, `held id "${id}" is a real PARTNER_OFFER_REGISTRY key — a misspelt id holds nothing`);
  ok(isHeldPartnerOffer(id) && isHeldPartnerOffer(` ${id} `), `isHeldPartnerOffer("${id}") is true, with or without stray whitespace`);

  // Surface 1: the exact place pick. Called with and without coordinates.
  const row = pickRowById.get(id);
  if (row) {
    ok(pinServeability(row).serveable === false && pinServeability(row).reason === "held-partner-offer",
      `pinServeability refuses held pick ${id} with reason held-partner-offer (got ${JSON.stringify(pinServeability(row))})`);
    for (const alias of row.aliases) {
      heldPickAliases++;
      ok(pick({ name: alias }) === null, `held ${id}: placePartnerPick("${alias}") paints no button (got ${idOf(pick({ name: alias }))})`);
    }
  }

  // Surface 2: the geo-gated venue map, in every market the row sells in.
  for (const venue of VENUE_OFFERS.filter((v) => v.offerId === id)) {
    for (const name of venue.names) for (const market of venue.market) {
      heldVenueNames++;
      ok(venueOfferFor(name, market) === null, `held ${id}: venueOfferFor("${name}", "${market}") returns null (got ${JSON.stringify(venueOfferFor(name, market))})`);
    }
  }

  // Surface 3: the metro rail.
  ok(!menuIds.has(id), `held ${id} is not in MENU_PARTNER_OFFERS — the rail must not paint a tile for it`);

  // The redirect. No network: resolveOffer reads our own table.
  const provider = (reg && reg.provider) || (row && row.provider) || "tiqets";
  const res = await resolveOffer(provider, id, {});
  ok(res && res.error === "held-offer" && !res.dest,
    `held ${id}: resolveOffer("${provider}") refuses with held-offer and hands back no destination (got ${JSON.stringify(res)})`);
}
ok(heldPickAliases > 0 && heldVenueNames > 0,
  `the hold loop reached the pick surface (${heldPickAliases} aliases) and the venue surface (${heldVenueNames} name×market pairs) — zero on either means that surface was never tested`);

// NEGATIVE CONTROL for the redirect: a live offer still resolves to a real
// destination, so "held-offer" above is the hold talking, not a broken resolver.
{
  const res = await resolveOffer("tiqets", "tampa-hook-dinosaur-world", {});
  ok(res && !res.error && /^https:\/\//.test(String(res.dest || "")),
    `NEGATIVE CONTROL: a live offer still resolves through resolveOffer (got ${JSON.stringify(res && { error: res.error, hasDest: !!res.dest })})`);
  ok(menuIds.has("tampa-hook-dinosaur-world"), "NEGATIVE CONTROL: a live offer is still on the metro rail");
  ok(idOf(venueOfferFor("Florida Aquarium", "Tampa")) === "tampa-family-florida-aquarium",
    `NEGATIVE CONTROL: venueOfferFor still resolves a live venue in its own market (got ${idOf(venueOfferFor("Florida Aquarium", "Tampa"))})`);
}

// lib/placePartnerPicks.js rides in the homepage chunk and imports the hold
// list, so the list must stay import-free (the bundle guard has ~3 KB of room).
{
  const src = readFileSync(new URL("../lib/partnerOfferHolds.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(/export const HELD_PARTNER_OFFERS\s*=/.test(src), "probe finds the HELD_PARTNER_OFFERS declaration in comment-stripped source (positive control for the next line)");
  ok(!/^\s*import\s/m.test(src) && !/\brequire\s*\(/.test(src), "lib/partnerOfferHolds.js imports nothing — it ships inside the homepage chunk");
}

// ── 2. NAMESAKES ──────────────────────────────────────────────────────────
// 2a. The three shipped wrong-place buttons, at their real coordinates.
const NAMESAKES = [
  { name: "Adventure Island", lat: 30.27, lng: -87.61, address: "24559 Perdido Beach Blvd, Orange Beach, AL 36561, USA", where: "Orange Beach AL", id: "ChIJC5cg-Y4GmogRfmvedNEA2zY", real: { lat: 28.04, lng: -82.41 } },
  { name: "Dinosaur World", lat: 37.14, lng: -85.98, address: "711 Mammoth Cave Rd, Cave City, KY 42127, USA", where: "Cave City KY", id: "ChIJ1_zqtDEZZogRUR-Xo4y_aWI", real: { lat: 28.03, lng: -82.19 } },
  { name: "Titanic: The Artifact Exhibition", lat: 36.10, lng: -115.18, address: "3900 S Las Vegas Blvd, Las Vegas, NV 89119, USA", where: "Las Vegas", id: "ChIJJ2BLPs7FyIAR_z-wekDws_g", real: { lat: 28.46, lng: -81.47 } },
];
for (const n of NAMESAKES) {
  const home = pick({ name: n.name, lat: n.real.lat, lng: n.real.lng });
  ok(!!home, `POSITIVE CONTROL: "${n.name}" at its Florida venue (${n.real.lat}, ${n.real.lng}) still gets its ticket button`);
  ok(pick({ name: n.name, lat: n.lat, lng: n.lng }) === null,
    `"${n.name}" in ${n.where} (${n.lat}, ${n.lng}) is a different venue and gets no button (got ${idOf(pick({ name: n.name, lat: n.lat, lng: n.lng }))})`);
  // The durable /places/<id> page goes through placePagePartner, which also
  // has the venue-map fallback — that rung must not hand the button back.
  const page = placePagePartner({ id: n.id, name: n.name, lat: n.lat, lng: n.lng, address: n.address, types: ["tourist_attraction"] });
  ok(page === null, `placePagePartner gives the ${n.where} "${n.name}" page no partner (got ${JSON.stringify(page)})`);
  const pageHome = placePagePartner({ id: "test-home", name: n.name, lat: n.real.lat, lng: n.real.lng, address: "Florida, USA", types: ["tourist_attraction"] });
  ok(idOf(pageHome) === idOf(home), `placePagePartner still gives the Florida "${n.name}" page its partner (got ${idOf(pageHome)})`);
}

// 2b. "No coordinate" is never "outside". Callers that only know a name
// (guide CTAs, curated events) must keep resolving, and null must not be read
// as zero — Number(null) is 0, which is off the coast of Africa.
for (const [label, place] of [
  ["lat/lng absent", { name: "Titanic: The Artifact Exhibition" }],
  ["lat/lng null", { name: "Titanic: The Artifact Exhibition", lat: null, lng: null }],
  ["lat/lng empty strings", { name: "Titanic: The Artifact Exhibition", lat: "", lng: "" }],
  ["lat/lng 0,0", { name: "Titanic: The Artifact Exhibition", lat: 0, lng: 0 }],
  ["lat/lng not numbers", { name: "Titanic: The Artifact Exhibition", lat: "n/a", lng: "n/a" }],
  ["only lat known", { name: "Titanic: The Artifact Exhibition", lat: 36.1 }],
  ["lat null beside a real lng", { name: "Titanic: The Artifact Exhibition", lat: null, lng: -81.47 }],
  ["lng empty beside a real lat", { name: "Titanic: The Artifact Exhibition", lat: 28.46, lng: "" }],
  ["numeric strings inside Florida", { name: "Titanic: The Artifact Exhibition", lat: "28.46", lng: "-81.47" }],
]) {
  ok(idOf(pick(place)) === "orlando-hook-titanic-exhibition", `${label}: the pick still resolves (got ${idOf(pick(place))})`);
}
ok(pick({ name: "Titanic: The Artifact Exhibition", lat: "36.10", lng: "-115.18" }) === null,
  "numeric STRING coordinates outside the region are still refused — a string is not a free pass");

// 2c. Every pick row, by call: it resolves at a real point in its own region
// and is refused far from any region. Boise sells nothing and is in no box.
const HOME_POINT = [
  [/^nyc-/, { lat: 40.7580, lng: -73.9855 }],                // Times Square
  [/^(?:chicago|gurnee)-/, { lat: 41.8789, lng: -87.6359 }], // the Loop
];
const FLORIDA_POINT = { lat: 28.5384, lng: -81.3789 };       // downtown Orlando
const BOISE = { lat: 43.615, lng: -116.2023 };
let rowsChecked = 0;
let awayRows = 0;
for (const row of PLACE_PARTNER_PICKS) {
  if (isHeldPartnerOffer(row.offerId) || !pinServeability(row).serveable) continue;
  const away = HOME_POINT.find(([prefix]) => prefix.test(String(row.offerId)));
  const homePoint = away ? away[1] : FLORIDA_POINT;
  if (away) awayRows++;
  for (const alias of row.aliases) {
    if (isBeachName(alias)) continue;
    rowsChecked++;
    ok(idOf(pick({ name: alias, ...homePoint })) === row.offerId,
      `${row.offerId}: "${alias}" resolves at a point in its own region (${homePoint.lat}, ${homePoint.lng}) (got ${idOf(pick({ name: alias, ...homePoint }))})`);
    ok(pick({ name: alias, ...BOISE }) === null,
      `${row.offerId}: "${alias}" in Boise, ID is a namesake and gets no button (got ${idOf(pick({ name: alias, ...BOISE }))})`);
    // The original defect, generalised: an out-of-state row must not paint in
    // Florida and a Florida row must not paint in New York.
    const wrong = away ? FLORIDA_POINT : HOME_POINT[0][1];
    ok(pick({ name: alias, ...wrong }) === null,
      `${row.offerId}: "${alias}" at (${wrong.lat}, ${wrong.lng}) is outside its region and gets no button (got ${idOf(pick({ name: alias, ...wrong }))})`);
  }
}
ok(rowsChecked >= 150 && awayRows >= 20,
  `the region loop ran over the catalogue (${rowsChecked} aliases, ${awayRows} out-of-state rows) — a short count means the loop skipped what it was written to check`);

// 2d. The region must not cut off a real venue. Every rail tile carries the
// venue's own coordinates, so each pick that is also a tile is called at the
// place it actually is — including the Panhandle, the Keys and the First Coast.
let tilesChecked = 0;
for (const tile of MENU_PARTNER_OFFERS) {
  const row = pickRowById.get(tile.offerId);
  if (!row || !Number.isFinite(tile.lat) || !Number.isFinite(tile.lng)) continue;
  for (const alias of row.aliases) {
    if (isBeachName(alias)) continue;
    tilesChecked++;
    ok(idOf(pick({ name: alias, lat: tile.lat, lng: tile.lng })) === row.offerId,
      `${row.offerId}: "${alias}" resolves at its own tile coordinates (${tile.lat}, ${tile.lng}) — the region box must contain the real venue (got ${idOf(pick({ name: alias, lat: tile.lat, lng: tile.lng }))})`);
  }
}
ok(tilesChecked >= 60, `the tile loop checked real venue coordinates (${tilesChecked}) — fewer than 60 means the rail rows stopped carrying lat/lng`);

// 2e. A place-id match is the strongest identity we have and is not second-
// guessed by the name rule (a row that carries placeIds names one place).
{
  const withIds = PLACE_PARTNER_PICKS.filter((row) => Array.isArray(row.placeIds) && row.placeIds.length && pinServeability(row).serveable);
  for (const row of withIds) {
    ok(idOf(pick({ id: row.placeIds[0], name: "Some Other Name", ...BOISE })) === row.offerId,
      `${row.offerId}: a place-id match resolves whatever the coordinates say (got ${idOf(pick({ id: row.placeIds[0], name: "Some Other Name", ...BOISE }))})`);
  }
}

if (fail.length) {
  console.error("check-partner-offer-holds: FAIL");
  fail.forEach((m) => console.error("  - " + m));
  process.exit(1);
}
console.log(`check-partner-offer-holds: OK — ${pass} assertions, all BY CALL (${HELD_PARTNER_OFFERS.length} held offers hidden on picks/venues/rail and refused by resolveOffer; 3 real out-of-state namesakes refused, their Florida venues kept; ${rowsChecked} aliases proven in-region yes / Boise no / wrong-state no; ${tilesChecked} aliases proven at their own venue coordinates. Scope: proves held ids stay hidden, NOT that the hold list is complete — partner pages are not read here)`);
