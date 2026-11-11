#!/usr/bin/env node
// test-ticket-handoff-verdict — an ended, called-off or held show never reaches Ticketmaster.
//
// Incident (2026-11-11): Ed Sheeran played Tampa on Nov 7. The row rolled to
// `completed` and its page 404s, yet /api/ticketmaster/go still sent the ticket
// link to the Nov 7 listing and logged provider_redirect_started. Noah Kahan's
// 2027 row is `unannounced` (held) and must never hand off either.
//
// Two layers, both executed (no source regex for behavior):
//   A. lib/ticketHandoffVerdict.js called directly with a fake wf_events reader:
//      completed / cancelled / unannounced / postponed / uncertain refused,
//      a row whose last date is before today refused, scheduled + sold_out
//      future rows allowed, a read error or timeout allowed (fail open, so a
//      slow database never blocks a live sale), ids that are not ours skip the read.
//   B. The real GET handler, with PostHog capture intercepted: the Nov 7 Ed
//      Sheeran URL 302s to /events with one provider_redirect_refused
//      (refusal_class "event") and zero provider_redirect_started; a far-future
//      Ticketmaster URL still 302s to the Impact host with provider_redirect_started.
// The route's database read cannot run here (no Supabase in CI), so layer B
// covers the URL-date rule and layer A covers the row rule; a static check
// confirms the route passes the click's content id and a reader to the verdict.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const captured = [];
globalThis.fetch = async (url, init) => {
  if (String(url).includes("us.i.posthog.com/capture/")) {
    try { captured.push(JSON.parse((init && init.body) || "{}")); } catch {}
    return { ok: true, status: 200 };
  }
  throw new Error("guard: unexpected network call to " + url);
};
process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_guardtest_not_a_real_key";
delete process.env.WF_SUPPRESS_ANALYTICS;
delete process.env.REDIRECT_BURST_GATE;
delete process.env.SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const V = await import(REPO + "lib/ticketHandoffVerdict.js");
const TODAY = "2026-11-11";
const ED = "https://www.ticketmaster.com/ed-sheeran-loop-tour-tampa-florida-11-07-2026/event/0D006331D60A3A7A";
const FUTURE = "https://www.ticketmaster.com/some-show-tampa-florida-12-31-2099/event/0D00FFFFFFFFFFFF";
const NODATE = "https://www.ticketmaster.com/event/0D0065159FC782E6";

/* fake reader: from(t).select(c).eq(k,v).abortSignal(s).maybeSingle() */
const reads = [];
const fakeDb = (rows, mode = "ok") => ({
  from(table) {
    const q = { table };
    const chain = {
      select(c) { q.cols = c; return chain; },
      eq(k, v) { q.k = k; q.v = v; return chain; },
      abortSignal() { return chain; },
      async maybeSingle() {
        reads.push(q);
        if (mode === "error") return { data: null, error: { message: "boom" } };
        if (mode === "throw") throw new Error("timeout");
        return { data: rows[q.v] || null, error: null };
      },
    };
    return chain;
  },
});
const row = (status, start, end = null, tags = []) => ({ event_id: "x", event_status: status, start_date: start, end_date: end, tags });

/* A1. URL date */
ok(V.tmUrlEventDate(ED) === "2026-11-07", `tmUrlEventDate(Ed Sheeran) = 2026-11-07 (got ${V.tmUrlEventDate(ED)})`);
ok(V.tmUrlEventDate(NODATE) === null, "a Ticketmaster URL without a date in its path yields null");
ok(V.tmUrlEventDate("not a url") === null, "an unparsable URL yields null");
let r = await V.ticketHandoffVerdict({ url: ED, today: TODAY });
ok(!r.ok && r.reason === "event-ended-url-date", `Ed Sheeran URL (Nov 7) refused on ${TODAY} by its own date (got ${JSON.stringify(r)})`);
r = await V.ticketHandoffVerdict({ url: ED, today: "2026-11-07" });
ok(r.ok, "the same URL is still allowed ON the show day (only a date BEFORE today is ended)");

/* A2. row rule */
const ROWS = {
  "ed-sheeran-loop-tour-tampa-2026": row("completed", "2026-11-07", "2026-11-07"),
  "noah-kahan-last-of-the-bugs-tampa-2027": row("unannounced", "2027-04-29"),
  "x-cancelled": row("cancelled", "2026-12-01"),
  "x-postponed": row("postponed", "2026-12-01"),
  "x-uncertain": row("uncertain", "2026-12-01"),
  "x-scheduled-past": row("scheduled", "2026-11-01", "2026-11-10"),
  "x-scheduled-run": row("scheduled", "2026-11-01", "2026-12-31"),
  "x-scheduled": row("scheduled", "2026-12-05"),
  "x-sold-out": row("sold_out", "2026-12-05"),
  "x-xmas-done": row("completed", "2026-11-01", null, ["christmas", "lights"]),
};
const db = fakeDb(ROWS);
const refuse = { "ed-sheeran-loop-tour-tampa-2026": "event-not-sellable-completed", "noah-kahan-last-of-the-bugs-tampa-2027": "event-not-sellable-unannounced",
  "x-cancelled": "event-not-sellable-cancelled", "x-postponed": "event-not-sellable-postponed", "x-uncertain": "event-not-sellable-uncertain", "x-scheduled-past": "event-ended" };
for (const [id, reason] of Object.entries(refuse)) {
  r = await V.ticketHandoffVerdict({ url: NODATE, contentId: id, today: TODAY, db });
  ok(!r.ok && r.reason === reason, `${id} refused as ${reason} (got ${JSON.stringify(r)})`);
}
r = await V.ticketHandoffVerdict({ url: NODATE, contentId: "wfc:noah-kahan-last-of-the-bugs-tampa-2027", today: TODAY, db });
ok(!r.ok, "a wfc:-prefixed content id resolves to the same held row and is refused");
for (const id of ["x-scheduled", "x-sold-out", "x-scheduled-run"]) {
  r = await V.ticketHandoffVerdict({ url: FUTURE, contentId: id, today: TODAY, db });
  ok(r.ok && r.checked === "row", `${id} (live) is allowed after reading its row (got ${JSON.stringify(r)})`);
}
r = await V.ticketHandoffVerdict({ url: NODATE, contentId: "x-xmas-done", today: TODAY, db });
ok(!r.ok && r.christmas === true, "an ended Christmas-tagged row is refused and flagged for the Christmas page");
r = await V.ticketHandoffVerdict({ url: NODATE, contentId: "unknown-event-id", today: TODAY, db });
ok(r.ok && r.checked === "no-row", "an id with no row is allowed (no verdict without evidence)");

/* A3. fail open, and no read for ids that are not ours */
r = await V.ticketHandoffVerdict({ url: FUTURE, contentId: "x-cancelled", today: TODAY, db: fakeDb(ROWS, "error") });
ok(r.ok && r.checked === "row-unread", "a read error lets a live-dated click through (fail open)");
r = await V.ticketHandoffVerdict({ url: FUTURE, contentId: "x-cancelled", today: TODAY, db: fakeDb(ROWS, "throw") });
ok(r.ok && r.checked === "row-unread", "a timeout lets a live-dated click through (fail open)");
r = await V.ticketHandoffVerdict({ url: ED, contentId: "x-scheduled", today: TODAY, db: fakeDb(ROWS, "throw") });
ok(!r.ok, "fail open never overrides the URL's own past date");
const before = reads.length;
for (const id of ["gulf-coast-world-series-week-2026:rays-home", "tm_vvG1VZ_Gm3iJnK", "", null]) {
  r = await V.ticketHandoffVerdict({ url: FUTURE, contentId: id, today: TODAY, db });
  ok(r.ok, `content ${JSON.stringify(id)} (not one of our event ids) is allowed`);
}
ok(reads.length === before, `ids that are not ours never touch the database (${reads.length - before} reads)`);
ok(reads.every((q) => q.table === "wf_events" && q.k === "event_id"), "every read is wf_events by event_id");

/* B. the real route */
const mkHeaders = (o) => { const m = new Map(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v])); return { get: (n) => (m.has(String(n).toLowerCase()) ? m.get(String(n).toLowerCase()) : null) }; };
const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const NAV = { "user-agent": CHROME, "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", "sec-fetch-site": "same-origin", "sec-fetch-user": "?1", referer: "https://www.gowayfind.com/events" };
const { GET } = await import(REPO + "app/api/ticketmaster/go/route.js");
async function hit(dest, content) {
  const n = captured.length;
  const q = new URLSearchParams({ url: dest, surface: "event_detail", content, offer: content });
  const res = await GET({ url: "http://localhost:3000/api/ticketmaster/go?" + q, headers: mkHeaders(NAV) });
  await new Promise((s) => setImmediate(s));
  return { res, loc: res.headers.get("location") || "", events: captured.slice(n).map((e) => ({ event: e.event, p: e.properties || {} })) };
}
let h = await hit(ED, "ed-sheeran-loop-tour-tampa-2026");
const started = (x) => x.events.filter((e) => e.event === "provider_redirect_started").length;
const refused = (x) => x.events.filter((e) => e.event === "provider_redirect_refused");
ok(h.res.status === 302 && new URL(h.loc).pathname === "/events", `route: Ed Sheeran (Nov 7) 302s to /events, not Ticketmaster (status ${h.res.status}, Location ${h.loc})`);
ok(!/ticketmaster|evyy/i.test(h.loc), "route: the ended show's Location carries no partner host");
ok(started(h) === 0, `route: zero provider_redirect_started for the ended show (events: ${h.events.map((e) => e.event).join(",") || "none"})`);
ok(refused(h).length === 1 && refused(h)[0].p.refusal_class === "event" && refused(h)[0].p.refusal_reason === "event-ended-url-date",
  `route: one provider_redirect_refused event/event-ended-url-date (got ${JSON.stringify(refused(h).map((e) => [e.p.refusal_class, e.p.refusal_reason]))})`);
h = await hit(FUTURE, "x-scheduled");
ok(h.res.status === 302 && /evyy\.net/.test(h.loc) && started(h) === 1 && refused(h).length === 0,
  `route control: a live (2099) show still 302s to the Impact host with one provider_redirect_started (Location ${h.loc}, events ${h.events.map((e) => e.event).join(",")})`);

/* static: the route hands the click's content id and a reader to the verdict, before the partner URL is built */
const src = readFileSync(REPO + "app/api/ticketmaster/go/route.js", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const call = /await\s+ticketHandoffVerdict\(\{[^}]*contentId:\s*contentId[^}]*db:\s*[^}]+\}\)/.exec(src);
ok(!!call, "route awaits ticketHandoffVerdict({ ..., contentId: contentId..., db: ... }) (static: the row read cannot run without Supabase here)");
ok(call && call.index < src.indexOf("ticketOutUrl(rawUrl"), "route checks the verdict before building the partner URL");

if (fail.length) { console.error("test-ticket-handoff-verdict: FAIL\n  - " + fail.join("\n  - ")); process.exit(1); }
console.log(`test-ticket-handoff-verdict: OK — ${pass} assertions (Ed Sheeran Nov 7 refused by URL date and by row; Noah Kahan held row refused; cancelled/postponed/uncertain/past-run refused; scheduled/sold-out live allowed; read error and timeout fail open without overriding a past URL date; non-event ids never read; real route: ended show 302 /events with one refused and zero started, live control still reaches the Impact host)`);
