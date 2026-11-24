#!/usr/bin/env node
/**
 * test-this-week-rail-photos: every card on the homepage "This week in Florida"
 * rail has a real self hosted photo. Executes lib/thisWeekEvents.js and
 * lib/thisWeekEventCovers.js with a fixed Eastern date (2026-11-23), the live
 * rail's ten event rows, and the five covers added for empty or /api/photo cards.
 * Does not call Supabase or any Google photo path.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { thisWeekEventCards } from "../lib/thisWeekEvents.js";
import {
  THIS_WEEK_EVENT_COVERS,
  thisWeekCoverFor,
  thisWeekRailCredit,
  thisWeekSelfHostedPhoto,
} from "../lib/thisWeekEventCovers.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TODAY = "2026-11-23";
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

const row = (event_id, slug, start, end, extra = {}) => ({
  event_id, slug, event_name: slug, event_status: "scheduled", source_tier: 2,
  verification_confidence: "high", card_hook: "A hook.", city: "Florida", state: "FL",
  lat: 27.3, lng: -82.5, start_date: start, end_date: end, editorial_score: 6,
  select_nights: false, hero_image: null, ...extra,
});

// The ten dated event cards on the live rail, 23 Nov 2026 (plus the Christmas
// hub card, which is built in app/page.js and already has a photo).
const LIVE_RAIL = [
  row("jollywood-nights-2026", "disney-jollywood-nights-2026", "2026-11-07", "2027-01-05"),
  row("mvmcp-2026", "mickeys-very-merry-christmas-party-2026", "2026-11-08", "2026-12-22"),
  row("a-christmas-carol-orlando-shakes-2026", "a-christmas-carol-orlando-shakes-2026", "2026-11-25", "2026-12-24"),
  row("fl26-pan-latin-thanksgiving-at-toro-toro-2026", "pan-latin-thanksgiving-at-toro-toro-2026", "2026-11-26", "2026-11-26"),
  row("legoland-fl-holidays-2026", "holidays-at-legoland-florida-2026", "2026-11-21", "2027-01-03", { select_nights: true, schedule_note: "Select nights, Nov 21, 2026 to Jan 3, 2027." }),
  row("sarasota-medieval-fair-2026", "sarasota-medieval-fair-2026", "2026-11-07", "2026-12-06", { select_nights: true, schedule_note: "Saturdays and Sundays only, November 7 through December 6, 9:45am-5:30pm." }),
  row("aitana-miami-beach-2026", "aitana-miami-beach-2026", "2026-11-29", "2026-11-29", {
    hero_image: "/api/photo?ref=places%2FChIJwacPloS02YgRczTrK6Zixwk%2Fphotos%2Fwfplacediscovery&w=800",
  }),
  row("christmas-town-2026", "busch-gardens-christmas-town-2026", "2026-11-13", "2027-01-04"),
  row("beat-music-of-king-crimson-st-petersburg-2026", "beat-music-of-king-crimson-st-petersburg-2026", "2026-11-24", "2026-11-24", {
    hero_image: "/api/photo?ref=places%2FChIJSWCg1pvhwogR-rDr1SAB-vY%2Fphotos%2Fwfplacediscovery&w=800",
  }),
  row("disney-worlds-collide-concert-tour-orlando-2026", "disney-worlds-collide-concert-tour-orlando-2026", "2026-11-25", "2026-11-25", {
    hero_image: "/api/photo?ref=places%2FChIJVcr7Ufp654gRkJGTJZILyfc%2Fphotos%2Fwfplacediscovery&w=800",
  }),
];

if (!thisWeekSelfHostedPhoto("") && thisWeekSelfHostedPhoto("/events/x.jpg") === "/events/x.jpg") {
  /* ok */
} else fail("thisWeekSelfHostedPhoto should keep a self hosted path");
if (thisWeekSelfHostedPhoto("/api/photo?ref=places%2FChIJx/photos/wfplacediscovery&w=800") !== "") {
  fail("thisWeekSelfHostedPhoto must reject a /api/photo hero");
}

const ids = Object.keys(THIS_WEEK_EVENT_COVERS);
if (ids.length !== 5) fail("registry should hold the five empty rail cards");
for (const id of ids) {
  const c = THIS_WEEK_EVENT_COVERS[id];
  const files = new Set([c.src, ...(c.gallery || [])]);
  for (const src of files) {
    const file = join(root, "public", src);
    if (!/^\/events\/thisweek\/[a-z0-9-]+\.jpg$/.test(src)) { fail(`${id}: ${src} must be /events/thisweek/*.jpg`); continue; }
    if (!existsSync(file)) { fail(`${id}: ${src} missing`); continue; }
    const size = statSync(file).size;
    if (size < 20_000 || size > 200_000) fail(`${id}: ${src} is ${size} bytes, outside 20KB to 200KB`);
    const dim = jpegSize(readFileSync(file));
    if (!dim || dim.w !== 1280 || dim.h !== 853) fail(`${id}: ${src} must be a 1280x853 JPEG, got ${dim ? dim.w + "x" + dim.h : "not a JPEG"}`);
  }
  if (c.gallery && c.gallery[0] !== c.src) fail(`${id}: the cover must lead its gallery`);
  if (!/^Photo: \S/.test(c.credit || "")) fail(`${id}: credit must read "Photo: <name>"`);
  if (!/^https:\/\//.test(c.creditHref || "")) fail(`${id}: creditHref must be the organizer, venue, or Commons page`);
  if (!["event", "venue"].includes(c.kind)) fail(`${id}: kind must be event or venue`);
  if (!c.alt || c.alt.length < 20) fail(`${id}: alt text missing`);
  if (/[\u2013\u2014]/.test(c.alt + c.credit)) fail(`${id}: no dashes in card text`);
}

// Lookup works by event_id and by the public slug.
if (thisWeekCoverFor({ event_id: "legoland-fl-holidays-2026" })?.src !== "/events/thisweek/legoland-florida-christmas-tree.jpg") {
  fail("LEGOLAND cover was not found by event_id");
}
if (thisWeekCoverFor({ slug: "holidays-at-legoland-florida-2026" })?.src !== "/events/thisweek/legoland-florida-christmas-tree.jpg") {
  fail("LEGOLAND cover was not found by public slug");
}
if (thisWeekCoverFor({ event_id: "not-on-this-rail-2099" }) !== null) fail("an unregistered event got a cover");
if (thisWeekRailCredit("Photo: Toro Toro") !== "Toro Toro") fail("rail credit should drop the Photo: prefix the strip already paints");

const cards = thisWeekEventCards(LIVE_RAIL, TODAY, { now: new Date("2026-11-23T15:00:00-05:00") });
if (cards.length !== 10) fail(`expected 10 this week cards, got ${cards.length}: ${cards.map((c) => c.slug).join(", ")}`);
const empty = cards.filter((c) => !c.image || String(c.image).includes("/api/photo"));
if (empty.length) fail("rail card missing a self hosted photo: " + empty.map((c) => c.slug + " -> " + JSON.stringify(c.image)).join("; "));

const bySlug = Object.fromEntries(cards.map((c) => [c.slug, c]));
const expectCover = [
  ["pan-latin-thanksgiving-at-toro-toro-2026", "/events/thisweek/toro-toro-dining-table.jpg", "Toro Toro"],
  ["holidays-at-legoland-florida-2026", "/events/thisweek/legoland-florida-christmas-tree.jpg", "LEGOLAND Florida Resort"],
  ["aitana-miami-beach-2026", "/events/thisweek/aitana-live-nation.jpg", "Live Nation"],
  ["beat-music-of-king-crimson-st-petersburg-2026", "/events/thisweek/mahaffey-theater-auditorium.jpg", "U.S. Department of Veterans Affairs, public domain, via Wikimedia Commons"],
  ["disney-worlds-collide-concert-tour-orlando-2026", "/events/thisweek/kia-center-arena.jpg", "Visitor7 via Wikimedia Commons, CC BY SA 3.0"],
];
for (const [slug, src, credit] of expectCover) {
  const card = bySlug[slug];
  if (!card) { fail(`missing rail card ${slug}`); continue; }
  if (card.image !== src) fail(`${slug}: image is ${card.image}, expected ${src}`);
  if (card.credit !== credit) fail(`${slug}: credit is ${JSON.stringify(card.credit)}, expected ${credit}`);
}

// A broken /api/photo hero must not beat the official cover (Aitana's live row).
const aitana = bySlug["aitana-miami-beach-2026"];
if (aitana && String(aitana.image).includes("/api/photo")) fail("Aitana still uses the /api/photo hero that returns 404");

if (failures) { console.error("test-this-week-rail-photos: FAIL"); process.exit(1); }
console.log("test-this-week-rail-photos: OK - 10 live rail cards have self hosted photos; 5 new covers fill the empty and /api/photo slots");
