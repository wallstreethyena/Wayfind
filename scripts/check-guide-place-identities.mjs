#!/usr/bin/env node
// A guide card must resolve from an explicit place identity when its heading
// is editorial copy. Otherwise the same fuzzy title can either hide the card
// or attach an unrelated venue, as Mount Dora did with a boat operator.
import { GUIDES } from "../lib/guides.js";
import { readFileSync } from "node:fs";

const fails = [];
const ok = (condition, message) => { if (!condition) fails.push(message); };
const normalize = (value) => String(value || "").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
const pickKey = (slug, pickName) => `${slug}\u0000${pickName}`;

function identityIssues(pick) {
  const issues = [];
  if (!pick || typeof pick.appQuery !== "string" || !pick.appQuery.trim()) {
    issues.push("missing appQuery");
    return issues;
  }
  if (!Array.isArray(pick.exactNames) || !pick.exactNames.length) {
    issues.push("missing exactNames");
    return issues;
  }
  const aliases = pick.exactNames.map(normalize);
  if (!aliases.includes(normalize(pick.appQuery))) issues.push("appQuery is not an exact alias");
  if (new Set(aliases).size !== aliases.length) issues.push("duplicate exact alias");
  return issues;
}

function hasStrongIdentity(pick) {
  if (pick?.appQuery === null) return true;
  if (typeof pick?.placeId === "string" && pick.placeId) return true;
  return identityIssues(pick).length === 0;
}

// Global contract for every pick that opts into exact identity resolution.
for (const [slug, guide] of Object.entries(GUIDES)) {
  for (const pick of guide.picks || []) {
    if (!Array.isArray(pick.exactNames)) continue;
    for (const issue of identityIssues(pick)) fails.push(`${slug}: ${pick.name}: ${issue}`);
  }
}

// Existing picks that predate the strong identity contract are recorded once.
// A new pick cannot silently join this list: it needs a verified placeId,
// whole-name aliases, or a deliberate appQuery:null opt-out. Stale baseline
// entries also fail, so fixing an old pick requires removing its exception.
const baseline = JSON.parse(readFileSync(new URL("./fixtures/guide-place-identity-legacy.json", import.meta.url), "utf8"));
const legacyKeys = new Set();
ok(baseline.reason === "legacy_unreviewed", "legacy identity baseline needs the legacy_unreviewed reason");
for (const [guideSlug, names] of Object.entries(baseline.picks || {})) {
  for (const name of names) {
    const key = pickKey(guideSlug, name);
    ok(!legacyKeys.has(key), `duplicate legacy identity baseline entry: ${guideSlug}: ${name}`);
    legacyKeys.add(key);
  }
}
const currentLegacy = new Set();
for (const [guideSlug, guide] of Object.entries(GUIDES)) {
  for (const pick of guide.picks || []) {
    if (hasStrongIdentity(pick)) continue;
    const key = pickKey(guideSlug, pick.name);
    currentLegacy.add(key);
    ok(legacyKeys.has(key), `${guideSlug}: ${pick.name}: new pick needs placeId, whole-name aliases, or appQuery:null`);
  }
}
for (const key of legacyKeys) {
  ok(currentLegacy.has(key), `stale legacy identity baseline entry: ${key.replace("\u0000", ": ")}`);
}

// Fifteen IDs were read from wf_inventory during this repair; Blue Spring's
// ID was confirmed in wf_place_ids and its fresh details cache. Pinning the
// identity prevents a later headline edit or broad alias from quietly moving
// a card to a different venue while leaving the card count green.
const verifiedPlaceIds = new Map([
  [pickKey("things-to-do-orlando-not-theme-parks", "Airboat the Everglades headwaters"), "ChIJE1158xWa3YgRyxYmba83M0o"],
  [pickKey("things-to-do-orlando-not-theme-parks", "Winter Park scenic boat tour"), "ChIJ4XkjoBtw54gRGiqFxtWvbM8"],
  [pickKey("things-to-do-orlando-not-theme-parks", "Kayak a natural spring"), "ChIJw5hmHut154gRI1LE7BjQiEg"],
  [pickKey("things-to-do-orlando-not-theme-parks", "Watch a rocket launch"), "ChIJdeCS1uW54IgRqG67_UFPInI"],
  [pickKey("things-to-do-orlando-not-theme-parks", "Lake Eola and Thornton Park"), "ChIJu3hNU-N654gR0x0I9_3iNvc"],
  [pickKey("things-to-do-orlando-not-theme-parks", "ICON Park's wheel at night"), "ChIJU7bqHVV-54gRJAwZAp5qCpk"],
  [pickKey("things-to-do-orlando-not-theme-parks", "Kennedy Space Center Visitor Complex"), "ChIJiTHKxDOu4IgRgAU6btoqIsU"],
  [pickKey("things-to-do-orlando-not-theme-parks", "Blue Spring State Park in manatee season"), "ChIJyYEUav8P54gRatuv_zQzm20"],
  [pickKey("things-to-do-orlando-not-theme-parks", "Swim at Wekiwa Springs"), "ChIJd_yTxUh054gR9cGD0gI_yHw"],
  [pickKey("things-to-do-orlando-not-theme-parks", "Harry P. Leu Gardens"), "ChIJCRCYGrx654gR3G9qoVbWlpY"],
  [pickKey("things-to-do-orlando-not-theme-parks", "Day-trip to Mount Dora"), "ChIJGSMzu2Oi54gR-rlDDL6V3Qs"],
  [pickKey("things-to-do-orlando-not-theme-parks", "East End Market"), "ChIJz4eUs7N654gRiMJs2630XVc"],
  [pickKey("st-armands-circle-restaurants", "Café on St. Armands"), "ChIJ8_xGlpFqw4gRpBDnt0x_mdg"],
  [pickKey("best-restaurants-disney-springs", "Jaleo by José Andrés"), "ChIJ0_My9aR_3YgRQnilGsmaCps"],
  [pickKey("magical-dining-orlando-2026", "ÔMO by Jônt, Winter Park"), "ChIJO3PrEmdx54gRW1c11w1Yxlo"],
  [pickKey("magical-dining-orlando-2026", "Kaya, Mills 50"), "ChIJ3YuEdVp754gRoWwBx528kNc"],
]);
for (const [key, expectedId] of verifiedPlaceIds) {
  const separator = key.indexOf("\u0000");
  const guideSlug = key.slice(0, separator);
  const name = key.slice(separator + 1);
  const pick = (GUIDES[guideSlug]?.picks || []).find((candidate) => candidate.name === name);
  ok(pick?.placeId === expectedId, `${guideSlug}: ${name}: verified placeId changed or disappeared`);
}

// This guide exposed both failure modes. All twelve entries now name the
// intended inventory identity, including known-good controls, so future copy
// edits cannot silently turn their card lookup back into headline guessing.
const slug = "things-to-do-orlando-not-theme-parks";
const picks = GUIDES[slug]?.picks || [];
ok(picks.length === 12, `${slug}: expected 12 picks, found ${picks.length}`);
for (const pick of picks) {
  for (const issue of identityIssues(pick)) fails.push(`${slug}: ${pick.name}: ${issue}`);
}
const inventoryBacked = picks.filter((pick) => pick.placeId && !pick.inventoryStatus);
ok(inventoryBacked.length === 12, `${slug}: expected 12 inventory-backed place IDs, found ${inventoryBacked.length}`);

// Prove the validator can fail on the exact regression, rather than reporting
// green merely because the loop ran over no applicable data.
const mutation = { ...picks[0] };
delete mutation.appQuery;
ok(identityIssues(mutation).includes("missing appQuery"), "red proof: deleting appQuery was not detected");
ok(!hasStrongIdentity({ name: "New editorial pick" }), "red proof: a new pick with no identity metadata was accepted");

if (fails.length) {
  console.error(`check-guide-place-identities: FAIL\n  - ${fails.join("\n  - ")}`);
  process.exit(1);
}
console.log(`check-guide-place-identities: OK — 12 Orlando picks carry explicit whole-name identities and verified inventory IDs; ${legacyKeys.size} older weak identities are baselined; missing-appQuery mutation detected`);
