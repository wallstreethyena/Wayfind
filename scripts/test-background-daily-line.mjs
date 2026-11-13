#!/usr/bin/env node
// scripts/test-background-daily-line.mjs — background Place Details may not use the whole of Google's
// per-DAY quota that live visitors need (owner request 2026-11-12).
//
// THE FAILURE THIS LOCKS OUT. Google meters Place Details ("GetPlaceRequest per day") per Pacific day. The
// monthly ledger knew nothing about it: cron jobs spent 700-925 lookups a day before the first 429, the
// visitor-side lookups then failed with RESOURCE_EXHAUSTED and Sentry WAYFIND-1Q fired every night
// (229 trips). The day's budget is now one more counter on the existing ledger (sku google_details_bg_dYYYYMMDD,
// the existing wf_spend_take RPC), in three lines by priority: promotion stops first, scheduled refresh next,
// new or changed inventory last. A visitor is never counted and never refused by it.
//
// WHAT RUNS HERE (real code, fake ledger = same semantics as the SQL function):
//   A. lib/spendGate.js grants: each priority refused at exactly its own line and granted one below; a VISITOR
//      is granted past every line and never ticks the counter; a refused main grant refunds the tick; an
//      unbilled-call refund returns the tick; an unreadable counter refuses (fail closed); a non-Details SKU
//      does not touch the counter; the day key rolls at Pacific midnight (not UTC); the pacing job ignores
//      the counter rows.
//   B. lib/jobPulse.js: the pause note is an EXPECTED idle pause for the real classifyHealth (negative control:
//      a failing-run shape is an incident).
//   C. app/api/cron/promote-index/route.js, the REAL route in a child: paused at the promotion line with no
//      claim and no Google call and the expected pulse; not paused one below the line.
import { spawnSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  TRAFFIC, BACKGROUND_DAILY_ALLOWANCE, BACKGROUND_PRIORITY, BACKGROUND_DAILY_LINES, GOOGLE_DETAILS_DAILY_SKUS,
  runWithTraffic, runWithBackgroundPriority, currentBackgroundPriority, googleQuotaDayYmd, backgroundDailySku,
  backgroundDailyLine, isBackgroundDailySku, backgroundDailyStatus, takeFromLedgerDetailed, refundToLedger,
  spendAllow, spendAllowRefresh, spendAllowCapped,
} from "../lib/spendGate.js";
import { budgetDailyReserveNote, isBudgetReserveNote, classifyHealth } from "../lib/jobPulse.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { failures++; console.error("background-daily-line: FAIL - " + m); } };
const eq = (a, e, m) => ok(a === e, `${m} (got ${JSON.stringify(a)}, expected ${JSON.stringify(e)})`);

// ── fake ledger ──────────────────────────────────────────────────────────
const MONTH = new Date().toISOString().slice(0, 7);
let rows, restStatus, takes;
const reset = (seed = {}) => { rows = new Map(Object.entries(seed)); restStatus = 200; takes = []; };
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes("/rest/v1/wf_spend_ledger")) {
    if (restStatus !== 200) return new Response("down", { status: restStatus });
    const sku = decodeURIComponent((u.match(/sku=eq\.([^&]+)/) || [])[1] || "");
    const month = (u.match(/month=eq\.([^&]+)/) || [])[1];
    if (month !== MONTH) return Response.json([]);
    return Response.json(rows.has(sku) ? [{ used: rows.get(sku) }] : []);
  }
  if (u.includes("/rest/v1/rpc/wf_spend_take")) {
    if (restStatus !== 200) return new Response("down", { status: restStatus });
    const b = JSON.parse(init.body); takes.push([b.p_sku, b.p_cap]);
    const used = rows.get(b.p_sku) ?? 0;
    if (used + 1 <= b.p_cap) { rows.set(b.p_sku, used + 1); return Response.json(true); }
    return Response.json(false);
  }
  if (u.includes("/rest/v1/rpc/wf_spend_refund")) { const b = JSON.parse(init.body); rows.set(b.p_sku, Math.max(0, (rows.get(b.p_sku) ?? 0) - b.p_n)); return Response.json(true); }
  throw new Error("unexpected fetch in test: " + u);
};
for (const k of ["WAYFIND_GATE", "WAYFIND_PROMOTE_PAID", "PROMOTE_DETAILS_MONTH_CAP", "VERCEL_ENV"]) delete process.env[k];
process.env.WAYFIND_GATE = "free"; process.env.SUPABASE_URL = "https://ledger.fake.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_fake"; process.env.VERCEL_ENV = "production";
const DAY = () => backgroundDailySku();
const as = (priority, fn) => runWithTraffic(TRAFFIC.BACKGROUND, () => runWithBackgroundPriority(priority, fn));
const P = BACKGROUND_PRIORITY, L = BACKGROUND_DAILY_LINES;

// ── the numbers ──────────────────────────────────────────────────────────
eq(BACKGROUND_DAILY_ALLOWANCE, 500, "one named constant: 500 background Place Details lookups per Pacific day");
eq(L[P.NEW_OR_CHANGED], 500, "new or changed inventory may use the whole allowance");
eq(L[P.SCHEDULED], 400, "scheduled refresh stops at 400 (80%)");
eq(L[P.PROMOTION], 340, "promotion stops at 340 (68%)");
ok(L[P.PROMOTION] < L[P.SCHEDULED] && L[P.SCHEDULED] < L[P.NEW_OR_CHANGED], "priority order D < C < B on one counter");
ok(["details_essentials", "details_pro", "details_enterprise", "details_ids_only"].every((s) => GOOGLE_DETAILS_DAILY_SKUS.includes(s)) && GOOGLE_DETAILS_DAILY_SKUS.length === 4, "the counter covers every Place Details SKU a background job can spend, and only those");
eq(backgroundDailyLine("nonsense"), null, "an unknown priority has no line");
let threw = false; try { runWithBackgroundPriority("nonsense", () => 1); } catch { threw = true; }
ok(threw, "an unknown priority cannot be declared");

// ── A. grants ────────────────────────────────────────────────────────────
for (const [name, pr, sku] of [["promotion", P.PROMOTION, "details_pro"], ["scheduled", P.SCHEDULED, "details_essentials"], ["new", P.NEW_OR_CHANGED, "details_enterprise"]]) {
  const line = L[pr];
  reset({ [DAY()]: line - 1 });
  let r = await as(pr, () => takeFromLedgerDetailed(sku, 5000));
  ok(r.ok && rows.get(DAY()) === line, `A(${name}): one under the line (${line - 1}) is GRANTED and ticks the counter to ${line}`);
  r = await as(pr, () => takeFromLedgerDetailed(sku, 5000));
  ok(!r.ok && r.reason === "daily", `A(${name}): at the line (${line}) is REFUSED with reason "daily" (got ${JSON.stringify(r)})`);
  eq(rows.get(DAY()), line, `A(${name}): a refused grant leaves the counter where it was`);
  eq(rows.get(sku) ?? 0, 1, `A(${name}): ...and the monthly SKU row ticked once only (the refused call never reached it)`);
}
// the priority classes are ordered on the same counter
reset({ [DAY()]: 350 });
ok(!(await as(P.PROMOTION, () => takeFromLedgerDetailed("details_pro", 5000))).ok, "A: at 350 promotion is refused...");
ok((await as(P.SCHEDULED, () => takeFromLedgerDetailed("details_pro", 5000))).ok, "A: ...while a scheduled refresh is still granted...");
reset({ [DAY()]: 450 });
ok(!(await as(P.SCHEDULED, () => takeFromLedgerDetailed("details_pro", 5000))).ok, "A: at 450 scheduled is refused...");
ok((await as(P.NEW_OR_CHANGED, () => takeFromLedgerDetailed("details_pro", 5000))).ok, "A: ...while new or changed inventory still has its room");
// visitors are never counted and never refused (priority A)
reset({ [DAY()]: 100000 });
const v = await takeFromLedgerDetailed("details_pro", 5000);
ok(v.ok, "A: a VISITOR (no traffic declared) is granted past every daily line");
eq(rows.get(DAY()), 100000, "A: ...and does not tick the day counter");
eq(takes.filter((t) => isBackgroundDailySku(t[0])).length, 0, "A: a visitor grant never even calls the RPC for the day counter");
const vv = await runWithTraffic(TRAFFIC.VISITOR, () => takeFromLedgerDetailed("details_enterprise", 950));
ok(vv.ok && takes.filter((t) => isBackgroundDailySku(t[0])).length === 0, "A: an explicit VISITOR is the same");
// a SKU that is not Place Details never touches the counter
reset({ [DAY()]: 100000 });
const ph = await as(P.PROMOTION, () => takeFromLedgerDetailed("photos", 950));
ok(ph.ok && rows.get(DAY()) === 100000, "A: a non-Details SKU (photos) is neither counted nor refused by the Details day line");
// default priority by class: refresh -> scheduled, background -> promotion
ok(runWithTraffic(TRAFFIC.REFRESH, () => currentBackgroundPriority()) === P.SCHEDULED, "A: an undeclared REFRESH job ranks as scheduled");
ok(runWithTraffic(TRAFFIC.BACKGROUND, () => currentBackgroundPriority()) === P.PROMOTION, "A: an undeclared BACKGROUND job ranks as promotion (lowest)");
ok(currentBackgroundPriority() === null, "A: a visitor has no background priority");
// refund of the tick when the MAIN grant is refused
reset({ [DAY()]: 10, details_pro: 5000 });
const refused = await runWithTraffic(TRAFFIC.REFRESH, () => runWithBackgroundPriority(P.NEW_OR_CHANGED, () => takeFromLedgerDetailed("details_pro", 5000)));
ok(!refused.ok && refused.reason === "cap", "A: the monthly cap refuses (reason cap)");
eq(rows.get(DAY()), 10, "A: ...and the day tick taken for it was GIVEN BACK (a call that never happened is not counted)");
// refund when Google never billed the call
reset({ [DAY()]: 10, details_pro: 10 });
await as(P.SCHEDULED, () => refundToLedger("details_pro", 1));
eq(rows.get(DAY()), 9, "A: an unbilled background call returns the day tick with the monthly one");
reset({ [DAY()]: 10, details_pro: 10 });
await refundToLedger("details_pro", 1);
eq(rows.get(DAY()), 10, "A: a visitor's refund does not touch the day counter");
// fail closed
reset({ [DAY()]: 1 }); restStatus = 500;
const dead = await as(P.NEW_OR_CHANGED, () => takeFromLedgerDetailed("details_pro", 5000));
ok(!dead.ok && dead.reason !== "granted", "A: an unreadable ledger refuses a background grant (fail closed)");
const st = await backgroundDailyStatus(P.NEW_OR_CHANGED);
ok(st.blocked === true && st.unreadable === true && st.used === null, "A: backgroundDailyStatus reports blocked+unreadable when the counter cannot be read");
reset({ [DAY()]: 339 });
let s2 = await backgroundDailyStatus(P.PROMOTION);
ok(s2.blocked === false && s2.used === 339 && s2.line === 340, "A: preflight one under the promotion line is open");
reset({ [DAY()]: 340 });
s2 = await backgroundDailyStatus(P.PROMOTION);
ok(s2.blocked === true && s2.unreadable === false && s2.used === 340, "A: preflight at the promotion line is blocked (a pause, not an error)");
s2 = await backgroundDailyStatus(P.NEW_OR_CHANGED);
ok(s2.blocked === false, "A: ...while new inventory is still open at 340");
reset({}); s2 = await backgroundDailyStatus(P.PROMOTION);
ok(s2.blocked === false && s2.used === 0, "A: a day with no row yet reads as 0 used (a fresh day opens), distinct from an unreadable one");
// shut gate: no background Google spend
process.env.WAYFIND_GATE = "shut"; reset({});
ok((await backgroundDailyStatus(P.NEW_OR_CHANGED)).blocked === true, "A: gate shut blocks the preflight");
process.env.WAYFIND_GATE = "free";
// the day key is the PACIFIC day
eq(googleQuotaDayYmd(new Date("2026-11-13T07:59:00Z")), "20261112", "A: 07:59 UTC in winter is still Pacific 11-12 (quota has not reset)");
eq(googleQuotaDayYmd(new Date("2026-11-13T08:00:00Z")), "20261113", "A: 08:00 UTC in winter is Pacific midnight (the reset)");
eq(googleQuotaDayYmd(new Date("2026-07-13T06:59:00Z")), "20260712", "A: in summer time the reset is 07:00 UTC (DST-aware)");
eq(googleQuotaDayYmd(new Date("2026-07-13T07:00:00Z")), "20260713", "A: ...at 07:00 UTC in July");
eq(backgroundDailySku(new Date("2026-11-13T08:00:00Z")), "google_details_bg_d20261113", "A: the counter sku embeds the Pacific day");
ok(isBackgroundDailySku("google_details_bg_d20261113") && !isBackgroundDailySku("details_pro") && !isBackgroundDailySku("google_details_bg_d2026"), "A: isBackgroundDailySku matches the counter rows and nothing else");
// the monthly pacing job must not read the counter rows as a budget
const pacing = await import("../lib/spendPacing.js");
const paced = pacing.paceLedger ? pacing.paceLedger([{ sku: DAY(), used: 400, cap: 500 }, { sku: "details_pro", used: 100, cap: 4800 }], new Date()) : null;
ok(paced && JSON.stringify(paced).indexOf("google_details_bg_d") === -1, "A: spend pacing drops the per-day counter rows (they are not monthly budgets)");
ok(paced && JSON.stringify(paced).indexOf("details_pro") !== -1, "A control: ...and still reports the real monthly rows");
// the other gates are unchanged by the counter existing
reset({}); process.env.WAYFIND_GATE = "free";
ok(await spendAllow("details_enterprise"), "A control: visitors still pass the ordinary gate with an empty day");

// ── B. the expected-pause pulse ──────────────────────────────────────────
const note = budgetDailyReserveNote(340, 340);
ok(isBudgetReserveNote(note) && /google-details-daily 340\/340/.test(note), "B: the pause note is a human-traffic-reserve note naming the counter");
const idle = classifyHealth([{ job: "promote-index", attempted: 0, succeeded: 0, consecutive_zero: 0, last_note: note }]);
ok(idle.incidents.length === 0 && idle.idle.length === 1 && idle.budgetLimited.length === 1, "B: the REAL classifyHealth reads it as an expected idle pause, never an incident");
const unread = budgetDailyReserveNote(null, 340);
ok(isBudgetReserveNote(unread) && /unreadable/.test(unread), "B: the unreadable-counter pause is the same expected shape");
const bad = classifyHealth([{ job: "promote-index", attempted: 12, succeeded: 0, consecutive_zero: 3, last_note: "quota: google 429" }]);
ok(bad.incidents.length === 1, "B control: a failing run IS an incident, so the classification above is the note's doing");

// ── C. the REAL promote-index route ──────────────────────────────────────
const HOOK = pathToFileURL(join(ROOT, "scripts/lib/nodeResolveHook.mjs")).href;
const ROUTE = pathToFileURL(join(ROOT, "app/api/cron/promote-index/route.js")).href;
const GATE = pathToFileURL(join(ROOT, "lib/spendGate.js")).href;
function runRoute(dayUsed, ledgerStatus = 200) {
  const code = `
    import { register } from "node:module";
    register(${JSON.stringify(HOOK)}, import.meta.url);
    process.env.WAYFIND_GATE = "free"; process.env.CRON_SECRET = "s"; process.env.GOOGLE_MAPS_SERVER_KEY = "k";
    process.env.SUPABASE_URL = "https://ledger.fake.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_fake"; process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ledger.fake.test"; process.env.VERCEL_ENV = "production";
    delete process.env.WAYFIND_PROMOTE_PAID; delete process.env.PROMOTE_DETAILS_MONTH_CAP;
    const gate = await import(${JSON.stringify(GATE)});
    const day = gate.backgroundDailySku();
    const log = { pulses: [], claims: 0, google: 0 };
    globalThis.fetch = async (url, init = {}) => {
      const u = String(url);
      if (u.includes("/rest/v1/wf_spend_ledger")) {
        if (${ledgerStatus} !== 200) return new Response("down", { status: ${ledgerStatus} });
        const m = u.match(/sku=eq\\.([^&]+)/); return Response.json(m && decodeURIComponent(m[1]) === day ? [{ used: ${dayUsed} }] : []);
      }
      if (u.includes("/rest/v1/wf_job_pulse")) { log.pulses.push(JSON.parse(init.body)); return new Response(null, { status: 201 }); }
      if (u.includes("wf_promotion_claim")) { log.claims++; return Response.json([]); }
      if (u.includes("places.googleapis.com")) { log.google++; return Response.json({}); }
      return Response.json([]);
    };
    const { GET } = await import(${JSON.stringify(ROUTE)});
    const res = await GET(new Request("https://x.test/api/cron/promote-index", { headers: { authorization: "Bearer s" } }));
    log.body = await res.json();
    console.log("@@" + JSON.stringify(log));
  `;
  const p = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", timeout: 60000, env: { ...process.env, NODE_NO_WARNINGS: "1" } });
  const m = /@@(.*)/.exec(p.stdout || "");
  if (!m) { console.error((p.stderr || "").slice(0, 600)); return null; }
  return JSON.parse(m[1]);
}
const paused = runRoute(L[P.PROMOTION]);
ok(!!paused, "C: the real promote-index route ran in the child (otherwise every assertion below is about nothing)");
if (paused) {
  eq(paused.claims, 0, "C: at the promotion line the route never claims work");
  eq(paused.google, 0, "C: ...and makes no Google call");
  const p = paused.pulses.find((x) => x.job === "promote-index");
  ok(!!p && p.attempted === 0 && p.succeeded === 0 && p.failed === 0 && isBudgetReserveNote(p.note) && /google-details-daily/.test(p.note), `C: the pause is an expected pulse (got ${JSON.stringify(p)})`);
  ok(paused.body && paused.body.skipped === "daily-line", "C: the HTTP answer names the pause");
}
const open = runRoute(L[P.PROMOTION] - 1);
ok(!!open, "C: the real route ran one under the line");
if (open) {
  eq(open.claims, 1, "C control: one under the line the route claims work as before");
  ok(!open.pulses.some((x) => isBudgetReserveNote(x.note) && /google-details-daily/.test(x.note)), "C control: ...and does not pause");
}
const unreadableRun = runRoute(0, 500);
ok(!!unreadableRun, "C: the real route ran with an unreadable ledger");
if (unreadableRun) {
  eq(unreadableRun.claims, 0, "C: an unreadable day counter fails CLOSED: no claim");
  eq(unreadableRun.google, 0, "C: ...and no Google call");
}

if (failures) { console.error(`background-daily-line: ${failures} failure(s), ${passes} passed`); process.exit(1); }
console.log(`background-daily-line: OK - ${passes} assertions (daily line per priority via the existing ledger; visitors never counted; refunds return the tick; fail closed; Pacific day key; expected-pause pulse; real promote-index route pauses at the line)`);
