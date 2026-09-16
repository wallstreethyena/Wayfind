#!/usr/bin/env node
// scripts/check-menu-partner-offers.mjs — Lane B: MENU_PARTNER_OFFERS is the
// ONLY thing that decides which category:sub browse chip shows which partner
// offer, and it must never let an invented row, a fake offer id, an unlawful
// chip, or a client-side leak reach production.
//
// WHAT THIS LOCKS, BY CALL where a call exists (CLAUDE.md: "assert on the
// call, not the string"):
//   1. Every row is well-shaped, frozen, and unique on `${provider}:${offerId}`.
//   2. Every row's PROVIDER is a live commerce.PROVIDERS entry — a dark
//      provider (e.g. wegotrip) could never resolve a redirect, so a row
//      naming one would render a Book button that always fails.
//   3. Every row's OFFER ID actually resolves in the registry its provider
//      reads from: PARTNER_OFFER_REGISTRY for tiqets/klook/awin_*/
//      ticketnetwork/gocity, CITYPASS_MARKETS for citypass, and
//      AFFILIATE_MERCHANTS' admission mapping for undercover_tourist. A row
//      whose id resolves nowhere is a Book button to nothing.
//   4. Every row's `fits` are REAL CHIP_COMMERCE keys, and calling
//      menuPartnerOffersFor proves the empty-by-law chips (food/hotels/
//      shopping/spa/speakeasy/karaoke) return [] regardless of location —
//      the reversal this repo has shipped twice already (Food, 2026-09-07).
//   5. The metro gate is REAL: calling the function from a Tampa center
//      returns a Tampa museum and EXCLUDES a Miami museum that carries the
//      identical `fits` entry (proving exclusion is about DISTANCE, not a
//      missing fit — the trap check-food-no-tour-rail.mjs's own section 3
//      pattern exists to catch).
//   6. DEAD-INVENTORY CLOSURE: every PARTNER_OFFER_REGISTRY key is referenced
//      by an existing surface, by MENU_PARTNER_OFFERS, or by
//      DELIBERATELY_UNPLACED with a reason — never silently missing all three.
//   7. THE IMPORT BOUNDARY: this module is never imported by a "use client"
//      file or app/home.js — the client must never receive a destination, and
//      importing this lib is how that leak would start.
//
// RED-PROVED 2026-09-16 (four separate mutations, each watched red then
// restored to green — see the PR description for the transcripts):
//   a. added "food:dinner" to an existing row's `fits`               → assertion 4
//   b. added a row with offerId "totally-fake-offer-id"              → assertion 3
//   c. imported lib/menuPartnerOffers.js from UnifiedBrowseCommerceRail.js → assertion 7
//   d. added a MENU_PARTNER_OFFERS-shaped row that appears nowhere and
//      is absent from DELIBERATELY_UNPLACED                          → assertion 6
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MENU_PARTNER_OFFERS, DELIBERATELY_UNPLACED, menuPartnerOffersFor } from "../lib/menuPartnerOffers.js";
import { PROVIDERS } from "../lib/commerceProviders.js";
import { PARTNER_OFFER_REGISTRY, partnerOfferById } from "../lib/partnerOfferRegistry.js";
import { cityPassOfferById } from "../lib/cityPassOffers.js";
import { AFFILIATE_MERCHANTS } from "../lib/affiliateLibrary.js";
import { CHIP_COMMERCE } from "../lib/browseCommerceMap.js";
import { UT_PLACE_DEAL_IDS, UT_EVENT_DEAL_IDS } from "../lib/deals.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };

// ── 1. shape, frozen, unique ────────────────────────────────────────────────
ok(Array.isArray(MENU_PARTNER_OFFERS) && MENU_PARTNER_OFFERS.length > 0, `MENU_PARTNER_OFFERS is a non-empty array (${MENU_PARTNER_OFFERS.length} rows)`);
ok(Object.isFrozen(MENU_PARTNER_OFFERS), "MENU_PARTNER_OFFERS is frozen");
const EXPECTED_KEYS = ["offerId", "provider", "merchant", "title", "placeId", "lat", "lng", "image", "market", "fits"].sort();
const seenPairs = new Set();
for (const row of MENU_PARTNER_OFFERS) {
  const label = `${row && row.provider}:${row && row.offerId}`;
  ok(Object.isFrozen(row), `${label}: row is frozen`);
  ok(Object.isFrozen(row.fits), `${label}: row.fits is frozen`);
  ok(JSON.stringify(Object.keys(row).sort()) === JSON.stringify(EXPECTED_KEYS), `${label}: row carries exactly the documented fields, no destination/url field (got ${Object.keys(row).sort().join(",")})`);
  ok(typeof row.offerId === "string" && row.offerId.length > 0, `${label}: offerId is a non-empty string`);
  ok(typeof row.provider === "string" && row.provider.length > 0, `${label}: provider is a non-empty string`);
  ok(typeof row.merchant === "string" && row.merchant.length > 0, `${label}: merchant is a non-empty string`);
  ok(typeof row.title === "string" && row.title.length > 0, `${label}: title is a non-empty string`);
  ok(row.placeId === null || (typeof row.placeId === "string" && row.placeId.length > 0), `${label}: placeId is null or a non-empty string`);
  ok(Number.isFinite(row.lat) && row.lat >= -90 && row.lat <= 90, `${label}: lat is a finite latitude (${row.lat})`);
  ok(Number.isFinite(row.lng) && row.lng >= -180 && row.lng <= 180, `${label}: lng is a finite longitude (${row.lng})`);
  ok(typeof row.image === "string" && /^https:\/\//.test(row.image), `${label}: image is an https URL (the "real art" rule — never a blank card)`);
  ok(Array.isArray(row.fits) && row.fits.length > 0, `${label}: fits is a non-empty array`);
  const pairKey = `${row.provider}:${row.offerId}`;
  ok(!seenPairs.has(pairKey), `${label}: no duplicate provider:offerId pair (registry-wide uniqueness)`);
  seenPairs.add(pairKey);
}

// ── 2. every provider is LIVE (a dark provider can never resolve) ──────────
for (const row of MENU_PARTNER_OFFERS) {
  ok(row.provider in PROVIDERS, `${row.offerId}: provider "${row.provider}" is a live commerce.PROVIDERS entry (a dark provider can never resolve a redirect)`);
}
// positive control: prove PROVIDERS itself is non-trivial, so the check above
// could actually fail on a row naming something outside it.
ok(Object.keys(PROVIDERS).length >= 10, `positive control: PROVIDERS is the real, non-trivial registry (${Object.keys(PROVIDERS).length} entries)`);
// LANE E (2026-09-16): wegotrip flipped from dark to live-but-gated. Assert
// that BY CALL — resolve() is a function, and it is the resolve()
// (isWegotripProductUrl-backed) shape, never a bare table lookup that would
// trust every registry row's destination outright.
ok("wegotrip" in PROVIDERS && typeof PROVIDERS.wegotrip.resolve === "function",
  "PROVIDERS.wegotrip is live and resolve()-gated, not a table lookup — the four MENU_PARTNER_OFFERS rows below can actually redirect");

// ── 3. every offer id resolves in the registry its provider actually reads
//       from, executed via the real lookup functions ───────────────────────
const REGISTRY_PROVIDERS = new Set(["tiqets", "klook", "awin_samboat", "awin_usghostadventures", "awin_rentcars", "awin_caesarsshows", "ticketnetwork", "gocity", "wegotrip"]);
const utAdmissionIds = new Set(
  AFFILIATE_MERCHANTS
    .filter((m) => m.admission && m.admission.provider === "undercover_tourist")
    .map((m) => String(m.admission.offerId))
);
ok(utAdmissionIds.size >= 6, `positive control: AFFILIATE_MERCHANTS names at least 6 undercover_tourist admission ids (found ${utAdmissionIds.size}) before trusting the UT check below`);
for (const row of MENU_PARTNER_OFFERS) {
  if (REGISTRY_PROVIDERS.has(row.provider)) {
    const reg = partnerOfferById(row.offerId, row.provider);
    ok(!!reg, `${row.offerId}: resolves in PARTNER_OFFER_REGISTRY under provider "${row.provider}" (partnerOfferById call)`);
  } else if (row.provider === "citypass") {
    ok(!!cityPassOfferById(row.offerId), `${row.offerId}: resolves via cityPassOfferById`);
  } else if (row.provider === "undercover_tourist") {
    ok(utAdmissionIds.has(String(row.offerId)), `${row.offerId}: is a real Undercover Tourist admission id in AFFILIATE_MERCHANTS (not an invented wf_deals id)`);
  } else {
    fail += 1;
    console.log(`  FAIL: ${row.offerId}: provider "${row.provider}" is not one this guard knows how to validate an offer id against — add a branch, do not skip it`);
  }
}

// ── 4. fits are real chips, and the empty-by-law chips are enforced BY CALL ─
// EMPTY-BY-LAW is checked TWICE, deliberately, at two independent layers:
// menuPartnerOffersFor's own category-level gate (asserted by CALL below)
// protects every caller even if a row is wrong, but that gate alone cannot
// catch a row that WRONGLY claims a food/hotels/shopping/spa/speakeasy/
// karaoke fit — the two are redundant on purpose, and this data-hygiene scan
// is what actually goes red on that mistake (the function-level gate does
// not: it short-circuits on the category BEFORE ever reading row.fits, so a
// bad fit on an existing row is invisible to a call-only check).
const EMPTY_BY_LAW_KEYS = new Set(Object.keys(CHIP_COMMERCE).filter((k) => /^(?:food|hotels|shopping):/.test(k) || k === "attractions:spa" || k === "nightlife:speakeasy" || k === "nightlife:karaoke"));
ok(EMPTY_BY_LAW_KEYS.size >= 15, `positive control: the empty-by-law key set is non-trivial (${EMPTY_BY_LAW_KEYS.size} keys) before trusting the scan below`);
for (const row of MENU_PARTNER_OFFERS) {
  for (const key of row.fits) {
    ok(Object.prototype.hasOwnProperty.call(CHIP_COMMERCE, key), `${row.offerId}: fits entry "${key}" is a real CHIP_COMMERCE key`);
    ok(!EMPTY_BY_LAW_KEYS.has(key), `${row.offerId}: fits does not claim empty-by-law chip "${key}" (Food/Hotels/Shopping/Spa/Speakeasy/Karaoke sell no partner inventory, full stop)`);
  }
}
const TAMPA = { lat: 27.9506, lng: -82.4572 };
for (const [cat, sub] of [["food", "dinner"], ["food", "all"], ["hotels", "all"], ["shopping", "all"], ["attractions", "spa"], ["nightlife", "speakeasy"], ["nightlife", "karaoke"]]) {
  const rows = menuPartnerOffersFor(cat, sub, TAMPA);
  ok(Array.isArray(rows) && rows.length === 0, `menuPartnerOffersFor("${cat}", "${sub}", TAMPA) === [] — empty-by-law chip, enforced even with a valid nearby center`);
}
ok(menuPartnerOffersFor("attractions", "museums", {}).length === 0, "menuPartnerOffersFor never guesses a location: missing lat/lng on an otherwise-populated chip returns []");
ok(menuPartnerOffersFor("bogus-category", "nope", TAMPA).length === 0, "an unknown category:sub fails closed to []");
// positive control: prove attractions:museums is NOT globally empty, so the
// empty results above are the LAW, not an accident of a chip with no rows.
ok(menuPartnerOffersFor("attractions", "museums", TAMPA).length > 0, "positive control: attractions:museums near Tampa is genuinely non-empty");

// ── 5. the metro gate is real: distance excludes, not a missing fit ────────
const museumsNearTampa = menuPartnerOffersFor("attractions", "museums", TAMPA);
ok(museumsNearTampa.some((r) => r.offerId === "tampa-hook-mosi"), "MOSI (Tampa) is included in a Tampa-centered attractions:museums query");
const frostScience = MENU_PARTNER_OFFERS.find((r) => r.offerId === "miami-hook-frost-science");
ok(!!frostScience && frostScience.fits.includes("attractions:museums"), "positive control: Frost Science (Miami) DOES carry the attractions:museums fit — so its absence below is provably about distance, not a missing fit");
ok(!museumsNearTampa.some((r) => r.offerId === "miami-hook-frost-science"), "Frost Science (Miami, ~200mi from Tampa) is EXCLUDED from the Tampa-centered query — the 60mi metro gate is real, not decorative");
const museumsNearMiami = menuPartnerOffersFor("attractions", "museums", { lat: 25.7617, lng: -80.1918 });
ok(museumsNearMiami.some((r) => r.offerId === "miami-hook-frost-science"), "…and the SAME row IS included from a Miami-centered query — confirms the exclusion above was geography, not a broken row");

// LANE E (2026-09-16): the two Miami WeGoTrip tours are actually reachable
// through the real menu-chip call, AND the row's provider/offerId resolves an
// end-to-end redirect — not just present in the array, CALLED both ways.
const MIAMI = { lat: 25.7617, lng: -80.1918 };
const miamiTours = menuPartnerOffersFor("attractions", "tours", MIAMI);
ok(miamiTours.some((r) => r.offerId === "miami-tour-art-deco-south-beach" && r.provider === "wegotrip"),
  "attractions:tours near Miami includes the Art Deco South Beach WeGoTrip tour");
ok(miamiTours.some((r) => r.offerId === "miami-tour-downtown-audio" && r.provider === "wegotrip"),
  "attractions:tours near Miami includes the Downtown Audio WeGoTrip tour");
const miamiLandmarks = menuPartnerOffersFor("attractions", "landmarks", MIAMI);
ok(miamiLandmarks.some((r) => r.offerId === "miami-tour-art-deco-south-beach"), "attractions:landmarks near Miami also carries the Art Deco tour (dual fit)");
const { resolveOffer } = await import("../lib/commerceProviders.js");
const wgtResolved = await resolveOffer("wegotrip", "miami-tour-art-deco-south-beach");
ok(!wgtResolved.error && /^https:\/\/tp\.media\/r\?/.test(wgtResolved.dest || ""),
  `the wegotrip row placed above actually resolves through resolveOffer (got ${JSON.stringify(wgtResolved)})`);

// nightlife:sports is entirely TicketNetwork stadium/arena inventory near Tampa.
const sportsNearTampa = menuPartnerOffersFor("nightlife", "sports", TAMPA);
ok(sportsNearTampa.length > 0, "nightlife:sports near Tampa returns at least one row");
ok(sportsNearTampa.every((r) => r.provider === "ticketnetwork"), "every nightlife:sports row is a ticketnetwork stadium/arena offer (never ranked by provider — this is a fit fact, not a preference)");

// dedup, executed: a broad, whole-catalogue-spanning query must never return
// two rows sharing a provider:offerId pair.
const allNear = menuPartnerOffersFor("attractions", "all", { ...TAMPA, radiusMi: 20000 });
const dedupeCheck = new Set();
let dupesFound = 0;
for (const r of allNear) { const k = `${r.provider}:${r.offerId}`; if (dedupeCheck.has(k)) dupesFound += 1; dedupeCheck.add(k); }
ok(allNear.length > 20, `positive control: a 20,000mi-radius attractions:all query returns a large set (${allNear.length}) worth deduping`);
ok(dupesFound === 0, "menuPartnerOffersFor never returns a duplicate provider:offerId pair, even across a catalogue-spanning radius");

// R1 (2026-09-16 audit): every row menuPartnerOffersFor returns must carry a
// distMi computed from the SAME haversine call that gates inclusion — this is
// what UnifiedBrowseCommerceRail's interleaveReserved() (lib/menuReserveSlots.js)
// sorts its reserved slots by. Asserted by CALL, and cross-checked against an
// independent haversine so a wrong unit (meters vs miles) cannot slip through.
const mosiRow = museumsNearTampa.find((r) => r.offerId === "tampa-hook-mosi");
ok(!!mosiRow && Number.isFinite(mosiRow.distMi) && mosiRow.distMi >= 0, `every menuPartnerOffersFor row carries a finite, non-negative distMi (tampa-hook-mosi: ${mosiRow && mosiRow.distMi})`);
ok(mosiRow.distMi < 1, `positive control: MOSI is in Tampa and the query center IS Tampa, so distMi should read effectively 0mi (got ${mosiRow.distMi})`);
const frostFromMiami = museumsNearMiami.find((r) => r.offerId === "miami-hook-frost-science");
ok(!!frostFromMiami && frostFromMiami.distMi < 1, "the Miami-centered query's own distMi for Frost Science is also effectively 0mi (same center-on-venue shape as the Tampa control)");

// R2 (2026-09-16 audit): 8 Undercover Tourist rows ("X (Undercover Tourist)")
// duplicated the Tiqets/Klook row for the SAME park a few lines above them —
// removed because Wayfind already serves UT park tickets in this rail via the
// independent deals lane. Assert they are GONE from MENU_PARTNER_OFFERS and
// individually accounted for in DELIBERATELY_UNPLACED with the stated reason
// — not merely absent (which a typo could also produce).
const REMOVED_UT_DUP_IDS = ["6", "7", "13", "14", "15", "16", "17", "18"];
for (const id of REMOVED_UT_DUP_IDS) {
  ok(!MENU_PARTNER_OFFERS.some((r) => r.provider === "undercover_tourist" && r.offerId === id),
    `undercover_tourist offer "${id}" (a duplicate of an already-placed Tiqets/Klook row) is NOT in MENU_PARTNER_OFFERS`);
  ok(DELIBERATELY_UNPLACED[id] === "served by the deals lane (wf_deals via /api/deals) in the same rail",
    `DELIBERATELY_UNPLACED["${id}"] carries the exact "served by the deals lane" reason (got ${JSON.stringify(DELIBERATELY_UNPLACED[id])})`);
}
// The map's UT-id acceptance itself must stay wired — a real UT admission id
// (17, Kennedy Space Center — one of the 8 removed above) still validates
// through the same undercover_tourist branch section 3 exercises, proving
// removal from MENU_PARTNER_OFFERS didn't also break the acceptance path.
ok(utAdmissionIds.has("17"), "positive control: the UT-id acceptance set still recognizes a real admission id after the 8 duplicate rows were removed");

// F3 (2026-09-16 audit): 4 PARTNER_OFFER_REGISTRY rows previously sat in
// DELIBERATELY_UNPLACED on a false "no distinct product image exists" claim
// — lib/intentPartnerPicks.js already ships a verified, product-specific
// image for each. Moved into MENU_PARTNER_OFFERS; assert they are actually
// there, resolve, and are reachable through the real menu-chip call.
for (const id of ["orlando-pass-gocity-essentials", "orlando-pass-gocity-explorer", "miami-pass-gocity-explorer", "orlando-best-gatorland-kennedy"]) {
  ok(!Object.prototype.hasOwnProperty.call(DELIBERATELY_UNPLACED, id), `${id}: no longer in DELIBERATELY_UNPLACED (moved into MENU_PARTNER_OFFERS)`);
  const row = MENU_PARTNER_OFFERS.find((r) => r.offerId === id);
  ok(!!row, `${id}: is now a MENU_PARTNER_OFFERS row`);
  ok(!!row && !!partnerOfferById(row.offerId, row.provider), `${id}: resolves in PARTNER_OFFER_REGISTRY under provider "${row && row.provider}" (partnerOfferById call)`);
}
const orlandoAttractionsAll = menuPartnerOffersFor("attractions", "all", { lat: 28.5383, lng: -81.3792 });
ok(orlandoAttractionsAll.some((r) => r.offerId === "orlando-pass-gocity-essentials"), "attractions:all near Orlando includes the Go City Essentials pass through the real menu-chip call");
ok(orlandoAttractionsAll.some((r) => r.offerId === "orlando-pass-gocity-explorer"), "attractions:all near Orlando includes the Go City Explorer pass");
ok(orlandoAttractionsAll.some((r) => r.offerId === "orlando-best-gatorland-kennedy"), "attractions:all near Orlando includes the Gatorland + Kennedy Space Center combo");
const orlandoFamilyAll = menuPartnerOffersFor("family", "all", { lat: 28.5383, lng: -81.3792 });
ok(orlandoFamilyAll.some((r) => r.offerId === "orlando-best-gatorland-kennedy"), "family:all near Orlando ALSO includes the Gatorland + Kennedy Space Center combo (placed on both chips)");
const miamiAttractionsAll = menuPartnerOffersFor("attractions", "all", { lat: 25.7617, lng: -80.1918 });
ok(miamiAttractionsAll.some((r) => r.offerId === "miami-pass-gocity-explorer"), "attractions:all near Miami includes the Go City Miami Explorer pass");

// ── 6. dead-inventory closure ───────────────────────────────────────────────
// Every PARTNER_OFFER_REGISTRY key must be referenced by an existing surface,
// by MENU_PARTNER_OFFERS, or be named in DELIBERATELY_UNPLACED with a reason.
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) return name === "node_modules" || name === ".next" ? [] : walk(p);
    return /\.(js|mjs|jsx)$/.test(name) ? [p] : [];
  });
}
// The known existing surfaces a registry key can legitimately be referenced
// from (PP/VO/IP/CPN/AL/ETD in the affiliate-inventory audit's shorthand),
// PLUS this lane's own two exports.
const SURFACE_FILES = [
  "lib/placePartnerPicks.js",
  "lib/venueOffers.js",
  "lib/intentPartnerPicks.js",
  "lib/coupons.js",
  "lib/partnerDeals.js",
  "lib/affiliateLibrary.js",
  "lib/eventTicketDeals.js",
];
const surfaceText = SURFACE_FILES.map((f) => read(f)).join("\n");
const placedIds = new Set(MENU_PARTNER_OFFERS.map((r) => r.offerId));
const unplacedIds = new Set(Object.keys(DELIBERATELY_UNPLACED));
ok(unplacedIds.size > 0, "DELIBERATELY_UNPLACED names at least one id (positive control that this map is populated, not vestigial)");
for (const key of unplacedIds) ok(!placedIds.has(key), `${key}: not BOTH placed in MENU_PARTNER_OFFERS and listed in DELIBERATELY_UNPLACED (mutually exclusive)`);
for (const [key, reason] of Object.entries(DELIBERATELY_UNPLACED)) ok(typeof reason === "string" && reason.length >= 10, `DELIBERATELY_UNPLACED["${key}"] carries a real reason, not a placeholder`);

// F3 (2026-09-16 audit): the module header used to claim "every id here is a
// PARTNER_OFFER_REGISTRY key" — false, several are Undercover Tourist
// admission/event ids (small integers-as-strings from AFFILIATE_MERCHANTS'
// admission mapping or lib/deals.js's UT id tables, never a
// PARTNER_OFFER_REGISTRY key). Assert the CORRECTED claim instead: every
// DELIBERATELY_UNPLACED key is a real PARTNER_OFFER_REGISTRY key OR a real UT
// id, never neither — which is exactly what an invented/typo'd key would be.
const utNumericIds = new Set([...Object.keys(UT_PLACE_DEAL_IDS), ...Object.keys(UT_EVENT_DEAL_IDS), ...utAdmissionIds]);
ok(utNumericIds.size >= 6, `positive control: the combined UT id set (UT_PLACE_DEAL_IDS + UT_EVENT_DEAL_IDS + AFFILIATE_MERCHANTS admissions) is non-trivial (${utNumericIds.size} ids)`);
for (const key of Object.keys(DELIBERATELY_UNPLACED)) {
  const isRegistryKey = Object.prototype.hasOwnProperty.call(PARTNER_OFFER_REGISTRY, key);
  const isUtId = utNumericIds.has(key);
  ok(isRegistryKey || isUtId, `DELIBERATELY_UNPLACED["${key}"]: is a real PARTNER_OFFER_REGISTRY key or a real UT admission/event id (got neither — an invented key would only ever be caught here)`);
}

const registryKeys = Object.keys(PARTNER_OFFER_REGISTRY);
ok(registryKeys.length >= 100, `positive control: PARTNER_OFFER_REGISTRY is the real, large registry (${registryKeys.length} keys)`);
const missing = registryKeys.filter((key) => {
  if (placedIds.has(key)) return false;
  if (unplacedIds.has(key)) return false;
  const quoted = `"${key}"`;
  return !surfaceText.includes(quoted);
});
ok(missing.length === 0, `every PARTNER_OFFER_REGISTRY key is referenced by an existing surface, MENU_PARTNER_OFFERS, or DELIBERATELY_UNPLACED — missing: ${missing.join(", ")}`);

// ── 7. the import boundary: never a "use client" file, never app/home.js ───
const appFiles = walk(path.join(ROOT, "app"));
const libFiles = walk(path.join(ROOT, "lib"));
const IMPORT_RX = /from\s+["'][^"']*\/lib\/menuPartnerOffers(?:\.js)?["']|require\(["'][^"']*\/lib\/menuPartnerOffers(?:\.js)?["']\)/;
let clientLeaks = [];
let sawRealImport = false;
for (const file of [...appFiles, ...libFiles]) {
  const src = readFileSync(file, "utf8");
  const isClient = /^\s*["']use client["'];?/m.test(src.slice(0, 400));
  const isHome = path.relative(ROOT, file) === path.join("app", "home.js");
  const imports = IMPORT_RX.test(src);
  if (imports && !isClient && !isHome) sawRealImport = true;
  if (imports && (isClient || isHome)) clientLeaks.push(path.relative(ROOT, file));
}
ok(sawRealImport, "positive control: at least one legitimate server file (the API route) DOES import lib/menuPartnerOffers.js — proves this scan can find a real import, not just fail to look");
ok(clientLeaks.length === 0, `lib/menuPartnerOffers.js is imported by NO "use client" file and NOT by app/home.js — offenders: ${clientLeaks.join(", ")}`);
// self-test: the scanner must actually flag a "use client" file that imports it.
const CLIENT_FIXTURE = '"use client";\nimport { menuPartnerOffersFor } from "../../lib/menuPartnerOffers.js";\n';
ok(/^\s*["']use client["'];?/m.test(CLIENT_FIXTURE.slice(0, 400)) && IMPORT_RX.test(CLIENT_FIXTURE), "self-test: the client-directive + import-regex pair correctly flags a known-bad client fixture");
const SERVER_FIXTURE = 'import { menuPartnerOffersFor } from "../../lib/menuPartnerOffers.js";\nexport async function GET() {}\n';
ok(!/^\s*["']use client["'];?/m.test(SERVER_FIXTURE.slice(0, 400)), "self-test: a known-good server fixture (no client directive) is correctly NOT flagged");

// ── 8. the API route calls menuPartnerOffersFor and never leaks a destination
const routeSrc = read("app/api/partner/menu-offers/route.js");
// Strip comments before checking for a `.destination` READ — this route's own
// header comments explain the no-destination invariant in prose (the word
// "destination" legitimately appears there), so a bare word match would flag
// the very documentation that states the rule. CLAUDE.md: strip comments
// before any position/presence check on raw source.
const routeCode = routeSrc.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
ok(/import\s*\{[^}]*\bmenuPartnerOffersFor\b[^}]*\}\s*from\s*["'][^"']*lib\/menuPartnerOffers\.js["']/.test(routeSrc), "the route imports menuPartnerOffersFor from lib/menuPartnerOffers.js");
ok(/menuPartnerOffersFor\(/.test(routeCode), "the route CALLS menuPartnerOffersFor (not merely imports it)");
ok(!/\.destination\b/.test(routeCode), "the route's CODE never reads a `.destination` field — offer ids leave this route, URLs never do");
ok(!/from\s*["'][^"']*partnerOfferRegistry\.js["']/.test(routeSrc), "the route does not even import partnerOfferRegistry.js — it has no way to reach a destination URL");
// self-test: prove the comment-strip actually matters (the route's own prose
// would otherwise fail this exact assertion).
ok(/\bdestination\b/.test(routeSrc) && !/\.destination\b/.test(routeCode), "self-test: the route's header prose DOES say \"destination\" (proving the naive word-match would have false-failed) while the CODE never reads .destination");

console.log(fail
  ? `check-menu-partner-offers: FAIL — ${fail} failed, ${pass} passed`
  : `check-menu-partner-offers: OK — ${pass} assertions (${MENU_PARTNER_OFFERS.length} rows, ${registryKeys.length} PARTNER_OFFER_REGISTRY keys all accounted for, metro gate + empty-by-law chips verified by call, import boundary swept across ${appFiles.length + libFiles.length} files)`);
process.exit(fail ? 1 : 0);
