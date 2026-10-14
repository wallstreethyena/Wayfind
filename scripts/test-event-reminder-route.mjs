#!/usr/bin/env node
// scripts/test-event-reminder-route.mjs: GET /api/events/reminder, EXECUTED.
// Calls the real handler (lib/eventReminderRoute.js, the code app/api/events/
// reminder/route.js delegates to) and asserts on the response BODY and HEADERS,
// not the status alone: a 200 with an HTML error page, or a 400 with no message,
// would pass a status check.
//
// Covers: a 200 for a real research-only event (the Christmas fallback path), a
// 200 for a select-nights event with a partner ticket link, the headers Safari
// and Android need to open the calendar, and every refusal: 400 for bad or
// missing params, an undated event, a past event, a past reminder time, a night
// the event does not run; 404 for an unknown slug; 503 when the lookup throws.
// Also proves the invite is built from the stored row, never from the request.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleReminderRequest } from "../lib/eventReminderRoute.js";
import { mergeChristmasResearch } from "../lib/christmasResearch.js";
import { christmasEventPageRow, christmasPageRow } from "../lib/christmasEventPage.js";
import { GET } from "../app/api/events/reminder/route.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const NOW = Date.parse("2026-10-14T12:00:00Z");
const SITE = "https://www.gowayfind.com";
const call = (qs, deps = {}) => handleReminderRequest(new Request(SITE + "/api/events/reminder?" + qs), { nowMs: NOW, siteUrl: SITE, ...deps });
const unfold = (t) => t.replace(/\r\n[ \t]/g, "");

// A research only event: no wf_events row, so the page falls back to the research data
// (24 verified select nights, 6 PM to 10 PM).
const REAL = "sunset-walk-holiday-nights-2026";
const realLookup = async (slug) => christmasEventPageRow(null, slug);
// An event with a partner ticket route (Undercover Tourist) and a night list.
const jolly = christmasPageRow(mergeChristmasResearch([]).find((r) => r.slug === "jollywood-nights-2026"));
const jollyLookup = async (slug) => (slug === jolly.slug ? jolly : null);

const headersOf = (res) => Object.fromEntries([...res.headers.entries()]);

// ── 200: research fallback event, a verified night list ────────────────────
{
  const res = await call(`slug=${REAL}&night=2026-12-03&remind=eve`, { lookup: realLookup });
  const body = await res.text();
  const h = headersOf(res);
  ok(res.status === 200, `200 for ${REAL} (got ${res.status}: ${body.slice(0, 120)})`);
  ok(h["content-type"] === "text/calendar; charset=utf-8", `Content-Type text/calendar; charset=utf-8 (got ${h["content-type"]})`);
  ok(h["content-disposition"] === `attachment; filename="${REAL}.ics"`, `Content-Disposition attachment with the slug filename (got ${h["content-disposition"]})`);
  ok(h["cache-control"] === "private, no-store", `Cache-Control private, no-store (got ${h["cache-control"]})`);
  ok(h["x-content-type-options"] === "nosniff", "nosniff");
  ok(body.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n") && body.endsWith("END:VCALENDAR\r\n"), "body is a VCALENDAR with CRLF endings");
  const t = unfold(body);
  ok(t.includes("\r\nSUMMARY:Holiday Nights Celebration at the Promenade at Sunset Walk\r\n"), "SUMMARY is the stored event name");
  ok(t.includes("TRIGGER;VALUE=DATE-TIME:20261202T230000Z"), "alarm: the day before (Dec 2) at 6 PM EST = 23:00Z");
  ok(t.includes("DTSTART;TZID=America/New_York:20261203T180000") && t.includes("DTEND;TZID=America/New_York:20261203T220000"), "event time from the stored 6 PM to 10 PM");
  ok(t.includes("\r\nLOCATION:Promenade at Sunset Walk\r\n"), "LOCATION is the venue label the event page shows (no street stored, so no invented one)");
  ok(/GEO:28\.3\d+;-81\.\d+/.test(t), "GEO from the stored coordinates");
  ok(t.includes("URL:" + SITE + "/florida-events/" + REAL + "?utm_source=calendar&utm_medium=reminder"), "URL is the Wayfind event page with the calendar utm");
}

// ── 200: partner ticket link goes through the on-site go route ─────────────
{
  const res = await call("slug=jollywood-nights-2026&night=2026-12-05&remind=2h", { lookup: jollyLookup });
  const body = unfold(await res.text());
  ok(res.status === 200, "200 for a select-nights event with a night list");
  ok(/Tickets: https:\/\/www\.gowayfind\.com\/api\/commerce\/go\?provider=undercover_tourist&offer=\d+&surface=calendar_reminder&content=jollywood-nights-2026/.test(body.replace(/\\n/g, "\n")), "ticket line is the on-site /api/commerce/go URL with surface=calendar_reminder");
  ok(!/undercovertourist\.com/i.test(body), "no raw partner URL anywhere in the invite");
}
{
  const res = await call("slug=jollywood-nights-2026&night=2026-12-05&remind=2h", { lookup: jollyLookup });
  const body = unfold(await res.text());
  ok(body.includes("TRIGGER;VALUE=DATE-TIME:20261205T223000Z"), "alarm: 2 hours before 7:30 PM EST = 5:30 PM EST = 22:30Z");
  ok(body.includes("DTSTART;TZID=America/New_York:20261205T193000"), "DTSTART is the 7:30 PM start on the chosen night");
}

// ── 200: a range with no night list accepts any day inside it ──────────────
{
  const range = { ...jolly, slug: "a-range-event", event_id: "a-range-event", occurrence_dates: undefined, select_nights: true, start_date: "2026-11-13", end_date: "2027-01-04" };
  const ok1 = await call("slug=a-range-event&night=2026-12-20&remind=am", { lookup: async () => range });
  ok(ok1.status === 200 && unfold(await ok1.text()).includes("DTSTART;TZID=America/New_York:20261220T193000"), "a range with no night list: a day inside it downloads");
  const bad = await call("slug=a-range-event&night=2027-01-05&remind=am", { lookup: async () => range });
  ok(bad.status === 400, "a range with no night list: a day outside it is a 400");
}

// ── the invite comes from the stored row, never from the request ───────────
{
  const res = await call(`slug=${REAL}&night=2026-12-03&remind=eve&name=Evil&url=https://evil.example&title=Hacked&location=Nowhere&text=x`, { lookup: realLookup });
  const t = unfold(await res.text());
  ok(res.status === 200 && !/evil|Hacked|Nowhere/.test(t), "extra query params (name, url, title, location) never reach the invite");
}

// ── 400s: body says why ────────────────────────────────────────────────────
async function expect400(label, qs, deps = { lookup: realLookup }, pattern) {
  const res = await call(qs, deps);
  const h = headersOf(res);
  let body = null;
  try { body = await res.json(); } catch {}
  ok(res.status === 400, `${label}: status 400 (got ${res.status})`);
  ok(body && typeof body.error === "string" && body.error.length > 8 && (!pattern || pattern.test(body.error)), `${label}: JSON body explains (${body && body.error})`);
  ok(/^application\/json/.test(h["content-type"] || "") && h["cache-control"] === "private, no-store", `${label}: JSON content type and no-store`);
  ok(h["content-disposition"] === undefined, `${label}: no attachment header on an error`);
}
await expect400("missing slug", "night=2026-12-03&remind=eve", undefined, /slug/);
await expect400("unsafe slug", "slug=../../etc/passwd&night=2026-12-03&remind=eve", undefined, /slug/);
await expect400("uppercase slug", "slug=ABC&night=2026-12-03&remind=eve", undefined, /slug/);
await expect400("bad night", `slug=${REAL}&night=12/01/2026&remind=eve`, undefined, /night/);
await expect400("impossible night", `slug=${REAL}&night=2026-02-30&remind=eve`, undefined, /night/);
await expect400("missing remind", `slug=${REAL}&night=2026-12-03`, undefined, /remind/);
await expect400("unknown preset", `slug=${REAL}&night=2026-12-03&remind=tomorrow`, undefined, /Choose when/);
await expect400("night outside the run", `slug=${REAL}&night=2027-06-01&remind=eve`, undefined, /not one of/);
await expect400("night before the run", `slug=${REAL}&night=2026-10-01&remind=eve`, undefined, /not one of/);
await expect400("night inside the run but not a listed night", `slug=${REAL}&night=2026-12-01&remind=eve`, undefined, /not one of/);
await expect400("night not on the list", `slug=jollywood-nights-2026&night=2026-12-06&remind=eve`, { lookup: jollyLookup }, /not one of/);
await expect400("custom time in the past", `slug=${REAL}&night=2026-12-03&remind=2026-10-01T10:00`, undefined, /passed/);
await expect400("custom time after the start", `slug=${REAL}&night=2026-12-03&remind=2026-12-03T20:00`, undefined, /before the event/);
{
  // The night before the first night, after 6 PM: "the day before at 6 PM" has gone by.
  const res = await call(`slug=${REAL}&night=2026-11-19&remind=eve`, { lookup: realLookup, nowMs: Date.parse("2026-11-18T23:30:00Z") });
  const body = await res.json();
  ok(res.status === 400 && /already passed/.test(body.error), "a preset whose time has already passed is a 400 that says so");
}
{
  // The flag alone refuses, even when a start date is still on the row.
  const undated = { ...jolly, slug: "an-undated-season", season_undated: true };
  await expect400("undated season (flag, dates still present)", "slug=an-undated-season&night=2026-12-05&remind=eve", { lookup: async () => undated }, /no confirmed date/);
  const undatedNoDates = { ...jolly, slug: "an-undated-season", season_undated: true, start_date: null, end_date: null, occurrence_dates: undefined };
  await expect400("undated season (no dates)", "slug=an-undated-season&remind=eve", { lookup: async () => undatedNoDates }, /no confirmed date/);
  const watch = { ...jolly, slug: "a-watchlist-twin", christmas_watchlist: true };
  await expect400("watchlist twin", "slug=a-watchlist-twin&night=2026-12-05&remind=eve", { lookup: async () => watch }, /no confirmed date/);
  const past = { ...jolly, slug: "an-old-event", start_date: "2026-09-01", end_date: "2026-09-02", occurrence_dates: undefined, select_nights: false };
  await expect400("past event", "slug=an-old-event&remind=eve", { lookup: async () => past }, /already happened/);
  const noTime = { ...jolly, slug: "no-clock", start_time: null, end_time: null, start_date: "2026-12-05", end_date: "2026-12-05", occurrence_dates: undefined };
  await expect400("2 hours before with no start time", "slug=no-clock&night=2026-12-05&remind=2h", { lookup: async () => noTime }, /start time/);
  const allDay = await call("slug=no-clock&night=2026-12-05&remind=am", { lookup: async () => noTime });
  const allDayBody = unfold(await allDay.text());
  ok(allDay.status === 200 && allDayBody.includes("DTSTART;VALUE=DATE:20261205") && allDayBody.includes("DTEND;VALUE=DATE:20261206"), "an all day event downloads as VALUE=DATE");
}

// ── 404 and 503 ────────────────────────────────────────────────────────────
{
  const res = await call("slug=this-event-does-not-exist-2026&night=2026-12-03&remind=eve", { lookup: realLookup });
  const body = await res.json();
  ok(res.status === 404, `unknown slug: 404 (got ${res.status})`);
  ok(body && /No event/.test(body.error) && !headersOf(res)["content-disposition"] && headersOf(res)["cache-control"] === "private, no-store", "404 body names the problem, is not an attachment, and is no-store");
  const down = await call(`slug=${REAL}&night=2026-12-03&remind=eve`, { lookup: async () => { throw new Error("db down"); } });
  const dbody = await down.json();
  ok(down.status === 503 && /unavailable/.test(dbody.error) && !/db down/.test(JSON.stringify(dbody)), "a lookup failure is a 503 that does not leak the error (an outage is not a 404)");
}

// ── the real route file ────────────────────────────────────────────────────
{
  const res = await GET(new Request(SITE + "/api/events/reminder?night=2026-12-03&remind=eve"));
  const body = await res.json();
  ok(res.status === 400 && /slug/.test(body.error), "app/api/events/reminder/route.js GET delegates to the handler (400 on a missing slug)");
  const route = readFileSync(path.join(ROOT, "app/api/events/reminder/route.js"), "utf8");
  ok(/export async function GET\(request\)/.test(route) && /handleReminderRequest\(request\)/.test(route), "the route exports GET and calls handleReminderRequest");
  ok(!/process\.env|fetch\(|api\.anthropic|googleapis|serpapi|api\.viator/.test(route + readFileSync(path.join(ROOT, "lib/eventReminderRoute.js"), "utf8")), "no secrets, no network, no paid provider in the route or handler");
  const exportsInRoute = [...route.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]).sort();
  ok(exportsInRoute.join() === "GET,dynamic,runtime", `the route file exports only GET, dynamic and runtime (${exportsInRoute})`);
  const mw = readFileSync(path.join(ROOT, "middleware.js"), "utf8");
  const matcher = (/matcher\s*:\s*\[([\s\S]*?)\n\s*\],/.exec(mw) || [, ""])[1];
  ok(/"\/api\/events\/reminder"/.test(matcher), "middleware matcher rate limits /api/events/reminder");
  ok(/NAV_302_ROUTES\s*=\s*new Set\(\[[^\]]*"\/api\/events\/reminder"/.test(mw), "middleware treats it as a navigation (rate limit only, never a same origin 403 on a download)");
}

if (fail) { console.log(`test-event-reminder-route: FAIL (${fail} failed, ${pass} passed)`); process.exit(1); }
console.log(`test-event-reminder-route: OK (${pass} assertions on response bodies and headers: 200, every 400 with its message, 404, 503, route file wiring)`);
