// scripts/test-event-safety.mjs — deterministic event safety (lib/eventSafety.js
// + /api/cron/event-safety) must keep ended events off the site and page when
// verification freshness degrades, WITHOUT depending on the LLM event-truth task.
//
// Incident: 2026-10-26/27 the event-truth scheduled task hit
// USAGE_LIMIT_REACHED; 47 ended events stayed `scheduled` and 347 imminent
// events went past the 1-day SLA, and nothing deterministic caught either.
//
// Asserted on the CALL (import + invoke), positive and negative controls each:
//   A. ROLLOVER selection: ended single-day, ended multi-day, ongoing multi-day,
//      future, null end_date, null dates, non-displayable statuses, sold_out,
//      verified occurrence days past end_date, the 23:30 ET vs next-UTC-day
//      boundary (EDT and EST), a Chicago row at 00:30 ET, note format,
//      no prefix stacking, idempotence.
//   B. FRESHNESS: imminent window, SLA threshold boundary (10 vs 11), fuse,
//      never-verified, useful vs zero-work pulses (attempted>0 succeeded=0 is
//      NOT useful), useful-pulse age > 30h, ended-still-displayable; the pulse
//      it writes is "dead" under public.wf_job_health's expression exactly when
//      degraded, and job-watch's classifyHealth pages it.
//   C. PARITY: DISPLAYABLE_STATUSES equals lib/curatedEvents.js DISPLAYABLE_STATUS.
//   D. ROUTE end to end against a fake PostgREST: PATCH is scoped (status +
//      ended filter + event_id), never DELETE, both pulses recorded; scheduled
//      in vercel.json.
//
// --red-prove re-runs A-B against mutated copies of the lib and requires RED.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as LIB_STATIC from "../lib/eventSafety.js";
import { classifyHealth, isDeterministicFailureNote } from "../lib/jobPulse.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const LIB = "lib/eventSafety.js";
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
let assertions = 0;
const ok = (v, m) => { assert.ok(v, m); assertions++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); assertions++; };
const H = 3600_000;

const ev = (o) => ({ event_id: o.id, event_status: "scheduled", timezone: "America/New_York", ...o });

// ── A ────────────────────────────────────────────────────────────────────────
function checkRollover(L) {
  const noon = new Date("2026-10-28T16:00:00Z"); // 12:00 EDT, 2026-10-28
  const cand = (row, now = noon, occ = null) => L.isRolloverCandidate(ev(row), now, occ);
  ok(cand({ id: "a1", start_date: "2026-10-27", end_date: null }), "ended single-day (null end) rolls over");
  ok(cand({ id: "a2", start_date: "2026-10-27", end_date: "2026-10-27" }), "ended single-day rolls over");
  ok(cand({ id: "a3", start_date: "2026-10-20", end_date: "2026-10-27" }), "ended multi-day rolls over");
  ok(!cand({ id: "a4", start_date: "2026-10-20", end_date: "2026-10-28" }), "multi-day ending TODAY is still running");
  ok(!cand({ id: "a5", start_date: "2026-10-01", end_date: "2026-11-30" }), "ongoing multi-day (season) is untouched");
  ok(!cand({ id: "a6", start_date: "2026-11-02", end_date: null }), "future event is untouched");
  ok(!cand({ id: "a7", start_date: "2026-10-28", end_date: null }), "single-day today (null end) is untouched");
  ok(!cand({ id: "a8", start_date: null, end_date: null }), "row with no dates is never rolled over");
  ok(!cand({ id: "a9", start_date: "2026-10-20", end_date: "2026-10-22", event_status: "completed" }), "already completed: untouched");
  ok(!cand({ id: "a10", start_date: "2026-10-20", end_date: "2026-10-22", event_status: "cancelled" }), "cancelled: untouched");
  ok(!cand({ id: "a11", start_date: "2026-10-20", end_date: "2026-10-22", event_status: "unannounced" }), "unannounced: untouched");
  ok(cand({ id: "a12", start_date: "2026-10-20", end_date: "2026-10-22", event_status: "sold_out" }), "ended sold_out rolls over");
  ok(!cand({ id: "a13", start_date: "2026-10-10", end_date: "2026-10-25" }, noon, ["2026-10-10", "2026-11-01"]),
    "recurring row with a verified occurrence day in the future is untouched");
  ok(cand({ id: "a14", start_date: "2026-10-10", end_date: "2026-10-25" }, noon, ["2026-10-10", "2026-10-25"]),
    "recurring row whose final occurrence passed rolls over");

  // Timezone boundary: 23:30 ET on 10-27 is already 10-28 in UTC.
  const lateEdt = new Date("2026-10-28T03:30:00Z");
  const afterMidnightEdt = new Date("2026-10-28T04:30:00Z");
  const endsOct27 = { id: "tz1", start_date: "2026-10-27", end_date: "2026-10-27" };
  eq(lateEdt.toISOString().slice(0, 10), "2026-10-28", "fixture: UTC day is already the next day");
  ok(!cand(endsOct27, lateEdt), "23:30 ET on the event's last day: NOT rolled over (UTC is next day)");
  ok(cand(endsOct27, afterMidnightEdt), "00:30 ET the next day: rolled over");
  const lateEst = new Date("2026-11-02T04:30:00Z"); // 23:30 EST 11-01 (after DST ends)
  ok(!cand({ id: "tz2", start_date: "2026-11-01", end_date: null }, lateEst), "23:30 EST boundary also respected");
  ok(cand({ id: "tz2b", start_date: "2026-11-01", end_date: null }, new Date("2026-11-02T05:30:00Z")), "00:30 EST next day rolls over");
  const chi = { id: "tz3", start_date: "2026-10-27", end_date: "2026-10-27", timezone: "America/Chicago" };
  ok(!cand(chi, afterMidnightEdt), "Chicago event at 00:30 ET (23:30 CT) is still on its last day");
  ok(cand(chi, new Date("2026-10-28T05:30:00Z")), "Chicago event rolls over after CT midnight");
  ok(cand({ ...endsOct27, id: "tz4", timezone: "Not/AZone" }, afterMidnightEdt), "unknown timezone falls back to ET day");

  // Plan + note + idempotence.
  const rows = [
    ev({ id: "p1", start_date: "2026-10-27", end_date: null, verify_note: "2026-10-26 daily: re-confirmed" }),
    ev({ id: "p2", start_date: "2026-10-20", end_date: "2026-10-26", verify_note: "ROLLOVER 2026-10-27: old" }),
    ev({ id: "p3", start_date: "2026-10-28", end_date: "2026-10-30" }),
  ];
  const plan = L.planRollover(rows, noon);
  eq(plan.today, "2026-10-28", "plan today is the ET day");
  eq(plan.candidates.map((c) => c.event_id), ["p1", "p2"], "plan selects only ended rows");
  ok(plan.candidates[0].note.startsWith("ROLLOVER 2026-10-28: scheduled→completed (final date 2026-10-27"), "note carries the ROLLOVER <date> prefix: " + plan.candidates[0].note);
  ok(plan.candidates[0].note.includes("prev: 2026-10-26 daily: re-confirmed"), "previous verify_note is preserved");
  ok(!plan.candidates[1].note.includes("prev: ROLLOVER"), "ROLLOVER prefixes are not stacked");
  const applied = rows.map((r) => (plan.candidates.some((c) => c.event_id === r.event_id) ? { ...r, event_status: "completed" } : r));
  eq(L.planRollover(applied, noon).candidates.length, 0, "idempotent: a second run selects nothing");
}

// ── B ────────────────────────────────────────────────────────────────────────
function checkFreshness(L) {
  const now = new Date("2026-10-28T16:00:00Z");
  const at = (hoursAgo) => new Date(now.getTime() - hoursAgo * H).toISOString();
  const useful = { id: 1, job: "event-truth-daily", ran_at: at(2), attempted: 441, succeeded: 440, failed: 1 };
  const fresh = (n, ageH = 2) => Array.from({ length: n }, (_, i) => ev({ id: `f${ageH}-${i}`, start_date: "2026-10-30", end_date: null, last_verified_at: at(ageH) }));

  let c = L.classifyFreshness(fresh(5), [useful], now);
  ok(!c.degraded, "fresh data + useful pulse 2h ago: not degraded " + JSON.stringify(c.reasons));
  eq([c.imminent, c.pastSla, c.pastFuse], [5, 0, 0], "counts for fresh fixture");
  ok(Math.abs(c.oldestAgeMs - 2 * H) < 1000, "oldest imminent verification age = 2h");

  // Out-of-window rows never count, however stale.
  const ignored = [
    ev({ id: "x1", start_date: "2026-11-06", last_verified_at: at(500) }), // 9 days out
    ev({ id: "x2", start_date: "2026-10-20", end_date: "2026-10-27", last_verified_at: at(500) }), // ended
    ev({ id: "x3", start_date: "2026-10-29", event_status: "completed", last_verified_at: at(500) }),
    ev({ id: "x4", start_date: null, last_verified_at: null }),
  ];
  c = L.classifyFreshness([...fresh(3), ...ignored], [useful], now);
  eq(c.imminent, 3, "non-imminent / non-displayable / dateless rows are ignored");
  ok(!c.degraded, "ignored stale rows do not degrade");
  ok(L.isImminent(ev({ start_date: "2026-10-01", end_date: "2026-11-30" }), now), "ongoing season (started earlier) is imminent");
  ok(L.isImminent(ev({ start_date: "2026-11-04" }), now), "start exactly 7 days out is imminent");

  // SLA threshold boundary: >10 pages, 10 does not.
  c = L.classifyFreshness([...fresh(10, 30), ...fresh(3)], [useful], now);
  eq(c.pastSla, 10, "10 past SLA");
  ok(!c.degraded, "exactly 10 past SLA does not page");
  c = L.classifyFreshness([...fresh(11, 30), ...fresh(3)], [useful], now);
  ok(c.degraded && c.reasons.some((r) => r.startsWith("imminent_past_sla 11")), "11 past SLA pages: " + c.reasons);

  // Fuse: one row > 3 days old pages on its own.
  c = L.classifyFreshness([...fresh(3), ...fresh(1, 80)], [useful], now);
  eq([c.pastSla, c.pastFuse], [1, 1], "80h-old row is past SLA and fuse");
  ok(c.degraded && c.reasons.some((r) => r.startsWith("imminent_past_fuse 1")), "fuse > 0 pages");
  c = L.classifyFreshness([ev({ id: "nv", start_date: "2026-10-29", last_verified_at: null })], [useful], now);
  ok(c.degraded && c.neverVerified === 1 && c.pastFuse === 1 && c.oldestAgeMs === Infinity, "never-verified imminent row counts as past fuse");

  // Useful work vs zero-work pulses.
  const zeroWorkAttempted = { id: 2, job: "event-truth-daily", ran_at: at(1), attempted: 441, succeeded: 0, failed: 441 };
  const zeroWorkIdle = { id: 3, job: "event-truth-daily", ran_at: at(1.5), attempted: 0, succeeded: 0, failed: 0 };
  const oldUseful = { ...useful, id: 4, ran_at: at(40) };
  ok(!L.isUsefulWorkPulse(zeroWorkAttempted), "attempted>0 succeeded=0 is NOT useful work");
  ok(!L.isUsefulWorkPulse(zeroWorkIdle), "attempted=0 is NOT useful work");
  ok(!L.isUsefulWorkPulse({ ...useful, job: "event-truth-sla" }), "an SLA pulse is not event-truth-daily work");
  ok(L.isUsefulWorkPulse(useful), "succeeded>0 is useful work");
  c = L.classifyFreshness(fresh(3), [zeroWorkAttempted, zeroWorkIdle, oldUseful], now);
  ok(c.degraded && c.lastUseful.id === 4 && c.reasons.some((r) => r.includes("40.0h old")), "recent zero-work pulses do not mask a 40h-old useful pulse: " + c.reasons);
  c = L.classifyFreshness(fresh(3), [zeroWorkAttempted], now);
  ok(c.degraded && c.lastUseful === null && c.reasons.some((r) => r.startsWith("no useful")), "only zero-work pulses: degraded");
  c = L.classifyFreshness(fresh(3), [], now);
  ok(c.degraded, "no pulses at all: degraded");
  c = L.classifyFreshness(fresh(3), [{ ...useful, ran_at: at(29) }], now);
  ok(!c.degraded, "useful pulse 29h ago is within 30h");

  c = L.classifyFreshness(fresh(3), [useful], now, { endedDisplayable: 2 });
  ok(c.degraded && c.reasons.includes("ended_still_displayable 2"), "ended rows still displayable after rollover page");

  // The pulse must route through the EXISTING job-watch path.
  const sqlDead = (p) => ((p.attempted > 0 || p.failed > 0) && p.succeeded === 0) || (p.succeeded === 0 && isDeterministicFailureNote(p.note));
  const good = L.freshnessPulse(L.classifyFreshness(fresh(3), [useful], now));
  const bad = L.freshnessPulse(L.classifyFreshness(fresh(3), [zeroWorkAttempted], now));
  ok(!sqlDead(good) && good.failed === 0 && good.succeeded === 1, "healthy freshness pulse is not dead: " + JSON.stringify(good));
  ok(sqlDead(bad) && bad.failed > 0 && bad.note.startsWith("DEGRADED:"), "degraded freshness pulse is dead under wf_job_health: " + JSON.stringify(bad));
  ok(bad.note.length <= 200, "pulse note fits wf_job_pulse.note (200)");
  const health = [{ job: L.FRESHNESS_JOB, attempted: 2, succeeded: 0, consecutive_zero: 2, last_note: bad.note }];
  ok(classifyHealth(health).incidents.length === 1, "job-watch classifyHealth pages two consecutive degraded runs");
  const rp = L.rolloverPulse({ today: "2026-10-28", attempted: 0, succeeded: 0, failed: 0, error: "wf_events read failed (HTTP 500)" });
  ok(isDeterministicFailureNote(rp.note) && rp.failed === 1, "rollover read failure pages on first sight (unavailable:)");
  const idle = L.rolloverPulse({ today: "2026-10-28", attempted: 0, succeeded: 0, failed: 0 });
  ok(!sqlDead(idle), "nothing to roll over is idle, not dead");
}

// ── C ────────────────────────────────────────────────────────────────────────
function checkParity() {
  const src = read("lib/curatedEvents.js");
  const m = src.match(/export const DISPLAYABLE_STATUS\s*=\s*new Set\(\[([^\]]*)\]\)/);
  ok(m, "lib/curatedEvents.js declares DISPLAYABLE_STATUS");
  const theirs = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort();
  ok(theirs.length > 0, "parsed a non-empty DISPLAYABLE_STATUS");
  eq([...LIB_STATIC.DISPLAYABLE_STATUSES].sort(), theirs, "eventSafety DISPLAYABLE_STATUSES == curatedEvents DISPLAYABLE_STATUS");
}

// ── D ────────────────────────────────────────────────────────────────────────
async function checkRoute() {
  const vercel = JSON.parse(read("vercel.json"));
  const crons = vercel.crons.filter((c) => c.path === "/api/cron/event-safety");
  ok(crons.length === 1 && /^\d+ \* \* \* \*$/.test(crons[0].schedule), "event-safety is scheduled hourly exactly once: " + JSON.stringify(crons));

  const BASE = "https://fixture.supabase.co";
  process.env.SUPABASE_URL = BASE;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-key";
  process.env.CRON_SECRET = "fixture-secret";
  const calls = [];
  const realFetch = globalThis.fetch;
  const nowIso = new Date().toISOString();
  const today = LIB_STATIC.dayInZone(new Date());
  const endedRow = { event_id: "ended-1", event_status: "scheduled", start_date: LIB_STATIC.addDays(today, -3), end_date: LIB_STATIC.addDays(today, -2), timezone: "America/New_York", verify_note: "old note" };
  let patched = false;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = (init.method || "GET").toUpperCase();
    calls.push({ url, method, body: init.body ? JSON.parse(init.body) : null });
    if (!url.startsWith(BASE)) throw new Error("unexpected host " + url);
    const json = (body, headers = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });
    if (url.includes("/rest/v1/wf_job_pulse") && method === "POST") return new Response(null, { status: 201 });
    if (url.includes("/rest/v1/wf_job_pulse")) return json([{ id: 9, job: "event-truth-daily", ran_at: nowIso, attempted: 10, succeeded: 10, failed: 0 }]);
    if (url.includes("/rest/v1/wf_events") && method === "PATCH") { patched = true; return json([{ event_id: "ended-1" }]); }
    if (url.includes("/rest/v1/wf_events") && url.includes("last_verified_at")) {
      const rows = [{ event_id: "im-1", event_status: "scheduled", start_date: today, end_date: null, last_verified_at: nowIso }];
      return json(rows, { "content-range": "0-0/1" });
    }
    if (url.includes("/rest/v1/wf_events")) return json(patched ? [] : [endedRow]);
    throw new Error("unexpected call " + method + " " + url);
  };
  try {
    const route = await import(pathToFileURL(path.join(ROOT, "app/api/cron/event-safety/route.js")).href);
    const denied = await route.GET(new Request("https://x.test/api/cron/event-safety"));
    eq(denied.status, 401, "unauthenticated request is refused");
    calls.length = 0;
    const res = await route.GET(new Request("https://x.test/api/cron/event-safety", { headers: { authorization: "Bearer fixture-secret" } }));
    const body = await res.json();
    ok(body.ok === true, "route ok on healthy fixture: " + JSON.stringify(body).slice(0, 400));
    ok(!calls.some((c) => c.method === "DELETE"), "route never issues DELETE");
    const patches = calls.filter((c) => c.method === "PATCH");
    eq(patches.length, 1, "exactly one row patched");
    const p = patches[0];
    ok(p.url.includes("event_id=eq.ended-1") && p.url.includes("event_status=in.(scheduled,sold_out)") && p.url.includes(`end_date.lt.${today}`), "PATCH is scoped by id + displayable status + ended filter: " + p.url);
    eq(Object.keys(p.body).sort(), ["event_status", "verify_note"], "PATCH writes only status + note");
    ok(p.body.event_status === "completed" && p.body.verify_note.startsWith(`ROLLOVER ${today}:`), "PATCH body completes with ROLLOVER note");
    const pulses = calls.filter((c) => c.method === "POST" && c.url.includes("wf_job_pulse")).map((c) => c.body);
    const roll = pulses.find((x) => x.job === "event-rollover");
    const fresh = pulses.find((x) => x.job === "event-freshness");
    ok(roll && roll.attempted === 1 && roll.succeeded === 1 && /1\/1 ended rows/.test(roll.note), "event-rollover pulse recorded with ids count: " + JSON.stringify(roll));
    ok(fresh && fresh.failed === 0 && fresh.succeeded === 1, "event-freshness pulse recorded healthy: " + JSON.stringify(fresh));
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ── runner ───────────────────────────────────────────────────────────────────
const asModule = (src) => import("data:text/javascript," + encodeURIComponent(src));
function mutated(find, replace) {
  const raw = read(LIB);
  assert.ok(raw.includes(find), `red-prove setup: ${LIB} must contain ${JSON.stringify(find)}`);
  const out = raw.replace(find, replace);
  assert.notEqual(out, raw, "red-prove setup: mutation did not apply");
  return out;
}

if (process.argv.includes("--red-prove")) {
  const MUTATIONS = [
    ["UTC day instead of ET day", "const site = dayInZone(now, SITE_TZ);", "const site = new Date(now).toISOString().slice(0, 10);"],
    ["rolls over on the last day", "return final < rowToday(row, now);", "return final <= rowToday(row, now);"],
    ["ignores row timezone", "if (!tz || tz === SITE_TZ) return site;", "return site;"],
    ["ignores end_date", "const days = [isoDay(row.end_date), isoDay(row.start_date)];", "const days = [isoDay(row.start_date)];"],
    ["ignores occurrence days", "if (Array.isArray(occurrences)) for", "if (false) for"],
    ["touches non-displayable rows", "if (!row || !DISPLAYABLE_STATUSES.includes(row.event_status)) return false;\n  const final", "if (!row) return false;\n  const final"],
    ["zero-work pulse counts as useful", "Number(p.succeeded || 0) > 0", "Number(p.attempted || 0) >= 0"],
    ["SLA threshold off by one", "if (pastSla > pastSlaThreshold)", "if (pastSla >= pastSlaThreshold)"],
    ["fuse never pages", "if (pastFuse > 0) reasons.push", "if (false) reasons.push"],
    ["useful-age never pages", "else if (usefulAgeMs > usefulMaxAgeMs)", "else if (false)"],
    ["degraded pulse not failed", "failed: c.degraded ? 1 : 0,", "failed: 0,"],
    ["ended-displayable ignored", "if (Number(endedDisplayable) > 0)", "if (false)"],
  ];
  let red = 0;
  for (const [label, find, replace] of MUTATIONS) {
    const L = await asModule(mutated(find, replace));
    let failed = false;
    try { checkRollover(L); checkFreshness(L); } catch { failed = true; }
    console.log(`  ${failed ? "RED  " : "GREEN"} ${label}`);
    if (failed) red++;
  }
  if (red !== MUTATIONS.length) {
    console.error(`test-event-safety --red-prove: ${MUTATIONS.length - red}/${MUTATIONS.length} mutation(s) stayed GREEN`);
    process.exit(1);
  }
  console.log(`test-event-safety --red-prove: all ${MUTATIONS.length} mutations RED`);
  process.exit(0);
}

checkRollover(LIB_STATIC);
checkFreshness(LIB_STATIC);
checkParity();
await checkRoute();
console.log(`test-event-safety: ${assertions} assertions OK (rollover selection incl. ET/UTC + CT boundaries, freshness thresholds + useful-work, curatedEvents parity, route e2e on fake PostgREST)`);
