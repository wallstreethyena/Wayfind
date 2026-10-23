#!/usr/bin/env node
// scripts/check-seasonal-surfaces.mjs - the seasonal surfaces (Fall / Halloween /
// Christmas posters, the fall and Halloween place-card skins, Christmas-first) and
// the machinery that makes a season change show at midnight Eastern.
//
// EXECUTED, not grepped: it CALLS lib/fallSkin.js, lib/spookySkin.js,
// lib/posterSeasons.js, lib/dayparts.js (the exact track DaypartRail renders),
// lib/seasonBoundaries.js, the REAL cron route (loaded through scripts/lib/jsxLoad.mjs
// with next/cache stubbed to record calls), and lib/siteDayClock.js against a fake
// timer + fake clock. Years 2026, 2027, 2028 (Thanksgiving Nov 26, Nov 25, Nov 23).
// What is NOT executed: the React components themselves (DaypartRail, RailCard,
// IconicPlaceCard, PlaceCard load browser-only hooks); their wiring to the shared
// hook is checked STATICALLY in the last section and said so in the success line.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FALL_SEASON_START_MD, FALL_EVIDENCE_START_MD, FALL_CARD_IDS, fallSkinLive, fallCardClass, fallShareLine, fallSeasonEnd } from "../lib/fallSkin.js";
import { spookySkinLive, SPOOKY_SKIN_START_MD, spookyOverFall, fallSpookyCardClass, SPOOKY_PLACE_IDS } from "../lib/spookySkin.js";
import { POSTER_SEASONS, posterSeasonLive, posterSeasonWindow, railOnPosterTrack } from "../lib/posterSeasons.js";
import { orderFor, DAYPART_IDS, christmasLeads } from "../lib/dayparts.js";
import { RAILS } from "../lib/rails.js";
import { addDays, isSeasonBoundaryDay, seasonBoundaryDays, runSeasonalRevalidate, SEASONAL_ISR_PATHS } from "../lib/seasonBoundaries.js";
import { siteTodayStr } from "../lib/siteTime.js";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0; const failures = [];
const ok = (c, m) => { c ? pass++ : failures.push(m); };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const ids = RAILS.map((r) => r.id);
const byId = new Map(RAILS.map((r) => [r.id, r]));
const SEASONAL = ["augtober", "halloween", "christmas"];
const track = (band, today) => orderFor(band, ids, today).filter((id) => railOnPosterTrack(byId.get(id), today));
const seasonal = (band, today) => track(band, today).filter((id) => SEASONAL.includes(id));
const THANKS = { 2026: "2026-11-26", 2027: "2027-11-25", 2028: "2028-11-23" };
const FALL_ID = [...FALL_CARD_IDS][0];
const ORDINARY_ID = "ChIJ-not-a-fall-place";
// A fall id that is a spooky place, and one that is a plain fall place (farm / coffee).
const SPOOKY_FALL_ID = SPOOKY_PLACE_IDS.find((i) => FALL_CARD_IDS.has(i));
const PLAIN_FALL_ID = [...FALL_CARD_IDS].find((i) => !SPOOKY_PLACE_IDS.includes(i));

// PROBE: the helpers find a known positive before any absence is trusted.
ok(seasonal("morning", "2027-10-20").length === 3 && FALL_ID && SPOOKY_FALL_ID && PLAIN_FALL_ID, "PROBE: the track helper finds all three seasonal posters on Oct 20 2027 and the fixtures exist");

for (const y of [2026, 2027, 2028]) {
  const T = THANKS[y];
  ok(fallSeasonEnd(y) === T, `${y}: Thanksgiving is ${T}`);

  // ── TASK 1: the fall card skin starts Aug 15, ends Thanksgiving ──
  ok(FALL_SEASON_START_MD === "08-15", "fall skin start is Aug 15");
  ok(fallSkinLive(`${y}-08-15`) && !fallSkinLive(`${y}-08-14`), `${y}: fall skin live Aug 15, dead Aug 14`);
  ok(fallSkinLive(T) && !fallSkinLive(addDays(T, 1)), `${y}: fall skin live on Thanksgiving ${T}, dead the day after`);
  ok(!fallSkinLive(`${y}-07-04`) && !fallSkinLive(`${y}-12-25`) && !fallSkinLive(`${y}-01-15`), `${y}: dead in July, December, January`);
  eq(fallCardClass(FALL_ID, `${y}-08-15`), " wf-fall-card", `${y}: a fall place wears the fall class Aug 15`);
  eq(fallCardClass(FALL_ID, `${y}-08-14`), "", `${y}: and not Aug 14`);
  eq(fallCardClass(FALL_ID, addDays(T, 1)), "", `${y}: ordinary again the morning after Thanksgiving`);
  eq(fallCardClass(ORDINARY_ID, `${y}-10-20`), "", `${y}: a non-fall place never wears it (negative control)`);
  ok(fallShareLine("x", FALL_ID, `${y}-08-15`).startsWith("🍁") && fallShareLine("x", FALL_ID, `${y}-08-14`) === "x" && fallShareLine("x", FALL_ID, addDays(T, 1)) === "x", `${y}: the share leaf follows the same dates`);
  // ONE source of truth: the card skin and the Fall poster agree on EVERY day of the year.
  let disagree = 0;
  for (let d = `${y}-01-01`; d.startsWith(String(y)); d = addDays(d, 1)) if (fallSkinLive(d) !== posterSeasonLive("augtober", d)) disagree++;
  ok(disagree === 0, `${y}: fall skin and Fall poster disagree on ${disagree} days`);
  ok(posterSeasonWindow("augtober", y).start === `${y}-${FALL_SEASON_START_MD}`, `${y}: the poster window start IS the skin constant`);
  ok(FALL_EVIDENCE_START_MD === "08-26", "the evidence window keeps its own Aug 26");

  // ── Halloween skin unchanged, and its combination with the fall class ──
  ok(SPOOKY_SKIN_START_MD === "08-26", "spooky skin start stays Aug 26");
  for (const d of [`${y}-08-15`, `${y}-08-20`, `${y}-08-25`]) {
    ok(!spookySkinLive(d), `${d}: spooky skin not live before Aug 26`);
    eq(fallSpookyCardClass({ id: SPOOKY_FALL_ID, name: "Haunted Halloween Fright Night" }, d), " wf-fall-card", `${d}: a spooky-looking fall place is plain fall, no spooky class, no conflict`);
    eq(spookyOverFall({ id: SPOOKY_FALL_ID, name: "Haunted House" }, d), "", `${d}: spookyOverFall empty`);
  }
  ok(!spookySkinLive(`${y}-08-14`), `${y}: spooky dead Aug 14`);
  ok(spookySkinLive(`${y}-08-26`) && spookySkinLive(`${y}-10-31`) && spookySkinLive(`${y}-11-01`) && !spookySkinLive(`${y}-11-02`), `${y}: spooky window Aug 26 .. Nov 1 exactly`);
  eq(fallSpookyCardClass({ id: SPOOKY_FALL_ID, name: "Haunted House" }, `${y}-10-20`), " wf-fall-card wf-spooky-card", `${y}: Oct 20 a spooky fall place wears fall + spooky`);
  eq(fallSpookyCardClass({ id: PLAIN_FALL_ID, name: "Pumpkin Patch Cafe" }, `${y}-10-20`), " wf-fall-card", `${y}: a plain fall place stays fall only`);
  eq(spookyOverFall({ id: ORDINARY_ID, name: "Haunted Ghost Tour" }, `${y}-10-20`), "", `${y}: spooky never rides a card the fall skin does not apply to`);
  eq(fallSpookyCardClass({ id: SPOOKY_FALL_ID, name: "x" }, addDays(T, 1)), "", `${y}: everything ordinary after Thanksgiving`);
  for (const d of [`${y}-08-15`, `${y}-10-20`, T, `${y}-12-20`]) ok(["", " wf-fall-card"].includes(fallCardClass(FALL_ID, d)), `${d}: the fall class is never a Christmas/Halloween class`);

  // ── TASK 3: posters, windows, order, overlaps ──
  for (const band of DAYPART_IDS) {
    for (const d of [`${y}-10-10`, `${y}-10-11`, `${y}-10-12`]) eq(seasonal(band, d), ["augtober", "halloween"], `${band} ${d}: Fall then Halloween`);
    for (const d of [`${y}-10-13`, `${y}-10-20`, `${y}-10-31`]) {
      const t = track(band, d);
      eq(seasonal(band, d).slice().sort(), ["augtober", "christmas", "halloween"], `${band} ${d}: all three`);
      ok(t[0] === "augtober" && t[1] === "halloween", `${band} ${d}: Halloween right after Fall (got ${t.slice(0, 3)})`);
    }
    for (const d of [`${y}-11-01`, `${y}-11-10`, T]) {
      const s = seasonal(band, d);
      eq(s.slice().sort(), ["augtober", "christmas"], `${band} ${d}: Fall and Christmas only`);
      ok(s[0] === "augtober", `${band} ${d}: Fall first until Thanksgiving ends`);
    }
    const after = addDays(T, 1);
    for (const d of [after, `${y}-12-25`, `${y}-12-31`]) { eq(seasonal(band, d), ["christmas"], `${band} ${d}: Christmas alone`); ok(track(band, d)[0] === "christmas", `${band} ${d}: Christmas FIRST`); ok(christmasLeads(d), `${d}: christmasLeads`); }
    eq(seasonal(band, `${y + 1}-01-01`), ["christmas"], `${band} ${y + 1}-01-01: Christmas only`);
    ok(track(band, `${y + 1}-01-01`)[0] === "christmas", `${band}: Christmas first on Jan 1`);
    eq(seasonal(band, `${y + 1}-01-02`), [], `${band} ${y + 1}-01-02: none of the three`);
    ok(!christmasLeads(`${y + 1}-01-02`) && !christmasLeads(T) && !christmasLeads(`${y}-07-01`), "christmasLeads off Jan 2, on Thanksgiving, in July");
    eq(seasonal(band, `${y}-08-14`), [], `${band} ${y}-08-14: none`);
    eq(seasonal(band, `${y}-08-15`), ["augtober"], `${band} ${y}-08-15: Fall alone`);
    // no duplicate poster ids in any order, on any day of the year
    for (let d = `${y}-01-01`; d.startsWith(String(y)); d = addDays(d, 1)) {
      const o = orderFor(band, ids, d);
      if (new Set(o).size !== o.length) failures.push(`${band} ${d}: duplicate ids in orderFor`);
      else pass++;
      const t = track(band, d);
      if (new Set(t).size !== t.length) failures.push(`${band} ${d}: duplicate ids on the track`);
      else pass++;
    }
  }

  // ── boundary days, exact ──
  const EXPECT = {
    2026: ["2026-01-02", "2026-08-15", "2026-08-26", "2026-10-10", "2026-10-13", "2026-11-01", "2026-11-02", "2026-11-27"],
    2027: ["2027-01-02", "2027-08-15", "2027-08-26", "2027-10-10", "2027-10-13", "2027-11-01", "2027-11-02", "2027-11-26"],
    2028: ["2028-01-02", "2028-08-15", "2028-08-26", "2028-10-10", "2028-10-13", "2028-11-01", "2028-11-02", "2028-11-24"],
  }[y];
  eq(seasonBoundaryDays(y), EXPECT, `${y}: boundary days`);
  // independent derivation from the window table + skin windows, so the signature approach cannot agree with itself by accident
  const derived = new Set();
  for (const id of Object.keys(POSTER_SEASONS)) for (const sy of [y - 1, y]) { const w = posterSeasonWindow(id, sy); for (const dte of [w.start, addDays(w.end, 1)]) if (dte.startsWith(String(y))) derived.add(dte); }
  derived.add(`${y}-${SPOOKY_SKIN_START_MD}`); derived.add(`${y}-11-02`); derived.add(addDays(T, 1));
  eq([...derived].sort(), EXPECT, `${y}: boundary days re-derived from the window table`);
  for (const d of [`${y}-08-14`, `${y}-08-16`, `${y}-10-31`, T, `${y}-12-25`, `${y}-12-31`, `${y}-06-15`]) ok(!isSeasonBoundaryDay(d), `${y}: ${d} is NOT a boundary day (negative control)`);
}
ok(!isSeasonBoundaryDay("garbage") && !isSeasonBoundaryDay(null) && !isSeasonBoundaryDay("2027-8-15"), "malformed dates are never boundary days");
eq([...SEASONAL_ISR_PATHS], ["/", "/v8"], "the ISR routes that render the seasonal surfaces");

// ── The cron body and the REAL route (next/cache stubbed to record) ──
{
  const calls = [];
  const rp = (p) => calls.push(p);
  let r = runSeasonalRevalidate({ now: new Date("2027-09-14T17:00:00Z"), revalidatePath: rp });
  ok(r.skipped && r.today === "2027-09-14" && calls.length === 0, "runSeasonalRevalidate skips a non-boundary day and calls nothing");
  r = runSeasonalRevalidate({ now: new Date("2027-08-15T04:01:00Z"), revalidatePath: rp });
  ok(!r.skipped && r.today === "2027-08-15" && JSON.stringify(calls) === JSON.stringify(["/", "/v8"]), "runSeasonalRevalidate revalidates / and /v8 on Aug 15 2027");
}
const route = await loadComponent(path.join(ROOT, "app/api/cron/seasonal-revalidate/route.js"), ROOT);
ok(typeof route.GET === "function", "the route exports GET");
const RealDate = Date;
const fakeNow = (iso) => { const t = RealDate.parse(iso); globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [t])); } static now() { return t; } }; };
const hit = async (iso, bearer) => {
  globalThis.__wfRevalidated = [];
  fakeNow(iso);
  try {
    const res = await route.GET(new Request("http://x/api/cron/seasonal-revalidate", { headers: bearer ? { authorization: "Bearer " + bearer } : {} }));
    return { status: res.status, body: await res.json().catch(() => null), calls: globalThis.__wfRevalidated.slice() };
  } finally { globalThis.Date = RealDate; }
};
delete process.env.CRON_SECRET;
let h = await hit("2027-08-15T04:01:00Z", "anything");
ok(h.status === 401 && h.calls.length === 0, "route: CRON_SECRET unset is a 401 and revalidates nothing (fail closed)");
process.env.CRON_SECRET = "s3cret";
h = await hit("2027-08-15T04:01:00Z", null);
ok(h.status === 401 && h.calls.length === 0, "route: no bearer is a 401, nothing revalidated");
h = await hit("2027-08-15T04:01:00Z", "wrong");
ok(h.status === 401 && h.calls.length === 0, "route: wrong bearer is a 401, nothing revalidated");
h = await hit("2027-09-14T04:01:00Z", "s3cret");
ok(h.status === 200 && h.body.skipped === true && h.calls.length === 0, "route: a non-boundary day (Sep 14 2027) skips and never calls revalidatePath");
h = await hit("2027-08-15T04:01:00Z", "s3cret");
ok(h.status === 200 && h.body.skipped === false && JSON.stringify(h.calls) === JSON.stringify(["/", "/v8"]), `route: Aug 15 2027 00:01 EDT calls revalidatePath for / and /v8 (got ${JSON.stringify(h.calls)})`);
h = await hit("2027-11-26T04:01:00Z", "s3cret");
ok(h.body.skipped === true && h.calls.length === 0, "route: 04:01 UTC on Nov 26 2027 is still Nov 25 23:01 EST - Thanksgiving is not a boundary - skips");
h = await hit("2027-11-26T05:01:00Z", "s3cret");
ok(h.body.skipped === false && h.calls.length === 2, "route: 05:01 UTC Nov 26 2027 (00:01 EST, the day after Thanksgiving) revalidates");
h = await hit("2027-01-02T05:01:00Z", "s3cret");
ok(h.body.skipped === false, "route: Jan 2 (Christmas poster ends) revalidates");
h = await hit("2026-10-10T04:01:00Z", "s3cret");
ok(h.body.skipped === false && h.body.today === "2026-10-10", "route: Oct 10 2026 (Halloween starts) revalidates");

// ── the midnight timer fixture (lib/siteDayClock.js) ──
const clock = await import("../lib/siteDayClock.js");
{
  const hrs = (iso) => clock.msUntilNextSiteMidnight(new RealDate(iso)) / 36e5;
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  ok(near(hrs("2027-12-01T12:00:00-05:00"), 12), "msUntilNextSiteMidnight: noon EST is 12h");
  ok(near(hrs("2027-08-14T23:59:00-04:00"), 1 / 60), "msUntilNextSiteMidnight: 23:59 EDT is 1 minute");
  ok(near(hrs("2027-03-14T00:30:00-05:00"), 22.5), "msUntilNextSiteMidnight: spring-forward day is 23h long (22.5h left at 00:30)");
  ok(near(hrs("2027-11-07T00:30:00-04:00"), 24.5), "msUntilNextSiteMidnight: fall-back day is 25h long (24.5h left at 00:30)");
  ok(near(hrs("2027-06-01T04:00:00Z"), 24), "msUntilNextSiteMidnight: exactly midnight EDT waits a full day");

  const timers = new Map(); let nextId = 1;
  const realST = globalThis.setTimeout, realCT = globalThis.clearTimeout;
  globalThis.setTimeout = (fn, ms) => { const id = nextId++; timers.set(id, { fn, ms }); return id; };
  globalThis.clearTimeout = (id) => { timers.delete(id); };
  const fire = () => { const [id, t] = [...timers.entries()][0]; timers.delete(id); t.fn(); }; // a real timer is spent once it fires
  fakeNow("2027-08-14T23:59:00-04:00");
  const setNow = (iso) => { fakeNow(iso); };
  try {
    let a = 0, b = 0;
    const offA = clock.subscribeSiteDay(() => a++);
    ok(timers.size === 1, "timer: subscribing arms exactly ONE timer");
    const [t1] = [...timers.values()];
    ok(Math.abs(t1.ms - (60 * 1000 + 250)) < 2, `timer: set to the next Eastern midnight (+250ms): got ${t1.ms}ms`);
    const offB = clock.subscribeSiteDay(() => b++);
    ok(timers.size === 1, "timer: a second subscriber does NOT add a second timer");
    // fires early (date unchanged): nobody notified, timer re-armed for the remainder
    setNow("2027-08-14T23:59:50-04:00");
    fire();
    ok(a === 0 && b === 0 && timers.size === 1, "timer: an early fire (same date) notifies nobody and re-arms");
    // at midnight: both notified once, the new timer is ~24h
    setNow("2027-08-15T00:00:00.300-04:00");
    fire();
    ok(a === 1 && b === 1, "timer: at midnight each subscriber is told exactly once");
    ok(timers.size === 1 && Math.abs([...timers.values()][0].ms - (864e5 - 300 + 250)) < 5, `timer: re-armed for the NEXT midnight, ~24h (got ${[...timers.values()][0].ms})`);
    offA();
    ok(timers.size === 1, "timer: still armed while one subscriber remains");
    offB();
    ok(timers.size === 0, "timer: cleared when the last subscriber leaves (no background loop)");
  } finally { globalThis.setTimeout = realST; globalThis.clearTimeout = realCT; globalThis.Date = RealDate; }
  ok(siteTodayStr(new RealDate("2027-08-15T04:00:00Z")) === "2027-08-15" && siteTodayStr(new RealDate("2027-08-15T03:59:59Z")) === "2027-08-14", "PROBE: the fixture instants straddle Eastern midnight as intended");
}

// ── the server never keeps a seed (module state is shared across requests) ──
{
  const c2 = await import("../lib/siteDayClock.js?seedtest");
  c2.seedSiteDay("2020-01-01"); // node has no window = server: must be ignored
  ok(c2.serverDay() === siteTodayStr(), "server (no window): seedSiteDay is ignored, serverDay is today's Eastern date");
  globalThis.window = {};
  try { c2.seedSiteDay("2020-01-01"); ok(c2.serverDay() === "2020-01-01", "browser (window): the seed is used for hydration (negative control)"); } finally { delete globalThis.window; }
}
// ── static wiring (components cannot be rendered in plain node) ──
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const read = (f) => strip(readFileSync(path.join(ROOT, f), "utf8"));
const count = (s, rx) => (s.match(rx) || []).length;
const vj = JSON.parse(readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
const sched = vj.crons.filter((c) => c.path === "/api/cron/seasonal-revalidate").map((c) => c.schedule).sort();
eq(sched, ["1 4,5 * * *"], "vercel.json schedules the revalidate cron once, at 04:01 and 05:01 UTC");
const dr = read("app/components/DaypartRail.js");
ok(count(dr, /const siteDay = useSiteToday\(\)/g) === 1 && count(dr, /railOnPosterTrack\(r, siteDay\)/g) === 1 && count(dr, /orderFor\(daypart, rails\.map\(\(r\) => r\.id\), siteDay\)/g) === 1 && /\[daypart, rails, sponsor, livePosters, siteDay, raysPoster\]/.test(dr), "DaypartRail: filter, order and the order memo deps all use siteDay");
ok(!/railOnPosterTrack\(r, siteTodayStr/.test(dr), "DaypartRail no longer reads the date un-reactively for the track");
for (const [f, n] of [["app/components/IconicPlaceCard.js", 1], ["app/components/RailCard.js", 1], ["app/components/FallIntentRails.js", 1], ["app/components/ThingsToDoList.js", 1]]) ok(count(read(f), /useSiteToday\(\)/g) === n, `${f}: useSiteToday() called ${n} time`);
const hm = read("app/home.js");
ok(count(hm, /const siteDay = useSiteToday\(\)/g) === 1 && /fallCardClass\(p && p\.id, siteDay\)/.test(hm) && !/spookyOverFall\(p, siteTodayStr/.test(hm), "home.js PlaceCard: skin classes use siteDay");
ok(/<SiteDaySeed day=\{siteTodayStr\(\)\} \/>/.test(read("app/page.js")) && /<SiteDaySeed day=\{siteTodayStr\(\)\} \/>/.test(read("app/v8/page.js")), "both ISR pages stamp their render day");
ok(/export const revalidate = 3600/.test(read("app/page.js")), "app/page.js is still ISR (the cron refreshes it early; it does not replace the hourly)");

if (failures.length) { console.log(failures.map((f) => "  FAIL: " + f).join("\n")); }
console.log(`\ncheck-seasonal-surfaces: ${failures.length ? "FAIL (" + failures.length + ")" : "OK"} - ${pass} assertions passed; fall skin, poster windows/order/overlaps, boundary days, the real cron route (next/cache stubbed) and the midnight timer EXECUTED for 2026/2027/2028; component wiring is static`);
process.exit(failures.length ? 1 : 0);
