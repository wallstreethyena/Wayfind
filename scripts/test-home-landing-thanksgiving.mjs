#!/usr/bin/env node
// Owner, 2026-11-16, two asks:
//  1. The seasonal poster opens itself only on a visitor's FIRST visit; a returning visit lands on the poster shelf
//     (lib/homeLanding.js head script + DaypartRail layout effect). A Back/reload inside 30 minutes still restores
//     the poster the visitor had open.
//  2. The Fall in Florida poster carries a Thanksgiving rail with sourced, dated Thanksgiving picks
//     (lib/fallThanksgiving2026.js, lib/fallIntentRails.js).
// The head script is executed in a sandbox with fake storage; rail rules are called directly; wiring is checked on
// comment-stripped source.
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
const fails = [];
const ok = (c, msg) => { n += 1; if (!c) fails.push(msg); };
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const read = (f) => strip(readFileSync(path.join(REPO, f), "utf8"));

const L = await import("../lib/homeLanding.js");

// ---- 1. the head script, executed --------------------------------------------------------------------------------
function visit({ pathname = "/", local = {}, session = {}, now = Date.parse("2026-11-16T20:00:00Z") } = {}) {
  const attrs = {};
  const store = (obj) => ({ getItem: (k) => (k in obj ? obj[k] : null), setItem: (k, v) => { obj[k] = String(v); } });
  const ctx = {
    location: { pathname }, localStorage: store(local), sessionStorage: store(session),
    document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } },
    Date: class extends Date { static now() { return now; } }, JSON, isFinite,
  };
  vm.runInNewContext(L.homeShelfScript(), ctx);
  return { attrs, local, session };
}
{
  const first = visit();
  ok(!(L.HOME_SHELF_ATTR in first.attrs) && first.local[L.HOME_VISITED_KEY], "first visit: no shelf mark (the seasonal poster opens), and the visit is remembered");
  const second = visit({ local: { ...first.local } });
  ok(second.attrs[L.HOME_SHELF_ATTR] === "1", "returning visit: the shelf mark is set before paint");
  const now = Date.parse("2026-11-16T20:00:00Z");
  const back = visit({ local: { [L.HOME_VISITED_KEY]: "1" }, session: { [L.POSTER_RESUME_KEY]: JSON.stringify({ id: "christmas", ts: now - 60_000 }) }, now });
  ok(!(L.HOME_SHELF_ATTR in back.attrs), "Back/reload within 30 minutes keeps the poster the visitor had open");
  const stale = visit({ local: { [L.HOME_VISITED_KEY]: "1" }, session: { [L.POSTER_RESUME_KEY]: JSON.stringify({ id: "christmas", ts: now - 31 * 60_000 }) }, now });
  ok(stale.attrs[L.HOME_SHELF_ATTR] === "1", "an old saved poster does not block the shelf");
  const other = visit({ pathname: "/things-to-do/tampa", local: {} });
  ok(!(L.HOME_SHELF_ATTR in other.attrs) && !other.local[L.HOME_VISITED_KEY], "other pages are untouched and do not count as the home visit");
  ok(L.landsOnShelf({ pathname: "/", visitedBefore: true, savedPoster: null, nowMs: now }) === true
    && L.landsOnShelf({ pathname: "/", visitedBefore: false, savedPoster: null, nowMs: now }) === false
    && L.landsOnShelf({ pathname: "/", visitedBefore: true, savedPoster: { ts: now - 1000 }, nowMs: now }) === false, "landsOnShelf states the same rule");
  ok(/html\[data-wf-shelf\] \.wf8\.is-open \.wf8-menusec\{display:none\}/.test(L.HOME_SHELF_CSS), "while marked, the server-rendered open poster is hidden");
}
// wiring
{
  const layout = read("app/layout.js");
  ok(/<script dangerouslySetInnerHTML=\{\{ __html: homeShelfScript\(\) \}\} \/>/.test(layout) && /<style dangerouslySetInnerHTML=\{styleHtml\(HOME_SHELF_CSS\)\} \/>/.test(layout), "layout ships the head script and its CSS");
  const rail = read("app/components/DaypartRail.js");
  const m = /useLayoutEffect\(\(\) => \{\s*const root = document\.documentElement;\s*if \(!root\.hasAttribute\(HOME_SHELF_ATTR\)\) return;\s*root\.removeAttribute\(HOME_SHELF_ATTR\);\s*if \(selectionPinned\.current\) return;\s*selectionPinned\.current = true;\s*defaultLanding\.current = false;\s*setSelected\(null\);\s*\}, \[\]\);/.exec(rail);
  ok(m, "DaypartRail closes the opened poster in a layout effect, drops the mark, and never overrides a pinned rail");
  ok(m && m.index < rail.indexOf('sessionStorage.getItem("wf_poster_position")'), "the shelf decision runs before the saved-poster restore");
}

// ---- 2. the Thanksgiving rail ------------------------------------------------------------------------------------------
const { FALL_THANKSGIVING_2026, FALL_THANKSGIVING_PHOTO_PENDING_2026 } = await import("../lib/fallThanksgiving2026.js");
// Venues confirmed on 2026-11-16 to have a stored photo object in google-place-photos. A wf_inventory photo_ref
// ending in /photos/wfplacediscovery is a placeholder, not a photo: four picks that relied on one rendered initials
// on gowayfind.com. A new pick joins this set only after its venue's stored photo is confirmed.
const THANKSGIVING_STORED_PHOTO_IDS = new Set([
  "ChIJR0i18icRw4gRbyGIoLLoSo0", "ChIJczkDFL04w4gRwfowcSv8Tro", "ChIJHWXmMdewwogRk8JI-PK3rS0",
  "ChIJx4O9VBdw54gRcQ8akxK7nkc", "ChIJIU_PARFU5IgR1BUK642d7Xc", "ChIJHQP0C9QB2YgRbLjCHfQM9tM", "ChIJNZU1rIo724gRtz28vI1Q09k",
]);
const R = await import("../lib/fallIntentRails.js");
const { isTrusted } = await import("../lib/curatedEvents.js");
const { isFloridaVenue } = await import("../lib/floridaVenue.js");
{
  ok(R.FALL_INTENT_RAIL_DEFS.some((r) => r.id === "thanksgiving" && r.title === "Thanksgiving in Florida"), "the fall poster has a Thanksgiving in Florida rail");
  ok(FALL_THANKSGIVING_2026.length >= 7, "at least seven sourced Thanksgiving picks: " + FALL_THANKSGIVING_2026.length);
  ok(FALL_THANKSGIVING_PHOTO_PENDING_2026.length === 4 && FALL_THANKSGIVING_PHOTO_PENDING_2026.every((row) => !THANKSGIVING_STORED_PHOTO_IDS.has(row.place_id)), "positive control: the four photo-less picks are held back and fail the stored-photo set");
  const ids = new Set();
  for (const row of FALL_THANKSGIVING_2026) {
    const tag = row.event_id;
    ok(!ids.has(tag), tag + ": unique id"); ids.add(tag);
    ok(/^2026-11-(2[5-9])$/.test(row.start_date) && row.end_date >= row.start_date, tag + ": dated on Thanksgiving week 2026");
    ok(/^https:\/\//.test(row.source_url || "") && /^https:\/\//.test(row.official_event_url || ""), tag + ": has a source page and an official page");
    ok(/^ChIJ/.test(row.place_id || "") && Number.isFinite(row.lat) && Number.isFinite(row.lng), tag + ": pinned to a real venue");
    ok(THANKSGIVING_STORED_PHOTO_IDS.has(row.place_id), tag + ": its venue has a confirmed stored photo (no initials card)");
    ok(isTrusted(row) && isFloridaVenue(row), tag + ": passes the trust and Florida venue laws");
    ok(R.fallEventRail(row) === "thanksgiving", tag + ": lands on the Thanksgiving rail");
    ok(!/[—–]/.test([row.card_hook, row.editorial_summary, row.why_go, row.schedule_note].join(" ")), tag + ": no dashes in visitor copy");
  }
  const DASH = /[—–]/;
  ok(DASH.test("a — b"), "positive control: the dash probe finds a dash");
  const parrish = R.composeFallIntentRails(FALL_THANKSGIVING_2026.map((e) => ({ ...e, id: e.event_id, name: e.event_name })), [], { lat: 27.5689, lng: -82.4393, today: "2026-11-16", now: new Date("2026-11-16T20:00:00Z") });
  const tg = parrish.rails[0];
  ok(tg.id === "thanksgiving" && tg.cards.length === FALL_THANKSGIVING_2026.length, "from Parrish before Thanksgiving, Thanksgiving leads the fall poster with every pick: " + tg.cards.length);
  ok(tg.cards[0].distMi < 20 && tg.cards.slice(0, -1).every((c, i) => c.start_date < tg.cards[i + 1].start_date || c.distMi <= tg.cards[i + 1].distMi), "same day picks are nearest first");
  const after = R.composeFallIntentRails(FALL_THANKSGIVING_2026.map((e) => ({ ...e, id: e.event_id, name: e.event_name })), [], { lat: 27.5689, lng: -82.4393, today: "2026-11-30", now: new Date("2026-11-30T20:00:00Z") });
  ok(after.rails.find((r) => r.id === "thanksgiving").cards.length === 0 && after.rails[0].id !== "thanksgiving", "after Thanksgiving weekend the rail empties and stops leading");
  const route = read("app/api/events/fall/route.js");
  ok((route.match(/\.\.\.FALL_THANKSGIVING_2026/g) || []).length === 2, "the fall route loads the picks' venues and merges the picks");
  ok(/value\?\.rails\?\.length === FALL_INTENT_RAIL_DEFS\.length/.test(route) && /fall-intents:v49:/.test(route), "the cache admits the eleven rail answer under a new key");
  ok(/const expectedRailCount = collection === "halloween" \? 9 : 11;/.test(read("app/components/FallIntentRails.js")), "the client expects eleven fall rails");
}

if (fails.length) { for (const f of fails) console.error("test-home-landing-thanksgiving: FAIL - " + f); process.exit(1); }
console.log(`test-home-landing-thanksgiving: OK - ${n} assertions (head script executed in a sandbox; rail rules called directly; wiring on comment-stripped source)`);
