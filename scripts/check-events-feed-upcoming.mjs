// scripts/check-events-feed-upcoming.mjs
//
// THE INCIDENT (2026-10-08). The Events tab read curated events through
// /api/events, which asked fetchCuratedEvents for `limit: 200` ordered by
// start_date. wf_events had grown to ~1,100 scheduled rows, 96 of them already
// over, so the first 200 by date ended on Oct 9. Every event starting Oct 10 or
// later (the whole Halloween season, ~900 rows) never reached the Events tab,
// while the home fall rail (a full paged read) showed them. Live check: Sarasota
// returned 30 curated rows and 8 fall events.
//
// THE FIX. fetchCuratedEvents takes `upcomingFrom` (a site day) and pages the
// whole filtered result; the events feed asks for upcoming rows with no limit.
//
// This guard asserts BY CALLING fetchCuratedEvents against an injected reader
// that evaluates the PostgREST filter it is handed, plus one syntactic check on
// the route (a Next route file cannot export its helper to be called).
import { readFileSync } from "node:fs";
import { fetchCuratedEvents, upcomingFilter, CuratedEventsUnavailableError } from "../lib/curatedEvents.js";

let pass = 0;
const fail = [];
const ok = (cond, msg) => { if (cond) pass += 1; else fail.push(msg); };
const okAsync = async (msg, fn) => { try { ok(await fn(), msg); } catch (err) { fail.push(msg + " (threw " + (err && err.message) + ")"); } };

const DAY = "2026-10-08";

// ── 1. the filter string, called ────────────────────────────────────────────
ok(upcomingFilter(DAY) === "end_date.gte.2026-10-08,and(end_date.is.null,start_date.gte.2026-10-08)",
  "upcomingFilter keeps rows ending today or later, or open-ended rows starting today or later");
for (const bad of ["", "10/08/2026", "2026-10-08;drop", null, "2026-10-08,id.eq.1"]) {
  let threw = null;
  try { upcomingFilter(bad); } catch (err) { threw = err; }
  ok(threw instanceof CuratedEventsUnavailableError, `upcomingFilter refuses ${JSON.stringify(bad)} (no filter injection, no silent full read)`);
}

// ── 2. a reader that evaluates exactly the filter it is given ───────────────
// Supports the two forms PostgREST receives from upcomingFilter. Anything else
// is an error, so a changed filter cannot pass by being ignored.
function evalOr(expr) {
  const m = /^end_date\.gte\.(\d{4}-\d{2}-\d{2}),and\(end_date\.is\.null,start_date\.gte\.(\d{4}-\d{2}-\d{2})\)$/.exec(expr);
  if (!m) throw new Error("mock reader cannot evaluate filter: " + expr);
  const [, a, b] = m;
  return (r) => (r.end_date != null && r.end_date >= a) || (r.end_date == null && r.start_date >= b);
}
function mockReader(rows) {
  const calls = { or: [], range: 0, limit: 0 };
  const build = () => {
    let pred = () => true;
    const chain = {
      select() { return chain; },
      in(col, vals) { const p = pred; pred = (r) => p(r) && vals.includes(r[col]); return chain; },
      or(expr) { calls.or.push(expr); const p = pred; const f = evalOr(expr); pred = (r) => p(r) && f(r); return chain; },
      order() { return chain; },
      abortSignal() { return chain; },
      limit(n) { calls.limit += 1; return Promise.resolve({ data: sorted().slice(0, n), error: null }); },
      range(from, to) { calls.range += 1; return Promise.resolve({ data: sorted().slice(from, to + 1), error: null }); },
    };
    const sorted = () => rows.filter(pred).sort((x, y) => (x.start_date < y.start_date ? -1 : x.start_date > y.start_date ? 1 : 0));
    return chain;
  };
  return { reader: { from() { return build(); } }, calls };
}

const row = (i, start, end, status = "scheduled") => ({
  event_id: "e" + i, slug: "s" + i, event_status: status, start_date: start, end_date: end,
  event_name: "Event " + i, city: "Sarasota", lat: 27.34, lng: -82.53, tags: ["halloween"],
});
// The incident shape at scale: 96 over, 104 starting on or before Oct 9, then
// ~900 later rows. A first-200-by-date read stops at Oct 9.
const rows = [];
let n = 0;
for (let i = 0; i < 96; i++) rows.push(row(n++, "2026-09-01", "2026-10-07"));
for (let i = 0; i < 104; i++) rows.push(row(n++, i % 2 ? "2026-10-08" : "2026-10-09", i % 3 ? null : "2026-10-31"));
for (let i = 0; i < 905; i++) rows.push(row(n++, "2026-10-" + String(10 + (i % 22)).padStart(2, "0"), i % 4 ? "2026-10-31" : null));
rows.push(row(n++, "2026-09-11", "2026-10-31"));           // ongoing season pass: started before today, still running
rows.push(row(n++, "2026-10-01", null));                   // open-ended row that started before today: over
rows.push(row(n++, "2026-10-20", "2026-10-20", "cancelled")); // never shown
const expected = rows.filter((r) => r.event_status !== "cancelled" &&
  ((r.end_date != null && r.end_date >= DAY) || (r.end_date == null && r.start_date >= DAY)));

await okAsync("the upcoming read returns EVERY row still running, past the old 200-row edge", async () => {
  const { reader, calls } = mockReader(rows);
  const got = await fetchCuratedEvents({ upcomingFrom: DAY, db: reader });
  return got.length === expected.length && expected.length > 1000 && calls.or.length >= 1 && calls.limit === 0 && calls.range >= 3;
});
await okAsync("…including a Halloween night event and a season pass that started before today", async () => {
  const { reader } = mockReader(rows);
  const got = await fetchCuratedEvents({ upcomingFrom: DAY, db: reader });
  const ids = new Set(got.map((r) => r.event_id));
  return got.some((r) => r.start_date >= "2026-10-31") && ids.has("e" + (n - 3));
});
await okAsync("…and NO row that is already over (ended yesterday, or open-ended and started before today)", async () => {
  const { reader } = mockReader(rows);
  const got = await fetchCuratedEvents({ upcomingFrom: DAY, db: reader });
  return !got.some((r) => (r.end_date != null && r.end_date < DAY) || (r.end_date == null && r.start_date < DAY)) &&
    !got.some((r) => r.event_id === "e" + (n - 2));
});
// Negative control: the old call really did lose the season. If this ever
// stops failing the mock is not modelling the incident.
await okAsync("negative control: the old limit-200 read misses every event after Oct 9", async () => {
  const { reader } = mockReader(rows);
  const got = await fetchCuratedEvents({ limit: 200, db: reader });
  return got.length === 200 && !got.some((r) => r.start_date > "2026-10-09");
});
await okAsync("positive control: without upcomingFrom no filter is sent (other callers unchanged)", async () => {
  const { reader, calls } = mockReader(rows);
  const got = await fetchCuratedEvents({ db: reader });
  return calls.or.length === 0 && got.length === rows.filter((r) => r.event_status !== "cancelled").length;
});
await okAsync("a malformed upcomingFrom fails loud instead of reading the whole table", async () => {
  const { reader, calls } = mockReader(rows);
  try { await fetchCuratedEvents({ upcomingFrom: "Oct 8", db: reader }); return false; }
  catch (err) { return err instanceof CuratedEventsUnavailableError && calls.range === 0; }
});

// ── 3. the events feed asks for upcoming rows, paged, never a first-N cut ───
// Syntactic: the call inside fromCuratedEvents, comments stripped.
const route = readFileSync(new URL("../app/api/events/route.js", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const at = route.indexOf("async function fromCuratedEvents(");
ok(at >= 0, "app/api/events still defines fromCuratedEvents");
const body = route.slice(at, route.indexOf("\nasync function ", at + 10));
// 2026-10-08: the read moved into curatedRowsLive() (one live read per warm
// lambda for 3 minutes, shared by fresh aggregations and cache-hit re-merges).
// Follow the code: fromCuratedEvents must read through it, and IT holds the call.
ok(/await curatedRowsLive\(\)/.test(body), "fromCuratedEvents reads through curatedRowsLive()");
const liveAt = route.indexOf("function curatedRowsLive(");
const liveBody = liveAt >= 0 ? route.slice(liveAt, route.indexOf("\n}\n", liveAt)) : "";
const calls = liveBody.match(/fetchCuratedEvents\(\{[^}]*\}\)/g) || [];
ok(calls.length === 1, `curatedRowsLive makes exactly one curated read (found ${calls.length})`);
ok(calls.length === 1 && /upcomingFrom:\s*(?:today\(\)|day)/.test(calls[0]) && /const day = today\(\);/.test(liveBody), "…for rows still running on the site's today");
ok(calls.length === 1 && !/\blimit\s*:/.test(calls[0]), "…with no first-N limit (the read that ended on Oct 9)");
ok(calls.length === 1 && /fresh:\s*true/.test(calls[0]), "…through the live reader");
// Positive controls: both absence probes DO find the shapes they ban (the
// pre-fix read and the retired stock lookup), so their silence above and below
// means the code is gone, not that the probe is blind.
ok(/\blimit\s*:/.test("fetchCuratedEvents({ limit: 400, fresh: true })"), "positive control: the limit probe finds a first-N read");
ok(/curatedSceneImage|stockPhotoPool/.test("const scene = await curatedSceneImage(row, city)"), "positive control: the stock probe finds the retired lookup");
ok(!/curatedSceneImage|stockPhotoPool/.test(body),
  "the curated read makes no stock photo lookups at all (retired 2026-10-08), so paging every upcoming row costs no photo calls");

if (fail.length) {
  console.error(`check-events-feed-upcoming: FAIL — ${fail.length} failed, ${pass} passed`);
  for (const m of fail) console.error("  ✗ " + m);
  process.exit(1);
}
console.log(`check-events-feed-upcoming: OK — ${pass} assertions; fetchCuratedEvents CALLED against a 1,108-row reader that evaluates the filter it is sent (negative control: the old limit-200 read loses everything after Oct 9); route call checked syntactically with comments stripped`);
