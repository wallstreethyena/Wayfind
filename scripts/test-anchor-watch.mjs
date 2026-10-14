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
import { runWatch, daysUntilWindow, detectCancellation, datesNearName, renderReport, UA } from "./anchor-events/watch.mjs";

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
ok(pos.calls.filter((c) => !c.url.startsWith(SB.url)).every((c) => /^https:\/\/(gowayfind\.com|[a-z]+\.example)\//.test(c.url)), "outside requests go only to the site and anchor pages");
ok(pos.sleeps.length >= 2 && pos.sleeps.every((ms) => ms > 0 && ms <= 1000), `pacing: runWatch sleeps between outside requests (${pos.sleeps.length} sleeps)`);
ok(/Siesta Key|fx-sandcastle/.test(renderReport(pos.res)) && renderReport(pos.res).includes("| Anchor |"), "report renders a table");

// ---- NEGATIVE world: healthy rows, unreadable/benign pages
const goodRow = (o) => ({ event_series_id: null, state: "FL", lat: 27.3, lng: -82.5, place_id: "P1", category: "festival", hero_image: "https://img.test/x.jpg",
  link_ok: true, link_verdict: "alive", link_checked_at: "2026-10-13T00:00:00Z", last_verified_at: NOW.toISOString(), event_status: "scheduled", ...o });
const neg = await run({
  rows: [
    goodRow({ event_id: "fx-crystal-2026", event_name: "Siesta Key Crystal Classic", slug: "crystal-2026", start_date: "2026-11-13", end_date: "2026-11-15" }),
    goodRow({ event_id: "fx-gasparilla-2027", event_name: "Gasparilla Pirate Festival", slug: "gasparilla-2027", start_date: "2027-01-23", end_date: "2027-01-23" }),
  ],
  pages: {
    "https://gowayfind.com/florida-events/crystal-2026": { status: 200, body: "<h1>Siesta Key Crystal Classic</h1>" },
    "https://gowayfind.com/florida-events/gasparilla-2027": { status: 200, body: "<h1>Gasparilla Pirate Festival</h1>" },
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
         goodRow({ event_id: "fx-gasparilla-2027", event_name: "Gasparilla Pirate Festival", slug: "gasparilla-2027", start_date: "2027-01-23", end_date: "2027-01-23" })],
  pages: {
    "https://gowayfind.com/florida-events/crystal-2026": { status: 200, body: "Siesta Key Crystal Classic" },
    "https://gowayfind.com/florida-events/gasparilla-2027": { status: 200, body: "Gasparilla Pirate Festival" },
    "https://crystalclassic.example/": { status: 404, body: "gone" },
    "https://gasparillapiratefest.example/": { status: 200, body: "Gasparilla Pirate Festival 2019 was cancelled. Gasparilla Pirate Festival January 23, 2027." },
    "https://cortezfest.example/": { status: 200, body: "Cortez Commercial Fishing Festival 2027 dates soon" },
  },
});
ok(neg2.res.findings.length === 0, `NEGATIVE control 2: 404 official page + old-year cancellation + matching date => zero findings, got ${JSON.stringify(neg2.res.findings)}`);

// a DB failure must throw (script failure), not report "all clear"
let threw = false;
try { await runWatch({ anchors, today: TODAY, now: NOW, sb: SB, paceMs: 0, fetchImpl: async () => ({ ok: false, status: 500, json: async () => [] }) }); } catch { threw = true; }
ok(threw, "a failed database read throws instead of reporting no findings");

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
console.log(`test-anchor-watch: OK - ${pass} assertions (every finding kind has a positive and a negative control; GET-only; pacing; unknown-not-dead)`);
