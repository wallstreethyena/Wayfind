// Execute retirement at the actual Eastern midnight, including the Nov 1
// DST change. No network, credentials, build clock, or registry deletion.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { FALL_OFFERING_ENDS, fallOfferingDateLive, fallOfferingRetired } from "../lib/fallOfferingDates.js";
import { FALL_OFFERING_SOURCES } from "../lib/fallPool.js";
import { FALL_CARD_IDS, fallCardClass, fallShareLine } from "../lib/fallSkin.js";
import { fallPlaceEvidenceCurrent } from "../lib/fallPlaceEvidence.js";
import { siteTodayStr } from "../lib/siteTime.js";

const DEAD = "ChIJwZ_GK-d-54gRm5Ahg7PZYeY";
let count = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); count++; };
eq(FALL_OFFERING_ENDS, Object.fromEntries(Object.entries(FALL_OFFERING_SOURCES)
  .filter(([, entry]) => entry.until || entry.ends)
  .map(([id, entry]) => [id, entry.until || entry.ends])), "all published registry ends match the client-safe dates exactly");
eq(Object.isFrozen(FALL_OFFERING_ENDS), true, "published end map is immutable");

for (const [instant, today, live] of [
  ["2026-11-01T05:59:59Z", "2026-11-01", true], // before the clock repeats 1 AM
  ["2026-11-01T06:00:00Z", "2026-11-01", true], // EST begins
  ["2026-11-02T04:00:00Z", "2026-11-01", true], // still 11 PM EST
  ["2026-11-02T04:59:59Z", "2026-11-01", true],
  ["2026-11-02T05:00:00Z", "2026-11-02", false],
]) {
  eq(siteTodayStr(new Date(instant)), today, `venue-local date at ${instant}`);
  eq(fallOfferingDateLive(DEAD, today), live, `dated association at ${instant}`);
  eq(fallOfferingRetired(DEAD, today), !live, `automatic retirement at ${instant}`);
  eq(fallPlaceEvidenceCurrent(DEAD, today), live, `serve-time evidence at ${instant}`);
  eq(fallCardClass(DEAD, today), live ? " wf-fall-card" : "", `card skin at ${instant}`);
  eq(fallShareLine("Visit", DEAD, today), live ? "🍁 Visit" : "Visit", `share text at ${instant}`);
}
for (const [id, end] of Object.entries(FALL_OFFERING_ENDS)) {
  eq(fallOfferingDateLive(id, end), true, `${id} keeps its own final day`);
  eq(fallOfferingDateLive(id, "2026-11-30"), false, `${id} retires after its own dated end`);
  eq(fallCardClass(id, "2027-10-01"), "", `${id} cannot resurrect next fall`);
}
for (const invalid of [undefined, null, "", "2026-11-1", "2026-02-29", "2026-11-31", "0000-01-01", "2026-11-01T12:00:00Z", 20261101]) {
  eq(fallOfferingDateLive(DEAD, invalid), false, `malformed today cannot publish a dated offering: ${invalid}`);
  eq(fallOfferingRetired(DEAD, invalid), false, `malformed today cannot assert retirement: ${invalid}`);
}
const undated = [...FALL_CARD_IDS].find((id) => !Object.hasOwn(FALL_OFFERING_ENDS, id));
assert.ok(undated, "positive control: a real undated registry member exists");
eq(fallOfferingDateLive(undated, "2026-11-02"), true, "undated offering keeps normal eligibility");
eq(fallOfferingRetired(undated, "2026-11-02"), false, "undated offering is never date-retired");
eq(fallCardClass(undated, "2026-11-02"), " wf-fall-card", "healthy undated place keeps its fall skin");
eq(fallCardClass("unknown-fixture", "2026-11-01"), "", "unknown place cannot gain a fall association");

// Execute the actual metadata declarations with lookup dependencies stubbed;
// JSX is outside this section and no provider or Next runtime is needed.
const source = readFileSync(new URL("../app/p/[id]/page.js", import.meta.url), "utf8");
const start = source.indexOf("function s(v)");
const end = source.indexOf("export default async function PlaceSharePage");
assert.ok(start >= 0 && end > start, "metadata extraction finds the actual declarations");
const declaration = source.slice(start, end).replace("export async function generateMetadata", "async function generateMetadata");
let metadataToday = "2026-11-01";
const mutation = process.argv.includes("--mutation-control-child");
const skin = mutation ? () => " wf-fall-card" : fallCardClass;
const metadata = Function("getInventoryIdentity", "SITE_URL", "placeCanonical", "fallCardClass", "siteTodayStr", "durablePlaceUrl",
  `${declaration}\nreturn generateMetadata;`)(async () => ({ name: "Red Coconut Club" }), "https://www.gowayfind.com", () => null, skin, () => metadataToday, async () => null);
for (const [today, live] of [["2026-11-01", true], ["2026-11-02", false], ["2027-10-01", false]]) {
  metadataToday = today;
  const result = await metadata({ params: Promise.resolve({ id: DEAD }), searchParams: Promise.resolve({}) });
  eq(result.description.startsWith("Fall on Wayfind"), live, `actual share metadata drops ended association on ${today}`);
  eq(new URL(result.openGraph.images[0].url).searchParams.get("tone"), live ? "fall" : null, `actual OG tone on ${today}`);
}
if (!mutation) {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--mutation-control-child"], { encoding: "utf8" });
  eq(child.status, 1, "bypassing metadata date eligibility fails the actual expired-association assertion");
  assert.ok(child.stderr.includes("actual share metadata drops ended association on 2026-11-02"), "mutation fails the intended assertion");
}
console.log(`fall-offering-retirement PASS: ${count} assertions; published ends, Eastern/DST midnight, skin/share/evidence, actual metadata, historical retention, malformed dates; expired metadata mutation fails`);
