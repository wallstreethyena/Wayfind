#!/usr/bin/env node
// scripts/test-anchor-watch.mjs — proves scripts/anchor-events/watch.mjs fires
// each finding kind on a positive case and stays quiet on a negative control.
//
// CALL-LEVEL: imports runWatch/detectCancellation/etc. and invokes them with a
// stubbed fetch (no network, no database). The CLI cases spawn watch.mjs with
// --dry or with the anchor file missing. What this cannot prove: the shape of
// the real data/florida-anchor-events.json (a parallel lane owns it; the
// fixture mirrors the agreed shape) and the live PostgREST/column names, which
// are only exercised by the daily workflow itself.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runWatch, noProbeReason, NO_PROBE_HOSTS, daysUntilWindow, anchorSeriesId, detectCancellation, datesNearName, detectVenueDrift, venueTokens, renderReport, UA } from "./anchor-events/watch.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(ROOT, "scripts/anchor-events/fixtures/anchors.sample.json");
const anchors = JSON.parse(readFileSync(FIXTURE, "utf8")).anchors;

let pass = 0;
const failures = [];
const ok = (c, m) => { if (c) pass++; else failures.push(m); };

const TODAY = "2026-10-14";
const NOW = new Date("2026-10-14T15:00:00Z");
const SB = { url: "https://sb.test", key: "k" };

// ---- pure helpers
ok(daysUntilWindow(TODAY, 1, 1) === 79, `Jan window from Oct 14 is 79 days, got ${daysUntilWindow(TODAY, 1, 1)}`);
ok(daysUntilWindow(TODAY, 3, 3) === 138, "Mar window is 138 days (outside the 120 day lookahead)");
ok(daysUntilWindow(TODAY, 10, 10) === 0, "a window that is open now is 0 days away");
ok(daysUntilWindow(TODAY, 11, 3) === 18, "a window wrapping the year end still opens in 18 days");
ok(detectCancellation("The Foo Fest 2027 has been cancelled.", "Foo Fest", 2027) !== null, "control: plain cancellation near name+year is detected");
ok(detectCancellation("Foo Fest 2027 tickets. See our cancellation policy.", "Foo Fest", 2027) === null, "negative: 'cancellation policy' is not 'cancelled'");
ok(detectCancellation("If it rains, Foo Fest 2027 will be rescheduled.", "Foo Fest", 2027) === null, "negative: conditional rain wording is not a finding");
ok(detectCancellation("Other Fest 2027 was cancelled.", "Foo Fest", 2027) === null, "negative: a different event's cancellation is not ours");
ok(detectCancellation("Foo Fest was cancelled in 2019.", "Foo Fest", 2027) === null, "negative: an old-year cancellation is not the edition year");
ok(datesNearName("Foo Fest: March 4-6, 2027", "Foo Fest", 2027).join() === "2027-03-04", "date range start is extracted");
ok(datesNearName("Foo Fest: March 4, 2026", "Foo Fest", 2027).length === 0, "other-year dates are ignored");

// ---- stub world
function world({ rows, photos = [], pages, calls }) {
  return async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method || "GET", ua: init.headers && (init.headers["User-Agent"] || init.headers.apikey ? init.headers["User-Agent"] : null) });
    if (u.startsWith(SB.url + "/rest/v1/wf_events")) return { ok: true, status: 200, json: async () => rows };
    if (u.startsWith(SB.url + "/rest/v1/wf_place_photo")) return { ok: true, status: 200, json: async () => photos };
    const hit = pages[u] || pages[u.replace(/\/$/, "")] || pages[u + "/"];
    if (!hit) return { ok: false, status: 404, text: async () => "" };
    if (hit === "THROW") throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    return { ok: hit.status >= 200 && hit.status < 300, status: hit.status, text: async () => hit.body || "" };
  };
}
const run = async (w, extra = {}) => {
  const calls = [];
  const sleeps = [];
  const res = await runWatch({ anchors, today: TODAY, now: NOW, sb: SB, paceMs: 1000, sleep: async (ms) => { sleeps.push(ms); },
    probeLink: async () => ({ verdict: "unknown", reason: "stub" }), fetchImpl: world({ ...w, calls }), ...extra });
  return { res, calls, sleeps };
};
const has = (res, id, kind, issue) => res.findings.some((f) => f.anchor_id === id && f.kind === kind && (!issue || f.issue === issue));

// ---- POSITIVE world: everything wrong
const badRow = { event_id: "fx-crystal-2026", event_series_id: null, event_name: "Siesta Key Crystal Classic", year: 2026, slug: "crystal-2026",
  start_date: "2026-11-13", end_date: "2026-11-15", event_status: "scheduled", state: "FL", lat: null, lng: null, place_id: "P1",
  category: null, hero_image: null, link_ok: false, link_verdict: "dead", link_checked_at: "2026-10-10T00:00:00Z",
  official_event_url: "https://crystalclassic.example/", last_verified_at: null };
const pos = await run({
  rows: [badRow],
  photos: [],
  pages: {
    "https://gowayfind.com/florida-events/crystal-2026": { status: 200, body: "<html><title>Not found</title>Sorry nothing here, a long enough page body to pass.</html>" },
    "https://crystalclassic.example/": { status: 200, body: "<h1>Siesta Key Crystal Classic</h1><p>Siesta Key Crystal Classic November 20, 2026. Update: the Siesta Key Crystal Classic 2026 has been postponed.</p>" },
    "https://gasparillapiratefest.example/": { status: 403, body: "Forbidden" },
    "https://cortezfest.example/": { status: 200, body: "<p>Cortez Commercial Fishing Festival returns March 19, 2027 - see you there!</p>" },
  },
});
ok(has(pos.res, "fx-gasparilla", "missing_edition"), "POSITIVE missing_edition: window opens in 79 days, no live row");
ok(!has(pos.res, "fx-crystal-2026", "missing_edition") && !has(pos.res, "fx-sandcastle", "missing_edition"), "missing_edition does not fire for an anchor that has a live row");
for (const issue of ["no_coordinates", "no_photo", "no_category", "link_not_ok", "page_soft_404"])
  ok(has(pos.res, "fx-sandcastle", "row_health", issue), `POSITIVE row_health/${issue}`);
ok(has(pos.res, "fx-sandcastle", "cancel_signal"), "POSITIVE cancel_signal from 'postponed' near name and year");
ok(has(pos.res, "fx-sandcastle", "date_drift"), "POSITIVE date_drift: page Nov 20 vs row Nov 13");
ok(has(pos.res, "fx-seafood", "new_announcement"), "POSITIVE new_announcement for the expected_undated anchor");
ok(has(pos.res, "fx-sandcastle", "stale_verification"), "POSITIVE stale_verification: never verified");
ok(!pos.res.findings.some((f) => f.anchor_id === "fx-cancelled"), "state=cancelled anchors are skipped entirely");
ok(!pos.res.findings.some((f) => f.anchor_id === "fx-gasparilla" && f.kind !== "missing_edition"), "403 on an official page produces no finding (unknown, not dead/cancelled)");
ok(pos.res.unknown.some((u) => u.anchor_id === "fx-gasparilla" && u.reason === "http-403"), "403 is listed under 'could not check'");
ok(pos.calls.every((c) => c.method === "GET"), "read-only: every request in the run was a GET");
ok(pos.calls.filter((c) => !c.url.startsWith(SB.url)).every((c) => /^https:\/\/(gowayfind\.com|[a-z]+\.example)(\/|$)/.test(c.url)), "outside requests go only to the site and anchor pages");
ok(pos.sleeps.length >= 2 && pos.sleeps.every((ms) => ms > 0 && ms <= 1000), `pacing: runWatch sleeps between outside requests (${pos.sleeps.length} sleeps)`);
ok(/Siesta Key|fx-sandcastle/.test(renderReport(pos.res)) && renderReport(pos.res).includes("| Anchor |"), "report renders a table");

// ---- NEGATIVE world: healthy rows, unreadable/benign pages
const goodRow = (o) => ({ event_series_id: null, state: "FL", lat: 27.3, lng: -82.5, place_id: "P1", category: "festival", hero_image: "https://img.test/x.jpg",
  link_ok: true, link_verdict: "alive", link_checked_at: "2026-10-13T00:00:00Z", last_verified_at: NOW.toISOString(), event_status: "scheduled", ...o });
const neg = await run({
  rows: [
    goodRow({ event_id: "fx-crystal-2026", event_name: "Siesta Key Crystal Classic", slug: "crystal-2026", start_date: "2026-11-13", end_date: "2026-11-15" }),
    goodRow({ event_id: "fx-gasparilla-2027", event_name: "Gasparilla Pirate Festival", slug: "gasparilla-2027", start_date: "2027-01-23", end_date: "2027-01-23" }),
    goodRow({ event_id: "other-id", event_series_id: "series-xyz", event_name: "Winter Lights Series", slug: "series-ev", start_date: "2026-12-05", end_date: "2026-12-20" }),
  ],
  pages: {
    "https://gowayfind.com/florida-events/crystal-2026": { status: 200, body: "<h1>Siesta Key Crystal Classic</h1>" },
    "https://gowayfind.com/florida-events/gasparilla-2027": { status: 200, body: "<h1>Gasparilla Pirate Festival</h1>" },
    "https://gowayfind.com/florida-events/series-ev": { status: 200, body: "<h1>Winter Lights Series</h1>" },
    "https://crystalclassic.example/": { status: 200, body: "<p>If it rains the Siesta Key Crystal Classic 2026 will be rescheduled. Siesta Key Crystal Classic November 13, 2026. See our cancellation policy.</p>" },
    "https://gasparillapiratefest.example/": { status: 200, body: "<title>Just a moment...</title>Enable JavaScript and cookies to continue" },
    "https://cortezfest.example/": "THROW",
  },
});
ok(neg.res.findings.length === 0, `NEGATIVE control: healthy world yields zero findings, got ${JSON.stringify(neg.res.findings)}`);
ok(neg.res.unknown.some((u) => u.reason === "bot-challenge"), "a 200 bot-challenge page is 'could not check', not a finding");
ok(neg.res.unknown.some((u) => u.reason === "timeout"), "a timeout is 'could not check', not a finding");

// each single negative: 404 official page and cancelled wording on the wrong year
const neg2 = await run({
  rows: [goodRow({ event_id: "fx-crystal-2026", event_name: "Siesta Key Crystal Classic", slug: "crystal-2026", start_date: "2026-11-13", end_date: "2026-11-15" }),
         goodRow({ event_id: "fx-gasparilla-2027", event_name: "Gasparilla Pirate Festival", slug: "gasparilla-2027", start_date: "2027-01-23", end_date: "2027-01-23" }),
         goodRow({ event_id: "other-id", event_series_id: "series-xyz", event_name: "Winter Lights Series", slug: "series-ev", start_date: "2026-12-05", end_date: "2026-12-20" }),],
  pages: {
    "https://gowayfind.com/florida-events/crystal-2026": { status: 200, body: "Siesta Key Crystal Classic" },
    "https://gowayfind.com/florida-events/gasparilla-2027": { status: 200, body: "Gasparilla Pirate Festival" },
    "https://gowayfind.com/florida-events/series-ev": { status: 200, body: "Winter Lights Series" },
    "https://crystalclassic.example/": { status: 404, body: "gone" },
    "https://gasparillapiratefest.example/": { status: 200, body: "Gasparilla Pirate Festival 2019 was cancelled. Gasparilla Pirate Festival January 23, 2027." },
    "https://cortezfest.example/": { status: 200, body: "Cortez Commercial Fishing Festival 2027 dates soon" },
  },
});
ok(neg2.res.findings.length === 0, `NEGATIVE control 2: 404 official page + old-year cancellation + matching date => zero findings, got ${JSON.stringify(neg2.res.findings)}`);

// ---- policy: Disney hosts are never fetched (AGENTS.md section 8)
ok(NO_PROBE_HOSTS.includes("disneyworld.disney.go.com"), "NO_PROBE_HOSTS names the AGENTS.md host");
const disneyCalls = pos.calls.filter((c) => !c.url.startsWith(SB.url) && /disney/i.test(c.url));
ok(disneyCalls.length === 0, `disney anchor makes 0 requests, got ${disneyCalls.length}`);
ok(pos.res.unknown.some((u) => u.anchor_id === "fx-disney" && u.reason === "policy-no-probe"), "disney anchor lands in 'could not check' as policy-no-probe");
ok(!pos.res.findings.some((f) => f.anchor_id === "fx-disney"), "disney anchor yields no findings");
ok(noProbeReason({ official_domain: "x.example", expected_edition: { source_url: "https://sub.disneyworld.disney.go.com/a" } }) === "policy-no-probe", "a disney SUBDOMAIN in source_url is blocked");
ok(noProbeReason({ official_domain: "disneyworld.disney.go.com", expected_edition: {} }) === "policy-no-probe", "disney official_domain alone is blocked");
ok(noProbeReason({ official_domain: "gasparillapiratefest.example", expected_edition: { source_url: "https://gasparillapiratefest.example/" } }) === null, "negative: an ordinary host is not blocked");
{
  const calls = [];
  const optOut = [{ ...anchors[0], anchor_id: "fx-optout", probe: false }];
  const r = await runWatch({ anchors: optOut, today: TODAY, now: NOW, sb: SB, paceMs: 0, probeLink: async () => ({ verdict: "unknown", reason: "stub" }),
    fetchImpl: world({ rows: [], pages: {}, calls }) });
  ok(!calls.some((c) => c.url.includes("gasparillapiratefest")) && r.unknown.some((u) => u.reason === "anchor-opted-out"), "probe:false anchor makes no official-page request");
}

// ---- series matching: anchor_id differs from event_series_id
ok(!has(neg.res, "fx-series-anchor", "missing_edition"), "series row (event_series_id=series-xyz, other event_id) satisfies the anchor");
ok(has(pos.res, "fx-series-anchor", "missing_edition"), "POSITIVE: with no row for the series the anchor is missing an edition");
ok(anchorSeriesId({ anchor_id: "x", expected_edition: { event_series_id: "s1" } }) === "s1", "series id read from expected_edition (the #1751 file shape)");
ok(anchorSeriesId({ anchor_id: "x", event_series_id: "s2", expected_edition: {} }) === "s2", "top-level series id honored");
ok(anchorSeriesId({ anchor_id: "x", expected_edition: {} }) === null, "no series id -> null (negative control)");

// ---- noise cuts
ok(datesNearName("Siesta Key Crystal Classic tickets on sale November 20, 2026", "Siesta Key Crystal Classic", 2026).length === 0, "negative: 'on sale' date is ignored");
ok(datesNearName("Siesta Key Crystal Classic vendor deadline November 20, 2026", "Siesta Key Crystal Classic", 2026).length === 0, "negative: 'deadline' date is ignored");
ok(datesNearName("Siesta Key Crystal Classic updated November 20, 2026", "Siesta Key Crystal Classic", 2026).length === 0, "negative: 'updated' date is ignored");
ok(datesNearName("Siesta Key Crystal Classic is November 20, 2026", "Siesta Key Crystal Classic", 2026).join() === "2026-11-20", "control: a plain event date still counts");
ok(detectCancellation("Siesta Key Crystal Classic 2026 refund policy: cancelled tickets are non-refundable.", "Siesta Key Crystal Classic", 2026) === null, "negative: refund/policy boilerplate is not a cancel signal");
ok(detectCancellation("Siesta Key Crystal Classic 2026 terms: in the event of cancellation tickets are non-refundable", "Siesta Key Crystal Classic", 2026) === null, "negative: 'in the event' boilerplate is not a cancel signal");

// a DB failure must throw (script failure), not report "all clear"
let threw = false;
try { await runWatch({ anchors, today: TODAY, now: NOW, sb: SB, paceMs: 0, fetchImpl: async () => ({ ok: false, status: 500, json: async () => [] }) }); } catch { threw = true; }
ok(threw, "a failed database read throws instead of reporting no findings");

// ---- venue_drift / expired_listed / undated_in_window (inline anchors; fixture file untouched)
const mk = (id, name, venue, o = {}) => ({ anchor_id: id, name, venue, official_domain: `${id}.example`, typical_window: { start_month: 3, end_month: 3 }, ...o.top,
  expected_edition: { year: 2027, state: "confirmed_dated", event_id: `${id}-2027`, source_url: `https://${id}.example/`, ...o.ed } });
const liveRow = (id, name, o = {}) => ({ event_id: `${id}-2027`, event_series_id: null, event_name: name, slug: `${id}-s`, start_date: "2027-03-05", end_date: "2027-03-07",
  event_status: "scheduled", state: "FL", lat: 27.3, lng: -82.5, place_id: null, category: "festival", hero_image: "https://img.test/x.jpg",
  link_ok: true, link_verdict: "alive", link_checked_at: "2026-10-13T00:00:00Z", last_verified_at: NOW.toISOString(), ...o });
const vAnchors = [
  mk("fx-bowl", "Citrus Bowl Fest", "Hard Rock Stadium"),
  mk("fx-vinoy", "Bay Art Fest", "Straub Park"),
  mk("fx-same", "Same Place Fest", "Straub Park"),
  mk("fx-nocue", "No Cue Fest", "Straub Park"),
  mk("fx-recap", "Recap Fest", "Straub Park"),
  mk("fx-403", "Blocked Fest", "Straub Park"),
];
const vRows = vAnchors.map((a) => liveRow(a.anchor_id, a.name));
const vRun = (pages, as = vAnchors, rows = vRows) => run({ rows, pages }, { anchors: as });
const vPages = (m) => { const o = {}; for (const a of vAnchors) o[`https://${a.anchor_id}.example/`] = m[a.anchor_id] || { status: 200, body: "<p>nothing</p>" };
  for (const r of vRows) o[`https://gowayfind.com/florida-events/${r.slug}`] = { status: 200, body: r.event_name }; return o; };
const vd = await vRun(vPages({
  "fx-bowl": { status: 200, body: "<h1>Citrus Bowl Fest</h1><p>March 5-7, 2027. The Citrus Bowl Fest moves to Camping World Stadium this year.</p>" },
  "fx-vinoy": { status: 200, body: "<h1>Bay Art Fest</h1><p>Bay Art Fest March 5, 2027. Venue: Vinoy Park, downtown.</p>" },
  "fx-same": { status: 200, body: "<p>Same Place Fest March 5, 2027 at Straub Park, all weekend. Venue: Vinoy Park lot B parking.</p>" },
  "fx-nocue": { status: 200, body: "<p>No Cue Fest March 5, 2027. Bring friends to Vinoy Park or anywhere, Vinoy Park is lovely.</p>" },
  "fx-recap": { status: 200, body: "<p>Recap Fest 2025 was held at Waterfront Plaza and was great. Recap Fest 2027 is coming.</p>" },
  "fx-403": { status: 403, body: "Forbidden" },
}));
const vdOf = (id) => vd.res.findings.find((f) => f.anchor_id === id && f.kind === "venue_drift");
ok(vdOf("fx-bowl") && /Hard Rock Stadium/.test(vdOf("fx-bowl").detail) && /Camping World Stadium/.test(vdOf("fx-bowl").detail), "POSITIVE venue_drift: 'moves to Camping World Stadium' vs Hard Rock Stadium, report names both");
ok(vdOf("fx-vinoy") && /Straub Park/.test(vdOf("fx-vinoy").detail) && /Vinoy Park/.test(vdOf("fx-vinoy").detail), "POSITIVE venue_drift: 'Venue: Vinoy Park' vs Straub Park");
ok(!vdOf("fx-same"), "negative: a page that mentions the row venue is not venue_drift");
ok(!vdOf("fx-nocue"), "negative: a page with the edition date but no explicit venue cue is silent");
ok(!vdOf("fx-recap"), "negative: past-year recap ('2025 was held at X') with no edition-year date nearby is silent");
ok(!vdOf("fx-403") && vd.res.unknown.some((u) => u.anchor_id === "fx-403" && u.reason === "http-403"), "negative: 403 page is unknown, not a venue_drift finding");
ok(vd.res.findings.filter((f) => f.kind === "venue_drift").length === 2, "exactly the two positive controls produce venue_drift");
ok(detectVenueDrift("Zed Fest March 5, 2027 at Vinoy Park.", "Zed Fest", "Straub Park", 2027)?.phrase === "Vinoy Park", "unit: bare 'at <Proper Noun>' cue near name and edition date");
ok(detectVenueDrift("Zed Fest March 5, 2027 at 7pm bring a chair", "Zed Fest", "Straub Park", 2027) === null, "negative: 'at 7pm' is not a venue");
ok(detectVenueDrift("Zed Fest March 5, 2027 at Saturday Market", "Zed Fest", "Straub Park", 2027) === null, "negative: 'at Saturday...' is not a venue");
ok(detectVenueDrift("Zed Fest March 5, 2027 Venue: Vinoy Park", "Zed Fest", "The Park Center", 2027) === null, "negative: a venue made only of generic words has no tokens, so stay silent");
ok(venueTokens("The Hard Rock Stadium Downtown").join() === "hard,rock", "venue tokens drop generic words");

// expired_listed
const exA = [mk("fx-ex", "Ended Fest", "Somewhere Pier"), mk("fx-exok", "Current Fest", "Somewhere Pier"), mk("fx-exsame", "Sameday Fest", "Somewhere Pier"), mk("fx-exundated", "Undated Ended Fest", "Somewhere Pier", { ed: { state: "expected_undated" } })];
const exRows = [liveRow("fx-ex", "Ended Fest", { start_date: "2026-10-01", end_date: "2026-10-03" }),
  liveRow("fx-exok", "Current Fest", { start_date: "2026-10-12", end_date: "2026-10-14" }),
  liveRow("fx-exsame", "Sameday Fest", { start_date: "2026-10-13", end_date: null }),
  liveRow("fx-exundated", "Undated Ended Fest", { start_date: "2026-10-01", end_date: "2026-10-03" })];
const ex = await run({ rows: exRows, pages: {} }, { anchors: exA });
ok(has(ex.res, "fx-ex", "expired_listed") && /edition ended; anchor needs the next edition/.test(ex.res.findings.find((f) => f.anchor_id === "fx-ex" && f.kind === "expired_listed").detail), "POSITIVE expired_listed: confirmed_dated anchor, end_date before today");
ok(!has(ex.res, "fx-exok", "expired_listed"), "negative: row ending today is not expired");
ok(has(ex.res, "fx-exsame", "expired_listed"), "POSITIVE expired_listed: no end_date uses start_date (yesterday)");
ok(!has(ex.res, "fx-exundated", "expired_listed"), "negative: only confirmed_dated anchors are checked for expiry");
ok(!has((await run({ rows: [...exRows, liveRow("fx-ex", "Ended Fest", { event_id: "fx-ex-2028", event_series_id: "fx-ex", start_date: "2027-10-01", end_date: "2027-10-03" })], pages: {} }, { anchors: exA })).res, "fx-ex", "expired_listed"), "negative: a later live row for the anchor means it has already moved on");

// undated_in_window (rule: replaces missing_edition inside 60 days; beyond that missing_edition stays)
const uA = [
  mk("fx-u-now", "Open Now Fest", "Pier", { ed: { state: "expected_undated", event_id: null }, top: { typical_window: { start_month: 10, end_month: 10 } } }),
  mk("fx-u-soon", "Soon Fest", "Pier", { ed: { state: "expected_undated", event_id: null }, top: { typical_window: { start_month: 12, end_month: 12 } } }),
  mk("fx-u-mid", "Mid Fest", "Pier", { ed: { state: "expected_undated", event_id: null }, top: { typical_window: { start_month: 1, end_month: 1 } } }),
  mk("fx-u-far", "Far Fest", "Pier", { ed: { state: "expected_undated", event_id: null } }),
  mk("fx-u-lead", "Lead Fest", "Pier", { ed: { state: "expected_undated", event_id: null, lead_dates: ["2026-11-20"] }, top: { typical_window: { start_month: 12, end_month: 12 } } }),
  mk("fx-u-pub", "Published Fest", "Pier", { ed: { state: "expected_undated", event_id: null, year: 2026 }, top: { typical_window: { start_month: 12, end_month: 12 } } }),
];
const uPages = { "https://fx-u-pub.example/": { status: 200, body: "<p>Published Fest December 5, 2026</p>" } };
for (const a of uA) if (a.anchor_id !== "fx-u-pub") uPages[`https://${a.anchor_id}.example/`] = { status: 200, body: "<p>Coming soon</p>" };
const un = await run({ rows: [], pages: uPages }, { anchors: uA });
ok(has(un.res, "fx-u-now", "undated_in_window") && !has(un.res, "fx-u-now", "missing_edition"), "POSITIVE undated_in_window: window open now, and NOT double reported as missing_edition");
ok(has(un.res, "fx-u-soon", "undated_in_window") && !has(un.res, "fx-u-soon", "missing_edition"), "POSITIVE undated_in_window: window opens in 48 days");
ok(!has(un.res, "fx-u-mid", "undated_in_window") && has(un.res, "fx-u-mid", "missing_edition"), "boundary: window 79 days away stays missing_edition only");
ok(!has(un.res, "fx-u-far", "undated_in_window") && !has(un.res, "fx-u-far", "missing_edition"), "negative: window 138 days away yields neither");
ok(!has(un.res, "fx-u-lead", "undated_in_window"), "negative: lead_dates present suppresses undated_in_window");
ok(!has(un.res, "fx-u-pub", "undated_in_window") && has(un.res, "fx-u-pub", "new_announcement"), "negative: page already shows dates -> new_announcement only, not 'not published'");
ok(un.res.findings.filter((f) => f.kind === "undated_in_window").length === 2, "exactly two undated_in_window findings");

// legend covers every kind
{
  const md = renderReport({ today: TODAY, anchors_total: 0, anchors_checked: 0, findings: [], unknown: [] });
  for (const k of ["missing_edition", "row_health", "cancel_signal", "date_drift", "new_announcement", "stale_verification", "venue_drift", "expired_listed", "undated_in_window"])
    ok(md.includes("`" + k + "`"), `legend lists ${k}`);
  ok(/no pinned or featured field/.test(md), "report keeps the no-pinned-column note");
}

// ---- CLI
const env = { ...process.env }; delete env.SUPABASE_URL; delete env.SUPABASE_SERVICE_ROLE_KEY; delete env.NEXT_PUBLIC_SUPABASE_URL; delete env.GITHUB_OUTPUT;
const cli = (args) => spawnSync(process.execPath, [path.join(ROOT, "scripts/anchor-events/watch.mjs"), ...args], { encoding: "utf8", env, cwd: ROOT });
const missing = cli(["--anchors", "/nonexistent/anchors.json"]);
ok(missing.status === 0 && /no anchor file yet/.test(missing.stdout + missing.stderr), `missing anchor file exits 0 with a clear note (rc=${missing.status})`);
const dry = cli(["--dry", "--anchors", FIXTURE]);
ok(dry.status === 0 && /DRY RUN/.test(dry.stdout), `--dry on the fixture exits 0 and labels itself (rc=${dry.status})`);
const dryJson = cli(["--dry", "--json", "--anchors", FIXTURE]);
let parsed = null; try { parsed = JSON.parse(dryJson.stdout); } catch { /* asserted below */ }
ok(dryJson.status === 0 && parsed && Array.isArray(parsed.findings), "--json prints parseable JSON with a findings list");
const noEnv = cli(["--anchors", FIXTURE]);
ok(noEnv.status === 2 && /SUPABASE_URL/.test(noEnv.stderr), `real run without credentials is a script failure (rc=${noEnv.status})`);
ok(UA === "WayfindAnchorWatch/1.0 (+https://gowayfind.com)", "User-Agent is the agreed string");

if (failures.length) {
  console.error(`test-anchor-watch: ${pass} passed, ${failures.length} FAILED`);
  for (const f of failures) console.error("  x " + f);
  process.exit(1);
}
console.log(`test-anchor-watch: OK - ${pass} assertions (every finding kind has a positive and a negative control, incl. venue_drift/expired_listed/undated_in_window; GET-only; pacing; unknown-not-dead)`);
