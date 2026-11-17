#!/usr/bin/env node
// Every guide and blog place or event recommendation needs a full street
// address and a Google Maps link. Advice with no venue is not a place.
// Addresses are never invented: a recommendation that cannot be verified fails.
import { readFileSync } from "node:fs";
import { GUIDES } from "../lib/guides.js";
import { GUIDE_PLACE_RAILS } from "../lib/guidePlaceRails.js";
import { FLORIDA_FALL_GUIDE_EVENTS_2026 } from "../lib/floridaFallGuide2026.js";
import { DEDICATED_GUIDE_ROUTES } from "../lib/guideDedicatedRoutes.js";
import {
  guideMapsUrl,
  guideWhereForRecord,
  isFullStreetAddress,
  pickNeedsStreetAddress,
} from "../lib/guidePlaceAddress.js";

const fail = (m) => { console.error("check-guide-place-addresses: FAIL — " + m); process.exit(1); };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

const page = strip(readFileSync(new URL("../app/guides/[slug]/page.js", import.meta.url), "utf8"));
const whereFile = readFileSync(new URL("../app/guides/[slug]/GuidePickWhere.js", import.meta.url), "utf8");
const fall = strip(readFileSync(new URL("../app/guides/florida-fall-festivals-2026/page.js", import.meta.url), "utf8"));
const pintos = strip(readFileSync(new URL("../app/guides/pintos-farm-miami-2026/page.js", import.meta.url), "utf8"));

if (!page.includes("<GuidePickWhere")) fail("guide article does not render the address line");
if (!page.includes("guidePickWhere(pick, params.slug)")) fail("guide picks do not resolve their own address");
if (!page.includes("guidePickWhere({ name: place.name, placeId: place.id }")) fail("guide place rails do not resolve an address");
if (!whereFile.includes('rel="noopener noreferrer"')) fail("directions link is missing noopener");
if (!whereFile.includes(">Directions<")) fail("directions link is missing its label");
if (!/https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/.test(readFileSync(new URL("../lib/guidePlaceAddress.js", import.meta.url), "utf8"))) {
  fail("maps links are not built as Google Maps search URLs");
}
if (!fall.includes("<GuidePickWhere")) fail("fall guide cards do not render the address line");
if (!fall.includes("where.mapsUrl")) fail("fall guide lists do not link the address to maps");
if (!pintos.includes("<GuidePickWhere")) fail("Pinto's Farm guide does not render the address line");
if (DEDICATED_GUIDE_ROUTES.size < 1) fail("dedicated guide route set is empty");

const gaps = [];
let checked = 0;
function need(label, record, slug) {
  checked++;
  const where = guideWhereForRecord(record, { slug });
  if (!where || !where.mapsUrl) {
    gaps.push(label);
    return;
  }
  if (where.address) {
    if (!isFullStreetAddress(where.address)) gaps.push(label + " (address is not a full street line)");
    const again = guideMapsUrl({ name: record.name || record.event_name || record.venue, address: where.address, placeId: where.placeId || record.placeId || record.place_id });
    if (again !== where.mapsUrl) gaps.push(label + " (maps link drifted)");
    return;
  }
  if (where.reviewed !== true || !where.mapsUrl.includes("query_place_id=")) gaps.push(label + " (no street address and no reviewed place map)");
}

for (const [slug, guide] of Object.entries(GUIDES)) {
  for (const pick of guide.picks || []) {
    if (!pickNeedsStreetAddress(pick)) continue;
    need(`/guides/${slug} :: ${pick.name}`, pick, slug);
  }
}
for (const [slug, rail] of Object.entries(GUIDE_PLACE_RAILS)) {
  for (const market of rail.markets || []) {
    for (const item of market.items || []) {
      need(`/guides/${slug} rail :: ${item.name}`, { name: item.name, placeId: item.placeId }, slug);
    }
  }
}
for (const event of FLORIDA_FALL_GUIDE_EVENTS_2026) {
  need(`/guides/florida-fall-festivals-2026 :: ${event.event_name}`, {
    name: event.venue || event.event_name,
    placeId: event.place_id,
    address: event.address,
    event_name: event.event_name,
    pickKey: `florida-fall-festivals-2026\t${event.event_name}`,
  });
}

if (gaps.length) {
  console.error(`check-guide-place-addresses: FAIL — ${gaps.length} of ${checked} place recommendations have no verified full address and maps link`);
  for (const gap of gaps.slice(0, 40)) console.error("  " + gap);
  if (gaps.length > 40) console.error(`  … ${gaps.length - 40} more`);
  process.exit(1);
}
console.log(`check-guide-place-addresses: OK — ${checked} place and event recommendations have a full address and a Google Maps link`);
