#!/usr/bin/env node
// Locks lib/licensedEventCovers.js (owner, 2026-11-06): a licensed cover only
// ships WITH its credit, on the exact event it was chosen for, and only fills a
// gap. Executes the real code paths (registry -> fetch readers -> feed shape ->
// the card's credit resolver) instead of grepping source.
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { LICENSED_EVENT_COVERS, withLicensedEventCover } from "../lib/licensedEventCovers.js";
import { curatedToFeedEvent, fetchCuratedEvents, fetchCuratedEventBySlug } from "../lib/curatedEvents.js";
import { eventPhotoCredit, eventImageIsVenue } from "../lib/eventImageProvenance.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const fail = (msg) => { failures++; console.error("  FAIL " + msg); };
const LICENCE = /(?:Public domain|CC0|CC BY(?:-SA)? \d\.\d)$/;
const credits = readFileSync(join(root, "public/events/CREDITS.md"), "utf8");

const ids = Object.keys(LICENSED_EVENT_COVERS);
if (ids.length < 1) fail("registry is empty; the probe would prove nothing");
for (const id of ids) {
  const c = LICENSED_EVENT_COVERS[id];
  const file = join(root, "public", c.src);
  if (!/^\/events\/[a-z0-9/-]+\.webp$/.test(c.src)) fail(`${id}: src must be a self-hosted /events/*.webp, got ${c.src}`);
  else if (!existsSync(file) || statSync(file).size < 10_000) fail(`${id}: ${c.src} missing or too small to be a real photo`);
  else if (readFileSync(file).subarray(8, 12).toString() !== "WEBP") fail(`${id}: ${c.src} is not a WebP file`);
  if (!credits.includes("`" + c.src.replace(/^\/events\//, "") + "`")) fail(`${id}: ${c.src} has no row in public/events/CREDITS.md`);
  if (!LICENCE.test(c.credit || "")) fail(`${id}: credit "${c.credit}" must end in its licence`);
  if (!/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(c.creditHref || "")) fail(`${id}: creditHref must be the Commons file page`);
  if (!["event", "venue"].includes(c.kind)) fail(`${id}: kind must be event or venue`);
  if (!c.alt || c.alt.length < 20) fail(`${id}: alt text missing`);
}

// Behaviour: fills a gap, never replaces, passes unknown ids through.
const [id0] = ids;
const cover0 = LICENSED_EVENT_COVERS[id0];
const bare = { event_id: id0, slug: id0, event_name: "Probe", short_title: "Probe", start_date: "2099-01-01", city: "Pensacola", card_hook: "Probe hook", hero_image: null };
const filled = withLicensedEventCover(bare);
if (filled.hero_image !== cover0.src) fail("a row with no hero did not get its licensed cover");
if (filled.photoAttr !== cover0.credit || filled.photoAttrHref !== cover0.creditHref) fail("the cover shipped without its credit");
const own = withLicensedEventCover({ ...bare, hero_image: "/events/own.webp" });
if (own.hero_image !== "/events/own.webp" || own.photoAttr) fail("a row with its own hero_image was overwritten (negative control)");
const other = { ...bare, event_id: "not-in-registry-2099" };
if (withLicensedEventCover(other) !== other) fail("an unregistered event was changed");

// The card path: feed shape -> RailCard's credit resolver.
for (const id of ids) {
  const c = LICENSED_EVENT_COVERS[id];
  const feed = curatedToFeedEvent(withLicensedEventCover({ ...bare, event_id: id, slug: id }));
  if (feed.image !== c.src) fail(`${id}: feed card image is ${feed.image}, expected the licensed cover`);
  const credit = eventPhotoCredit(feed.visitFacts, feed.image);
  if (!credit || credit.label !== c.credit || credit.href !== c.creditHref) fail(`${id}: the card would show the photo without its credit`);
  if (feed.imageIsVenue !== (c.kind === "venue") || eventImageIsVenue(feed.visitFacts, feed.image) !== (c.kind === "venue")) fail(`${id}: venue flag does not match kind=${c.kind}`);
}

// The readers: both database paths must apply it (assert on the call, with a fake reader).
function fakeReader(rows) {
  const chain = { select: () => chain, in: () => chain, or: () => chain, order: () => chain, eq: () => chain, retry: () => chain,
    abortSignal: () => chain, limit: async () => ({ data: rows, error: null }), range: async (a) => ({ data: a === 0 ? rows : [], error: null }),
    maybeSingle: async () => ({ data: rows[0], error: null, status: 200 }) };
  return { from: () => chain };
}
const dbRow = { ...bare, event_status: "scheduled", state: "FL", source_tier: 1, verification_confidence: "high", lat: 30.35, lng: -87.3 };
for (const [label, read] of [
  ["fetchCuratedEvents (paged)", async () => (await fetchCuratedEvents({ db: fakeReader([dbRow]), signal: null }))[0]],
  ["fetchCuratedEvents (limit)", async () => (await fetchCuratedEvents({ db: fakeReader([dbRow]), signal: null, limit: 5 }))[0]],
  ["fetchCuratedEventBySlug", async () => fetchCuratedEventBySlug(id0, { db: fakeReader([dbRow]) })],
]) {
  let row;
  try { row = await read(); } catch (e) { fail(`${label} threw: ${e.message}`); continue; }
  if (!row || row.hero_image !== cover0.src || row.photoAttr !== cover0.credit) fail(`${label} does not apply withLicensedEventCover`);
}

if (failures) { console.error(`test-licensed-event-covers: FAIL (${failures})`); process.exit(1); }
console.log(`test-licensed-event-covers: OK (${ids.length} covers: file, WebP, CREDITS row, licence, credit on card + page readers; own-hero negative control held)`);
