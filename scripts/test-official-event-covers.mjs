#!/usr/bin/env node
// Locks two fixes from 2026-11-23 (owner: "there are repetitive photos here").
// 1) lib/officialEventCovers.js: an organizer or venue website photo ships WITH
//    "Photo: <name>" credit, as a self hosted 1280x853 JPEG of at most 200KB,
//    only on the exact event it was chosen for, and only fills a gap.
// 2) lib/posterEvents.js dedupeRailImages: a rail never shows the same venue
//    photo on two cards, while event art and distinct photos are untouched.
// Executes the real code paths instead of grepping source.
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OFFICIAL_EVENT_COVERS, withOfficialEventCover } from "../lib/officialEventCovers.js";
import { withLicensedEventCover } from "../lib/licensedEventCovers.js";
import { curatedToFeedEvent } from "../lib/curatedEvents.js";
import { eventPhotoCredit, eventImageIsVenue } from "../lib/eventImageProvenance.js";
import { dedupeRailImages, posterImageKey } from "../lib/posterEvents.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const fail = (msg) => { failures++; console.error("  FAIL " + msg); };

function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

const ids = Object.keys(OFFICIAL_EVENT_COVERS);
if (ids.length < 3) fail("registry lost the three Live Music covers");
for (const id of ids) {
  const c = OFFICIAL_EVENT_COVERS[id];
  for (const src of new Set([c.src, ...(c.gallery || [])])) {
    const file = join(root, "public", src);
    if (!/^\/events\/official\/[a-z0-9-]+\.jpg$/.test(src)) { fail(`${id}: ${src} must be /events/official/*.jpg`); continue; }
    if (!existsSync(file)) { fail(`${id}: ${src} missing`); continue; }
    const size = statSync(file).size;
    if (size < 20_000 || size > 200_000) fail(`${id}: ${src} is ${size} bytes, outside 20KB to 200KB`);
    const dim = jpegSize(readFileSync(file));
    if (!dim || dim.w !== 1280 || dim.h !== 853) fail(`${id}: ${src} must be a 1280x853 JPEG, got ${dim ? dim.w + "x" + dim.h : "not a JPEG"}`);
  }
  if (c.gallery && c.gallery[0] !== c.src) fail(`${id}: the cover must lead its gallery`);
  if (!/^Photo: \S/.test(c.credit || "")) fail(`${id}: credit must read "Photo: <name>"`);
  if (!/^https:\/\//.test(c.creditHref || "")) fail(`${id}: creditHref must be the organizer or venue site`);
  if (!["event", "venue"].includes(c.kind)) fail(`${id}: kind must be event or venue`);
  if (!c.alt || c.alt.length < 20) fail(`${id}: alt text missing`);
  if (/[\u2013\u2014]/.test(c.alt + c.credit)) fail(`${id}: no dashes in card text`);
}

// Fills a gap, never replaces, unknown ids pass through; the licensed reader chains to it.
const [id0] = ids;
const bare = { event_id: id0, slug: id0, event_name: "Probe", short_title: "Probe", start_date: "2099-01-01", city: "Tampa", card_hook: "Probe hook", hero_image: null };
const filled = withLicensedEventCover(bare);
if (filled.hero_image !== OFFICIAL_EVENT_COVERS[id0].src) fail("the licensed reader did not fall through to the official cover");
const own = withOfficialEventCover({ ...bare, hero_image: "/events/own.webp" });
if (own.hero_image !== "/events/own.webp" || own.photoAttr) fail("a row with its own hero_image was overwritten (negative control)");
const other = { ...bare, event_id: "not-in-registry-2099" };
if (withOfficialEventCover(other) !== other || withLicensedEventCover(other) !== other) fail("an unregistered event was changed");

// The card path: feed shape -> credit resolver, and never the venue Google photo.
for (const id of ids) {
  const c = OFFICIAL_EVENT_COVERS[id];
  const feed = curatedToFeedEvent(withLicensedEventCover({ ...bare, event_id: id, slug: id }));
  if (feed.image !== c.src) fail(`${id}: feed image is ${feed.image}, expected the official cover`);
  if (String(feed.image).includes("/api/photo")) fail(`${id}: card still uses a venue Google photo`);
  const credit = eventPhotoCredit(feed.visitFacts, feed.image);
  if (!credit || credit.label !== c.credit) fail(`${id}: the card would show the photo without its credit`);
  if (feed.imageIsVenue !== (c.kind === "venue") || eventImageIsVenue(feed.visitFacts, feed.image) !== (c.kind === "venue")) fail(`${id}: venue flag does not match kind=${c.kind}`);
}

// Rail dedupe: the exact screenshot case (two Vinoy Park festivals, one place photo).
const vinoy = "/api/photo?place=ChIJESS-JgvhwogRnfB1lK46okc&w=800";
const rail = [
  { id: "a", name: "Reggae Rise Up", image: vinoy, imageIsVenue: true },
  { id: "b", name: "Tampa Bay Blues", image: vinoy, imageIsVenue: true },
  { id: "c", name: "Other show", image: "/api/photo?ref=places%2FChIJESS-JgvhwogRnfB1lK46okc%2Fphotos%2Fwfplacediscovery&w=640", imageIsVenue: true },
  { id: "d", name: "Tour A", image: "https://s1.ticketm.net/dam/a/1/x_TABLET_LANDSCAPE_16_9.jpg" },
  { id: "e", name: "Tour B", image: "https://s1.ticketm.net/dam/a/1/x_TABLET_LANDSCAPE_16_9.jpg" },
  { id: "f", name: "No photo", image: "" },
  { id: "g", name: "Different venue", image: "/api/photo?place=ChIJ-U84wHnEwogR9ry4KMSoZW8&w=800", imageIsVenue: true },
];
if (posterImageKey(rail[0]) !== posterImageKey(rail[2])) fail("place= and ref=…/wfplacediscovery must key as the same photo");
const out = dedupeRailImages(rail).map((e) => e.id).join(",");
if (out !== "a,d,e,f,g") fail(`dedupe kept ${out}, expected a,d,e,f,g (venue repeats leave, event art stays)`);
if (dedupeRailImages([]).length !== 0 || dedupeRailImages(null).length !== 0) fail("empty rails must stay empty");

if (failures) { console.error(`test-official-event-covers: FAIL (${failures})`); process.exit(1); }
console.log(`test-official-event-covers: OK (${ids.length} covers: 1280x853 JPEG <=200KB, Photo credit on card, gap only; rail venue photo dedupe held)`);
