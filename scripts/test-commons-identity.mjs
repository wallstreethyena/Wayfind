#!/usr/bin/env node
// scripts/test-commons-identity.mjs — hermetic regression lock for the
// 2026-09-17 wrong-place audit of the free permanent-photo lane's identity
// verification (lib/commonsPhotos.js).
//
// THE INCIDENT. Production carried 23 ACTIVE free photos that were plainly
// another place, not the venue they were attached to: Blue Ridge Park served
// a Blue Ridge PARKWAY road shield; Château 13 (a restaurant) served the
// Château Frontenac hotel in Quebec City; Congo River Rapids served an
// aerial photo of the actual Congo river in Africa; The Pinery (Orlando)
// served a Commons file literally titled "The Pinery, Colorado"; Dezerland
// Park Orlando served a celebrity red-carpet photo from an unrelated event.
// All 23 have since been hand-rejected in the database — this file is the
// CODE fix, so the same shape of mismatch cannot re-accumulate.
//
// THE GENERAL FAILURE MODE (found by reading lib/commonsPhotos.js's
// verifyCommonsFileIdentity, the ONE function every accepted Commons file
// must clear). Distinctive-TOKEN overlap was treated as sufficient evidence
// on its own, three separate ways:
//   1. The full name-token check ("does every distinctive token of the place
//      appear somewhere") searched a BROAD hay — title, description,
//      ObjectName, AND categories — even though the module's own header
//      already states the rule should be "TITLE or ObjectName... not only a
//      caption or category." A file merely CATEGORISED under the place's
//      home city/state (not depicting the venue) could complete an
//      otherwise-unmet token requirement through that gap alone.
//   2. Nothing ever checked for a CONFLICTING location word sitting right
//      there in the same title — a "Blue Ridge PARKWAY" and a "Blue Ridge
//      PARK" share both of their distinctive tokens, and nothing flagged
//      that the file is unmistakably about something else (a road spanning
//      two states the inventory place is never actually in).
//   3. A short/generic name (<=2 distinctive tokens: "Al Lopez Park" ->
//      "lopez") whose file merely mentioned the RIGHT city earned the loose
//      15-mile metro geo gate instead of the tight 2-mile campus radius —
//      "same city, coincidentally close, different building entirely" (Al
//      Lopez Park vs. the old Al Lopez Field) sailed through.
//   4. Nothing ever ruled out a file that is not a photo of a PLACE at all —
//      a road shield/logo/flag/coat-of-arms/map, or a photograph whose real
//      subject is a PERSON (a Wikipedia biography's infobox portrait, or a
//      Commons file categorised "Living people"/"... players"/"... births").
//
// THE FIX (lib/commonsPhotos.js, minimal, all documented at the call site):
//   a. The full name-token check now uses the SAME narrow title+ObjectName
//      hay the title gate already uses — closing (1).
//   b. New CONFLICTING_LOCATION_TOKENS (every US state's distinctive word,
//      plus the specific non-Florida cities/countries this audit's false
//      positives named) + conflictingLocationToken(), run immediately
//      before EVERY accept path — closing (2). It only ever turns a
//      would-have-accepted case into a rejection; an existing correct
//      rejection (geo mismatch, branch mismatch, ...) keeps its own reason.
//   c. The short-brand branch check no longer exempts a file that merely
//      names the right city from the tight 2-mile radius — closing (3).
//   d. New COMMONS_NON_PLACE_MEDIA_RX / COMMONS_PERSON_CATEGORY_RX +
//      conflictingVenueType() (a venue-TYPE word the file's title uses that
//      the place's own name never uses at all — "park" vs. "field"), also
//      run immediately before every accept path — closing (4).
//   e. Business/food generic words (restaurant, cafe, bar, ...) and a few
//      more venue-type nouns (cove, zoo, stadium, arena, ...) were added to
//      GENERIC_PLACE_TOKENS, matching the treatment "theatre"/"marina"/"bay"
//      already had — a place like "Lenny's Restaurant" no longer counts
//      "restaurant" as if it proved anything.
//   f. The Wikipedia lead-image path (steps 3-4 of findCommonsPhoto), which
//      previously trusted an already article-identity-verified page's lead
//      image with ZERO file-level check, now refuses a lead image whose
//      FILENAME matches COMMONS_NON_PLACE_MEDIA_RX and falls through to
//      Commons-direct exactly like "no usable lead image" — never a
//      permanent identity rejection, since the ARTICLE may still be right.
//
// Every correct match this audit confirmed (Epcot, Siesta Key Beach,
// Caspersen Beach, Ringling Museum, and — gated to the wiki-lead-image path
// only — Busch Gardens Tampa Bay's "Edge-of-africa-giraffes") is a passing
// positive control below, proving none of the above tightened anything a
// genuine match needs.
//
// HERMETIC: pure-function tests against lib/commonsPhotos.js's exports, plus
// one end-to-end findCommonsPhoto run per audited path with an injected
// fetch (no real network, no real database). Run standalone:
// `node scripts/test-commons-identity.mjs`.
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  verifyCommonsFileIdentity,
  findCommonsPhoto,
  CONFLICTING_LOCATION_TOKENS,
  COMMONS_NON_PLACE_MEDIA_RX,
  COMMONS_PERSON_CATEGORY_RX,
} from "../lib/commonsPhotos.js";

let failures = 0;
const fail = (m) => { console.error("test-commons-identity: FAIL — " + m); failures++; };
const ok = (c, m) => { if (!c) fail(m); };
const eq = (a, b, m) => { if (a !== b) fail(m + ` (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); };

function reject(name, place, file, msg) {
  const r = verifyCommonsFileIdentity(place, file);
  ok(!r.ok, `${msg || name}: must be REJECTED (got ${JSON.stringify(r)})`);
  return r;
}
function accept(name, place, file, msg) {
  const r = verifyCommonsFileIdentity(place, file);
  ok(!!r.ok, `${msg || name}: must be ACCEPTED (got ${JSON.stringify(r)})`);
  return r;
}

// ── A — pure sanity on the new exports ──────────────────────────────────
ok(CONFLICTING_LOCATION_TOKENS instanceof Set && CONFLICTING_LOCATION_TOKENS.size > 40, "A1: CONFLICTING_LOCATION_TOKENS is a sizeable Set (every US state + the audited non-Florida cities/countries)");
for (const t of ["colorado", "georgia", "texas", "toronto", "bronx", "lansing", "quebec", "kisangani"]) {
  ok(CONFLICTING_LOCATION_TOKENS.has(t), `A2: CONFLICTING_LOCATION_TOKENS includes "${t}" (named in the audited false positives)`);
}
for (const t of ["florida", "sarasota", "tampa", "orlando", "africa"]) {
  ok(!CONFLICTING_LOCATION_TOKENS.has(t), `A3: CONFLICTING_LOCATION_TOKENS never includes "${t}" — Wayfind's own market, or Busch Gardens' legitimate "Edge of Africa" theming, must never be flagged`);
}
for (const s of ["File:Blue Ridge Parkway shield.svg", "A city logo.png", "State seal of Florida.svg", "US Route 41 road sign.jpg", "Highway 101 route map.jpg", "Jane Doe portrait.jpg", "Concert headshot.jpg", "Booking mugshot.jpg", "Band album cover.jpg", "1980s postage stamp.jpg", "Team mascot.jpg"]) {
  ok(COMMONS_NON_PLACE_MEDIA_RX.test(s), `A4: COMMONS_NON_PLACE_MEDIA_RX matches ${JSON.stringify(s)}`);
}
for (const s of ["File:Sarasota FL Asolo Rep Theatre01.jpg", "Painted bunting at Celery Fields.jpg", "Edge-of-africa-giraffes.jpg", "Spaceship Earth, EPCOT.jpg"]) {
  ok(!COMMONS_NON_PLACE_MEDIA_RX.test(s), `A5 (negative control): COMMONS_NON_PLACE_MEDIA_RX must NOT match a genuine place photo title ${JSON.stringify(s)}`);
}
for (const s of ["Category:Living people", "Category:1990 births", "Category:Welsh rugby union players", "American actors", "People from Cardiff"]) {
  ok(COMMONS_PERSON_CATEGORY_RX.test(s), `A6: COMMONS_PERSON_CATEGORY_RX matches ${JSON.stringify(s)}`);
}
ok(!COMMONS_PERSON_CATEGORY_RX.test("Category:Museums in Florida"), "A7 (negative control): a museum category is never read as a person category");

// ── B — every real false positive from the audit: must be REJECTED ─────
// Each place carries an explicit `city` (the parenthetical Wayfind gave
// alongside the venue) so the no-file-geo "city_and_name" path — the most
// permissive path in the module, and the one every one of these actually
// slipped through — is genuinely exercised, not skipped for lack of a city
// to check against.
reject("Blue Ridge Park", { name: "Blue Ridge Park", city: "Sarasota" }, { title: "File:Blue Ridge Parkway shield.svg" });
reject("Bottle House Bar", { name: "Bottle House Bar", city: "Sarasota" }, { title: "File:Bottle Street Block.jpg" });
reject("Château 13", { name: "Château 13", city: "Sarasota" }, { title: "File:Château Frontenac 02.jpg" });
reject("Eureka Springs Park", { name: "Eureka Springs Park", city: "Sarasota" }, { title: "File:Eurekaandsuch 291.jpg", categories: ["Category:Eureka Springs, Arkansas"] });
reject("John Williams Park", { name: "John Williams Park", city: "Sarasota" }, { title: "File:John Williams Walker.jpg", categories: ["Category:Living people", "Category:Welsh rugby union players"] });
reject("Lenny's Restaurant", { name: "Lenny's Restaurant", city: "Sarasota" }, { title: "File:Lundys near jeh.jpg" });
reject("Morgan's Cove", { name: "Morgan's Cove", city: "Sarasota" }, { title: "File:Morgan's Spring WV1.jpg" });
reject("Potter Park (Sarasota)", { name: "Potter Park", city: "Sarasota" }, { title: "File:PotterParkZoo Lansing RoadSign.jpg" });
reject("Sneaky D's (St Pete)", { name: "Sneaky D's", city: "St. Petersburg" }, { title: "File:Sneaky Dee's Toronto, July 5 2026 (01) (cropped).jpg" });
reject("The Hub Bar (Tampa)", { name: "The Hub Bar", city: "Tampa" }, { title: "File:The Hub - East 149th Street, The Bronx.jpg" });
reject("The Pinery (Orlando)", { name: "The Pinery", city: "Orlando" }, { title: "File:The Pinery, Colorado.jpg" });
reject("Bella's Italian Cafe", { name: "Bella's Italian Cafe", city: "Sarasota" }, { title: "File:Lents, Portland, Oregon (August 17, 2022).jpg" });
reject("Marine Mammal Center (Sarasota)", { name: "Marine Mammal Center", city: "Sarasota" }, { title: "File:Marin Marine Mammal Center.jpg" });
reject("Central Cafe", { name: "Central Cafe", city: "Sarasota" }, { title: "File:Central kalacs 44160.jpg" });
reject("Congo River Rapids", { name: "Congo River Rapids", city: "Orlando" }, { title: "File:Aerial view of the Congo River near Kisangani.jpg" });
{
  // Al Lopez Park — the one FP whose real-world location genuinely sits a
  // few hundred feet from the wrong file's, so it is exercised with file
  // GPS to prove the tight-radius / venue-type checks (not merely "no
  // geo") are what catch it.
  const r = reject(
    "Al Lopez Park",
    { name: "Al Lopez Park", city: "Tampa", lat: 27.955, lng: -82.505 },
    { title: "File:Al Lopez Field, Tampa.jpg", lat: 27.958, lng: -82.51 }
  );
  eq(r.reason, "identity_conflicting_venue_type", "B (Al Lopez Park): rejected specifically for naming a different KIND of venue (Field, not Park) — not merely a coincidence of geo");
}
reject("Alafia River State Park", { name: "Alafia River State Park", city: "Tampa" }, { title: "File:Alafia River near Lithia Springs Park.jpg" });
reject("Panther Park", { name: "Panther Park", city: "Tampa" }, { title: "File:Fort Worth ballparks 1925 11 11.jpg" });
reject("Psomi (restaurant)", { name: "Psomi", city: "Sarasota" }, { title: "File:Kastellorizo-Psomi-04.jpg" });
reject("Ortygia (restaurant)", { name: "Ortygia", city: "Sarasota" }, { title: "File:Ortigia dall'alto.jpg" });
reject("Dog park", { name: "Dog park", city: "Sarasota" }, { title: "File:Tompkins Square Big Dog Run.jpg" });
reject("Stone Mountain Park (Brazil metro)", { name: "Stone Mountain Park" }, { title: "File:Stone Mountain Aerial.jpg", categories: ["Category:Stone Mountain, Georgia"] });
reject("Dezerland Park Orlando", { name: "Dezerland Park Orlando", city: "Orlando" }, { title: "File:Chad Michael Murray at Decades Days Orlando 2025.jpg" });
reject("Holmes Beach", { name: "Holmes Beach" }, { title: "File:Manatee County, Florida location map.svg" });

console.log("test-commons-identity: Section B OK — all 23 audited wrong-place false positives are rejected end-to-end by verifyCommonsFileIdentity");

// ── C — every real CORRECT match from the audit: must still be ACCEPTED ──
accept("Epcot", { name: "Epcot", city: "Orlando", lat: 28.3747, lng: -81.5494 }, { title: "File:Spaceship Earth, EPCOT.jpg", lat: 28.3747, lng: -81.5494 });
accept("Siesta Key Beach", { name: "Siesta Key Beach", city: "Siesta Key", lat: 27.267, lng: -82.553 }, { title: "File:Siesta Beach looking north.jpg", lat: 27.267, lng: -82.553 });
accept("Caspersen Beach", { name: "Caspersen Beach", city: "Venice", lat: 27.0998, lng: -82.4543 }, { title: "File:Caspersen Beach, Venice I.jpg", lat: 27.0998, lng: -82.4543 });
accept("Ringling Museum", { name: "Ringling Museum", city: "Sarasota", lat: 27.3847, lng: -82.5603 }, { title: "File:Ringling Museum entrance main facade Sarasota Florida.jpg", lat: 27.3847, lng: -82.5603 });

// Congo River Rapids' OWN attraction name contains "congo" — a legitimate
// photo of THAT actual mini-golf course must never be refused just because
// "congo" also happens to sit in CONFLICTING_LOCATION_TOKENS (a place is
// always exempt from a location word that is part of its own name/city).
accept(
  "Congo River Rapids (own photo, positive control)",
  { name: "Congo River Rapids", city: "Orlando", lat: 28.44, lng: -81.47 },
  { title: "File:Congo River Rapids mini golf, Orlando.jpg", lat: 28.44, lng: -81.47 }
);

console.log("test-commons-identity: Section C OK — every audited correct match still accepts, and a place is never penalised for its own name");

// ── D — Busch Gardens Tampa Bay: accepted ONLY via the wiki lead-image path ──
{
  const BUSCH = { name: "Busch Gardens Tampa Bay", city: "Tampa", lat: 28.0367, lng: -82.4198 };
  const direct = verifyCommonsFileIdentity(BUSCH, { title: "File:Edge-of-africa-giraffes.jpg" });
  ok(!direct.ok, `D1: Commons-direct (title-token matching alone) must NOT accept "Edge-of-africa-giraffes" for Busch Gardens Tampa Bay — it carries neither "busch" nor "tampa" (got ${JSON.stringify(direct)})`);

  function jsonResponse(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }
  function makeFetch({ opensearch, pageInfo, pageImages, commons }) {
    const calls = [];
    const fetchImpl = async (url) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("action=opensearch")) return jsonResponse(200, opensearch);
      if (u.includes("prop=pageimages")) return jsonResponse(200, pageImages);
      if (u.includes("prop=pageprops")) return jsonResponse(200, pageInfo);
      if (u.includes("commons.wikimedia.org") && u.includes("prop=imageinfo")) return jsonResponse(200, commons);
      throw new Error("test-commons-identity: unfixtured fetch call: " + u);
    };
    return { fetchImpl, calls };
  }
  function commonsInfo(filename, extmetadata) {
    return {
      query: {
        pages: {
          "-1": {
            title: "File:" + filename,
            imageinfo: [{
              url: "https://upload.wikimedia.org/wikipedia/commons/a/aa/" + filename,
              width: 1200,
              height: 800,
              descriptionurl: "https://commons.wikimedia.org/wiki/File:" + filename,
              extmetadata,
            }],
          },
        },
      },
    };
  }
  const FREE_META = {
    Artist: { value: "A photographer" },
    License: { value: "cc-by-sa-4.0" },
    LicenseShortName: { value: "CC BY-SA 4.0" },
    ImageDescription: { value: "Edge of Africa exhibit, Busch Gardens Tampa Bay" },
  };
  const { fetchImpl, calls } = makeFetch({
    opensearch: ["Busch Gardens Tampa Bay", ["Busch Gardens Tampa Bay"], [""], ["https://en.wikipedia.org/wiki/Busch_Gardens_Tampa_Bay"]],
    pageInfo: {
      query: {
        pages: {
          111: {
            title: "Busch Gardens Tampa Bay",
            pageprops: {},
            coordinates: [{ lat: 28.0367, lon: -82.4198 }],
            categories: [{ title: "Category:Zoos in Florida" }],
            extract: "Busch Gardens Tampa Bay is a zoo and theme park in Tampa, Florida.",
          },
        },
      },
    },
    pageImages: { query: { pages: { 111: { pageimage: "Edge-of-africa-giraffes.jpg", original: { source: "https://upload.wikimedia.org/wikipedia/commons/a/aa/Edge-of-africa-giraffes.jpg", width: 1600, height: 1200 } } } } },
    commons: commonsInfo("Edge-of-africa-giraffes.jpg", FREE_META),
  });
  const photo = await findCommonsPhoto(BUSCH, { fetch: fetchImpl });
  ok(!!photo, `D2: the SAME file is accepted end-to-end when it is found via the place's own Wikipedia lead image (reason chain not identity, article already verified) — got null`);
  ok(photo && /Edge.?of.?africa/i.test(photo.source_ref || ""), `D2: the accepted photo really is the Edge of Africa file (got ${photo && photo.source_ref})`);
  ok(calls.some((u) => u.includes("prop=pageimages")), "D2: the wiki lead-image lookup actually ran (this really is the wiki path, not a coincidence)");
  ok(!calls.some((u) => u.includes("list=search")), "D2: Commons-direct never ran — the wiki path resolved the lead image directly, exactly the gated path the task requires");
}

console.log("test-commons-identity: Section D OK — Busch Gardens Tampa Bay's real photo is accepted only via its own Wikipedia lead image, never via loose Commons-direct title matching");

// ── E — the Wikipedia lead-image path refuses a non-place lead image and
//      falls through to Commons-direct instead of trusting it blindly ──
{
  function jsonResponse(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }
  const PLACE = { name: "Blue Ridge Park", city: "Sarasota" };
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes("action=opensearch")) return jsonResponse(200, ["Blue Ridge Park", ["Blue Ridge Parkway"], [""], ["https://en.wikipedia.org/wiki/Blue_Ridge_Parkway"]]);
    if (u.includes("prop=pageimages")) return jsonResponse(200, { query: { pages: { 1: { pageimage: "Blue_Ridge_Parkway_shield.svg", original: { source: "https://upload.wikimedia.org/wikipedia/commons/a/aa/Blue_Ridge_Parkway_shield.svg", width: 400, height: 400 } } } } });
    if (u.includes("prop=pageprops")) {
      return jsonResponse(200, { query: { pages: { 1: { title: "Blue Ridge Parkway", pageprops: {}, categories: [{ title: "Category:Parkways in the United States" }], extract: "The Blue Ridge Parkway is a scenic parkway." } } } });
    }
    if (u.includes("list=search")) return jsonResponse(200, { query: { search: [] } });
    throw new Error("test-commons-identity: unfixtured fetch call: " + u);
  };
  const photo = await findCommonsPhoto(PLACE, { fetch: fetchImpl });
  ok(photo === null, `E1: a road-shield lead image must never be attached to Blue Ridge Park, even when the ARTICLE title clears identity (got ${JSON.stringify(photo)})`);
}
console.log("test-commons-identity: Section E OK — a non-place (shield/logo/portrait) Wikipedia lead image is refused and falls through instead of being trusted blindly");

// ── F — RED-PROOFS. Each mutates ONE real fix in a temp copy of the source
//      and proves a fixture this file locks GREEN goes RED — never run
//      against the real file on disk. ──
const srcPath = fileURLToPath(new URL("../lib/commonsPhotos.js", import.meta.url));
const realSrc = readFileSync(srcPath, "utf8");

async function loadMutant(mutatedSrc) {
  const rewritten = mutatedSrc.replace(/from "\.\/popularity\.js"/, `from ${JSON.stringify(new URL("../lib/popularity.js", import.meta.url).href)}`);
  const tmp = join(mkdtempSync(join(tmpdir(), "wf-commons-identity-mut-")), "commonsPhotos.mjs");
  writeFileSync(tmp, rewritten);
  try {
    return await import(pathToFileURL(tmp).href + `?t=${Date.now()}`);
  } finally {
    try { unlinkSync(tmp); } catch { /* tmp cleanup */ }
  }
}

{
  // F1 — hay-narrowing. Restore the OLD broad hay (title+description+
  // ObjectName+categories) for the full name-token check. A file merely
  // CATEGORISED under a conflicting place name must then complete an
  // otherwise-unmet token and be accepted — the exact Eureka Springs shape.
  const ANCHOR = '  const hay = new Set(normTokens([file.title || file.filename || "", file.objectName || ""].join(" ")));\n\n  const missing = needed.filter((t) => !tokenMatches(t, hay));';
  ok(realSrc.includes(ANCHOR), "F1 MUTATION ANCHOR: the narrow-hay line is present so this red-proof can actually land");
  const mutated = realSrc.replace(
    ANCHOR,
    '  const hay = new Set(normTokens([file.title || file.filename || "", file.description || "", file.objectName || "", ...(Array.isArray(file.categories) ? file.categories : [])].join(" ")));\n\n  const missing = needed.filter((t) => !tokenMatches(t, hay));'
  );
  ok(mutated !== realSrc, "F1: the mutation actually changed the source");
  const M = await loadMutant(mutated);
  const r = M.verifyCommonsFileIdentity(
    { name: "Warble Falls Park", city: "Sarasota" },
    { title: "File:Warble scenic overlook, Sarasota.jpg", categories: ["Category:Warble Falls"] }
  );
  ok(r.ok === true, `F1 RED: reverting to the broad hay lets a category-only token complete the match and ACCEPT — this is the exact leak the fix closes (got ${JSON.stringify(r)})`);
  const fixed = verifyCommonsFileIdentity(
    { name: "Warble Falls Park", city: "Sarasota" },
    { title: "File:Warble scenic overlook, Sarasota.jpg", categories: ["Category:Warble Falls"] }
  );
  ok(fixed.ok === false, "F1 (control): the REAL, unmutated code correctly rejects the same fixture");
}

{
  // F2 — guardAgainstWrongEntity. Neutralise both call sites (conflicting
  // location, conflicting venue type, non-place media all live behind this
  // one function) and prove Al Lopez Park's real false positive — a venue-
  // type conflict a few hundred feet away — is accepted once it is gone.
  const CALL = "    const wrongEntity = guardAgainstWrongEntity(place, file, hay);\n    if (wrongEntity) return { ok: false, reason: wrongEntity, dist };\n    return { ok: true, confidence: 0.95, reason: \"geo_and_name\" };";
  ok(realSrc.includes(CALL), "F2 MUTATION ANCHOR: the geo_and_name guard call is present so this red-proof can actually land");
  const mutated = realSrc.replace(CALL, '    return { ok: true, confidence: 0.95, reason: "geo_and_name" };');
  ok(mutated !== realSrc, "F2: the mutation actually changed the source");
  const M = await loadMutant(mutated);
  const r = M.verifyCommonsFileIdentity(
    { name: "Al Lopez Park", city: "Tampa", lat: 27.955, lng: -82.505 },
    { title: "File:Al Lopez Field, Tampa.jpg", lat: 27.958, lng: -82.51 }
  );
  ok(r.ok === true, `F2 RED: removing the wrong-entity guard on the geo path lets Al Lopez Field attach to Al Lopez Park — the exact "same city, different building" false positive (got ${JSON.stringify(r)})`);
  const fixed = verifyCommonsFileIdentity(
    { name: "Al Lopez Park", city: "Tampa", lat: 27.955, lng: -82.505 },
    { title: "File:Al Lopez Field, Tampa.jpg", lat: 27.958, lng: -82.51 }
  );
  ok(fixed.ok === false, "F2 (control): the REAL, unmutated code correctly rejects the same fixture");
}

{
  // F3 — the short-brand tight-radius fix. Restore the `!titleHasCity &&`
  // exemption and prove a short/generic name whose file merely mentions the
  // right city (no venue-type or location conflict at all) is accepted at
  // the loose 15-mile gate instead of being held to the tight 2-mile one.
  const ANCHOR = "    if (!branchToks.length && shortBrand && dist > COMMONS_BRANCH_GEO_MI) {";
  ok(realSrc.includes(ANCHOR), "F3 MUTATION ANCHOR: the tightened short-brand geo check is present so this red-proof can actually land");
  const mutated = realSrc.replace(ANCHOR, "    if (!branchToks.length && shortBrand && !titleHasCity && dist > COMMONS_BRANCH_GEO_MI) {");
  ok(mutated !== realSrc, "F3: the mutation actually changed the source");
  const M = await loadMutant(mutated);
  const PLACE = { name: "Lopez Landing", city: "Tampa", lat: 27.95, lng: -82.45 };
  const FILE = { title: "File:Lopez Landing dock, Tampa.jpg", lat: 27.98, lng: -82.48 }; // ~3mi away — inside 15mi, outside the 2mi campus radius
  const before = verifyCommonsFileIdentity(PLACE, FILE);
  ok(before.ok === false, `F3 (control): the REAL, unmutated code rejects a short/generic name ~3mi from a same-city file (got ${JSON.stringify(before)})`);
  const r = M.verifyCommonsFileIdentity(PLACE, FILE);
  ok(r.ok === true, `F3 RED: restoring the titleHasCity exemption accepts the same ~3mi file purely because its title happens to name the right city — this is the "coincidentally close, different building" gap the fix closes (got ${JSON.stringify(r)})`);
}

console.log("test-commons-identity: Section F OK — all three red-proofs land: hay-narrowing, the wrong-entity guard, and the short-brand tight-radius fix are each load-bearing");

if (failures) {
  console.error(`test-commons-identity: FAIL — ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log(
  "test-commons-identity: OK — all 23 audited wrong-place false positives are rejected, every audited correct match (Epcot, Siesta Key Beach, Caspersen Beach, Ringling Museum, Busch Gardens Tampa Bay via its own wiki lead image only) still accepts, a place is never penalised for its own name, a non-place Wikipedia lead image falls through instead of being trusted blindly, and 3 red-proofs confirm the new checks are load-bearing"
);
