#!/usr/bin/env node
// Guards the hotel booking fail-closed gate (lib/hotelBookingVerification.js).
//
// Owner, 2026-09-23, pre-launch: "A hotel card may never send a user to a
// different hotel. Fewer booking buttons is acceptable. Incorrect booking
// buttons are not."
//
// These assertions exist because the failure they prevent is silent: a wrong
// booking link looks identical to a right one until a user lands on a Dollar
// Tree. Each one fails if the gate is removed, widened, or bypassed.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
const failures = [];
const ok = (cond, label) => { if (cond) passed++; else failures.push(label); };

const { hotelGoUrl } = await import("../lib/affiliates.js");
const { isHotelBookingVerified, hotelBookingRecords, hotelBookingVerification } =
  await import("../lib/hotelBookingVerification.js");
// The SAME key function the evidence was generated with. Reimplementing the
// slug here would let the two drift apart and quietly empty E5/E6.
const { ownedHotelKey } = await import("../lib/ownedHotelExclusions.js");
const owned = JSON.parse(fs.readFileSync(path.join(ROOT, "lib/ownedHotels.json"), "utf8"));

// Two sources on purpose: the full 394-row audit record on disk, and the slim
// allow-list the app actually ships. E0 pins them together, so the shipped
// list can never drift from what was audited.
const RECORDS = JSON.parse(fs.readFileSync(path.join(ROOT, "lib/hotelBookingVerification.json"), "utf8"));
const SHIPPED = hotelBookingRecords();
const evidenceAllowed = RECORDS.filter((r) => r.allowed === true);
const ALLOWED = evidenceAllowed;
const allowedRec = ALLOWED[0];

const shippedKeys = new Set(SHIPPED.map((r) => r.key));
const evidenceKeys = new Set(evidenceAllowed.map((r) => r.key));
ok(shippedKeys.size === evidenceKeys.size && [...evidenceKeys].every((k) => shippedKeys.has(k)),
  `E0: the shipped allow-list is exactly the allowed rows of the audit record (shipped ${shippedKeys.size}, evidence ${evidenceKeys.size})`);
ok(SHIPPED.every((r) => r.placeId && typeof r.placeId === "string"),
  "E0b: every shipped entry carries the place id the gate requires");

// ---------------------------------------------------------------- V: the gate
ok(RECORDS.length > 300, `V1: the audit record covers the served library (got ${RECORDS.length})`);
ok(ALLOWED.length > 0, `V2: at least one hotel is verified, or the gate is vacuous (got ${ALLOWED.length})`);
ok(ALLOWED.length < RECORDS.length,
  `V3: the gate actually withholds buttons — allowed ${ALLOWED.length} of ${RECORDS.length}`);

// A real lodging card that has NO record must get NO link. This is the
// fail-closed property: absence of evidence is failure, not a pass.
const unknownLodging = {
  id: "wfh-this-card-was-never-verified-00000", name: "Some Beach Resort",
  address: "123 Gulf Dr", city: "Bradenton", lat: 27.47, lng: -82.7,
  types: ["lodging"],
};
ok(hotelGoUrl(unknownLodging, "Bradenton, FL") === null,
  "V4: a lodging card with no verification record gets no booking URL");
ok(isHotelBookingVerified(unknownLodging) === false,
  "V5: isHotelBookingVerified is false for an unknown card");

// A card whose record exists but says NOT allowed must also get no link.
const deniedRec = RECORDS.find((r) => r.allowed !== true);
ok(Boolean(deniedRec), "V6: the evidence file contains at least one denied record");
if (deniedRec) {
  const deniedOwned = owned.find((h) => ownedHotelKey(h) === deniedRec.key) || null;
  const denied = {
    id: deniedRec.key, name: deniedRec.resolved || "Denied Hotel",
    address: (deniedOwned && deniedOwned.address) || "1 Main St",
    city: "Bradenton", lat: 27.4, lng: -82.5, types: ["lodging"],
  };
  ok(hotelGoUrl(denied, "Bradenton, FL") === null,
    `V7: a card whose record says allowed:false gets no booking URL (${deniedRec.key})`);
  ok(isHotelBookingVerified(denied) === false, "V8: isHotelBookingVerified is false for a denied card");
}

// An allowed card must still produce a link, or the gate has broken revenue
// outright rather than protecting it.
if (allowedRec) {
  const row = owned.find((h) => h.gpid === allowedRec.placeId) || null;
  const good = {
    id: allowedRec.key, name: (row && row.name) || allowedRec.resolved,
    address: (row && row.address) || "1 Gulf Dr", city: (row && row.city) || "Bradenton",
    lat: (row && row.lat) || 27.47, lng: (row && row.lng) || -82.7, types: ["lodging"],
  };
  const url = hotelGoUrl(good, "Bradenton, FL");
  ok(typeof url === "string" && url.startsWith("/api/hotels/go?"),
    `V9: a verified card still earns its booking URL (${allowedRec.key}, got ${url})`);
  ok(isHotelBookingVerified(good) === true, "V10: isHotelBookingVerified is true for a verified card");
}

// The gate must be wired into hotelGoUrl itself, not a caller. hotelGoUrl is
// the one place a place becomes a booking URL (scripts/check-booking-cta.mjs),
// so gating anywhere else leaves the other callers open.
const affSrc = fs.readFileSync(path.join(ROOT, "lib/affiliates.js"), "utf8");
ok(/isHotelBookingVerified\s*\(\s*place\s*\)/.test(affSrc),
  "V11: hotelGoUrl calls isHotelBookingVerified(place) — the call, not just the import");

// ------------------------------------------------- S: server-side enforcement
// The redirect URL is shareable, so the route enforces the same rule.
const routeSrc = fs.readFileSync(path.join(ROOT, "app/api/hotels/go/route.js"), "utf8");
ok(/isHotelBookingVerified\s*\(\s*\{\s*id:\s*contentId\s*\}\s*\)/.test(routeSrc),
  "S1: /api/hotels/go checks the verification record for the card id it was given");
ok(routeSrc.indexOf("isHotelBookingVerified") < routeSrc.indexOf("stay22HotelRedirectUrl"),
  "S2: the verification check runs BEFORE the Stay22 destination is built");
ok(/unverified-property/.test(routeSrc),
  "S3: an unverified request fails with its own reason, so it is visible in telemetry");

// ------------------------------------------------ E: evidence file integrity
const GEO = /(,\s*(usa|united states)\s*$)|county|^\d+[a-z]?\s*,\s/i;
const CHAIN = new Set(["by","hilton","marriott","wyndham","radisson","ihg","choice","hotels",
  "resorts","collection","signature","bw","group","international","worldwide","ascend","an","llc","inc"]);
const norm = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const coreTokens = (s) => norm(s).split(" ").filter((t) => t && !CHAIN.has(t));

ok(RECORDS.every((r) => typeof r.key === "string" && r.key && typeof r.reason === "string" && r.reason),
  "E1: every record carries a card key and a reason");
ok(ALLOWED.every((r) => typeof r.placeId === "string" && r.placeId.length > 10),
  "E2: every allowed record is keyed to a stable place id, not just a display name");
ok(ALLOWED.every((r) => r.resolved && !GEO.test(r.resolved)),
  "E3: no allowed record resolved to a geocoded address instead of a property");
ok(ALLOWED.every((r) => /^exact-verified:(google|name)-identity$/.test(r.reason)),
  "E4: allowed records carry an exact-verified verdict and name which identity proved it");

// The displayed card name must not mislead: it is the resolved property name,
// or a subset of it. This is what stops a card still called "Holiday Inn River
// Front" from pointing at a Courtyard, same building or not.
const ownedByKey = new Map();
for (const h of owned) ownedByKey.set(ownedHotelKey(h), h);
const matchedAllowed = ALLOWED.filter((r) => ownedByKey.has(r.key));
ok(matchedAllowed.length === ALLOWED.length,
  `E4b: every allowed record resolves back to a library row, so E5/E6 inspect all of them (${matchedAllowed.length}/${ALLOWED.length})`);

let misleading = [];
for (const r of ALLOWED) {
  const h = ownedByKey.get(r.key);
  if (!h) continue;
  const shown = new Set(coreTokens(h.name));
  const prop = new Set(coreTokens(r.google || r.resolved));
  if (![...shown].every((t) => prop.has(t))) misleading.push(`${h.name} -> ${r.google || r.resolved}`);
}
ok(misleading.length === 0,
  `E5: no allowed card shows a name the destination property does not carry (${misleading.slice(0,3).join("; ")})`);

// Two cards sharing a name at different addresses cannot both be proven, so
// neither may keep a button.
const byName = new Map();
for (const h of owned) {
  const k = coreTokens(h.name).join(" ");
  if (!byName.has(k)) byName.set(k, new Set());
  byName.get(k).add(norm(h.address));
}
const ambiguousAllowed = ALLOWED.filter((r) => {
  const h = ownedByKey.get(r.key);
  return h && (byName.get(coreTokens(h.name).join(" ")) || new Set()).size > 1;
});
ok(ambiguousAllowed.length === 0,
  `E6: no allowed card shares its name with a card at another address (${ambiguousAllowed.map((r) => r.key).slice(0,3).join(", ")})`);

if (failures.length) {
  for (const f of failures) console.error(`✗ ${f}`);
  console.error(`check-hotel-booking-verified: ${failures.length} FAILED, ${passed} passed`);
  process.exit(1);
}
console.log(`check-hotel-booking-verified: OK — ${passed} assertions; ${ALLOWED.length} of ${RECORDS.length} hotels keep a booking button`);
