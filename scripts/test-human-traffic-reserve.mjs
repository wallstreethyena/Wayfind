#!/usr/bin/env node
// scripts/test-human-traffic-reserve.mjs — background jobs may not use the last
// 20% of a free Google line that live visitors need (owner request 2026-11-11).
//
// THE FAILURE THIS LOCKS OUT: on 2026-11-01 the promotion cron and the hourly
// refresh used the whole details_enterprise line in the first hours of the
// month; every detail sheet after that got "no" for the rest of November. The
// ledger had one pool and no notion of who was asking.
//
// WHAT RUNS HERE (real code, fake ledger):
//   A. lib/spendGate.js: spendAllow / spendAllowCapped / spendAllowRefresh are
//      CALLED against a fake wf_spend_ledger (fetch stub: REST read + the
//      wf_spend_take RPC, same semantics as the SQL function). BACKGROUND is
//      refused at the reserve line and granted below it; VISITOR (the default,
//      nothing declared) is granted above the line up to its cap and refused at
//      the cap; REFRESH keeps its own budget; non-visitor SKUs are untouched; an
//      unreadable ledger refuses a background grant; the p_cap sent to the RPC is
//      never lowered (the row's cap column feeds spend-pacing).
//   B. lib/jobPulse.js: the pause note is classified as EXPECTED by the real
//      classifyHealth (idle, no incident) and the old failing-run shape is an
//      incident (negative control).
//   C. app/api/cron/promote-index/route.js: the REAL route GET, in a child with a
//      fake fetch, pauses BEFORE the claim and pulses attempted 0 / failed 0 with
//      the reserve note; below the line it claims.
//   D. Static completeness (pure scanner, positive and negative control): every
//      cron route that can reach a grant declares its traffic class, so
//      "undeclared = VISITOR" holds for every request handler.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import {
  TRAFFIC, HUMAN_RESERVE_SHARE, VISITOR_SHARED_SKUS, runWithTraffic, currentTraffic,
  humanReserveLine, visitorCeiling, spendAllow, spendAllowCapped, spendAllowRefresh,
  backgroundReserveStatus, takeFromLedgerDetailed, freeTierLine, siteReservedCap, isBackgroundDailySku,
} from "../lib/spendGate.js";
import {
  budgetReserveNote, isBudgetReserveNote, isDeterministicFailureNote, classifyHealth, budgetLimitNote,
} from "../lib/jobPulse.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { failures++; console.error("human-traffic-reserve: FAIL - " + m); } };
const eq = (a, e, m) => ok(a === e, `${m} (got ${JSON.stringify(a)}, expected ${JSON.stringify(e)})`);

// ── fake ledger ──────────────────────────────────────────────────────────
const MONTH = new Date().toISOString().slice(0, 7);
let rows, takeCaps, restReads, rpcCalls, restStatus;
function resetLedger(seed = {}) {
  rows = new Map(Object.entries(seed).map(([k, v]) => [k, v]));
  takeCaps = []; restReads = 0; rpcCalls = 0; restStatus = 200;
}
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes("/rest/v1/wf_spend_ledger")) {
    restReads++;
    if (restStatus !== 200) return new Response("down", { status: restStatus });
    const sku = decodeURIComponent((u.match(/sku=eq\.([^&]+)/) || [])[1] || "");
    const month = (u.match(/month=eq\.([^&]+)/) || [])[1];
    if (month !== MONTH) return Response.json([]);
    return Response.json(rows.has(sku) ? [{ used: rows.get(sku) }] : []);
  }
  if (u.includes("/rest/v1/rpc/wf_spend_take")) {
    rpcCalls++;
    const b = JSON.parse(init.body);
    takeCaps.push([b.p_sku, b.p_cap]);
    const used = rows.get(b.p_sku) ?? 0;
    if (used + 1 <= b.p_cap) { rows.set(b.p_sku, used + 1); return Response.json(true); }   // same as the SQL function
    return Response.json(false);
  }
  if (u.includes("/rest/v1/rpc/wf_spend_refund")) { const b = JSON.parse(init.body); rows.set(b.p_sku, Math.max(0, (rows.get(b.p_sku) ?? 0) - 1)); return Response.json(true); }
  throw new Error("unexpected fetch in test: " + u);
};
const KEYS = ["WAYFIND_GATE", "WAYFIND_PROMOTE_PAID", "PROMOTE_DETAILS_MONTH_CAP", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_PHOTOS_MONTH_CAP", "WAYFIND_PHOTOS_PAID", "VERCEL_ENV"];
const saved = { ...process.env }; // a copy; no assertion reads the ambient shell, env() below deletes then sets every key it depends on
function env(v = {}) {
  for (const k of KEYS) delete process.env[k];
  const vals = { WAYFIND_GATE: "free", SUPABASE_URL: "https://ledger.fake.test", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake", VERCEL_ENV: "production", ...v };
  for (const k of Object.keys(vals)) process.env[k] = vals[k];
}

// ── A0. the numbers ──────────────────────────────────────────────────────
env();
eq(HUMAN_RESERVE_SHARE, 0.2, "the reserve is one named constant: 20% for visitors");
eq(visitorCeiling("details_enterprise"), 475, "visitors can draw 475 of details_enterprise (950 free line minus the refresh half)");
eq(humanReserveLine("details_enterprise"), 380, "details_enterprise: background stops at 380 (80% of what visitors can reach, not of 950)");
eq(humanReserveLine("details_pro"), 1920, "details_pro: background stops at 1920 (80% of the 2400 visitor ceiling)");
eq(humanReserveLine("text_pro"), 3840, "text_pro: 3840");
eq(humanReserveLine("photos"), 760, "photos: 760 of 950");
eq(humanReserveLine("details_essentials"), null, "details_essentials is not visitor-shared: no reserve");
eq(humanReserveLine("refresh_details_essentials"), null, "refresh_* counters are background-only budgets: no reserve");
eq(humanReserveLine("text_enterprise"), null, "text_enterprise without its operator cap: visitors cannot draw it, nothing to reserve");
env({ WAYFIND_GATE: "shut" });
eq(humanReserveLine("details_enterprise"), null, "shut: no Google spend at all, no line");
env();
for (const sku of VISITOR_SHARED_SKUS) ok(sku in { details_enterprise: 1, details_pro: 1, photos: 1, text_pro: 1, text_enterprise: 1, nearby_pro: 1, nearby_enterprise: 1, autocomplete: 1, geocoding: 1, details_ids_only: 1 }, `unexpected shared SKU ${sku}`);
ok(VISITOR_SHARED_SKUS.every((s) => freeTierLine(s) !== null || ["text_enterprise", "nearby_enterprise", "geocoding"].includes(s)), "every shared SKU is a metered SKU");
ok(siteReservedCap("details_enterprise") === 475, "visitor ceiling still comes from the owner's refresh split (unchanged)");

// ── A1. BACKGROUND: refused at the line, granted below it ────────────────
env(); resetLedger({ details_enterprise: 379 });
let r = await runWithTraffic(TRAFFIC.BACKGROUND, () => spendAllow("details_enterprise"));
eq(r, true, "BACKGROUND granted at used 379 (below the 380 line)");
eq(rows.get("details_enterprise"), 380, "the grant counted");
r = await runWithTraffic(TRAFFIC.BACKGROUND, () => spendAllow("details_enterprise"));
eq(r, false, "BACKGROUND refused at used 380 (the line)");
eq(rows.get("details_enterprise"), 380, "a refused background grant counts nothing");
const rpcBefore = rpcCalls;
r = await runWithTraffic(TRAFFIC.BACKGROUND, () => spendAllowCapped("details_enterprise", 950));
eq(r, false, "BACKGROUND via spendAllowCapped (the promotion path) refused at the line too");
eq(rpcCalls, rpcBefore, "a refused background grant never reaches wf_spend_take");
const detail = await runWithTraffic(TRAFFIC.BACKGROUND, () => takeFromLedgerDetailed("details_enterprise", 950));
eq(detail.reason, "reserve", "the refusal says WHY (reserve), not 'cap'");
// 2026-11-12: a background grant of a Details SKU now also ticks the Google DAILY counter row (its own sku, its own
// line, skipped by spend pacing, see test-background-daily-line.mjs). The never-lowered rule is about the MONTHLY
// rows pacing reads, so the daily row is the only sku this filter lets through unchecked.
ok(takeCaps.filter(([sku]) => !isBackgroundDailySku(sku)).every(([, cap]) => cap === 475 || cap === 950), "the cap sent to the ledger is always the caller's real ceiling, never a lowered one (spend-pacing reads the cap column)");

// ── A2. VISITOR: unaffected up to its cap ────────────────────────────────
env(); resetLedger({ details_enterprise: 380 });
r = await spendAllow("details_enterprise");
eq(r, true, "VISITOR (nothing declared) granted at used 380, above the background line");
resetLedger({ details_enterprise: 474 });
r = await runWithTraffic(TRAFFIC.VISITOR, () => spendAllow("details_enterprise"));
eq(r, true, "explicit VISITOR granted at 474");
r = await runWithTraffic(TRAFFIC.VISITOR, () => spendAllow("details_enterprise"));
eq(r, false, "VISITOR refused at its cap 475");
eq(restReads, 0, "visitor grants never read the ledger first (no added latency on the human path)");
eq(currentTraffic(), TRAFFIC.VISITOR, "outside any scope the class is VISITOR");

// ── A3. REFRESH keeps its own budget; split untouched ────────────────────
env(); resetLedger({ details_enterprise: 400, refresh_details_enterprise: 3 });
r = await runWithTraffic(TRAFFIC.REFRESH, () => spendAllowRefresh("details_enterprise", new Date("2026-11-15T00:00:00Z")));
eq(r, true, "REFRESH granted at used 400 (inside the human zone: the refresh half is its own)");
eq(rows.get("refresh_details_enterprise"), 4, "refresh counter taken");
env(); resetLedger({ details_enterprise: 400 });
r = await runWithTraffic(TRAFFIC.BACKGROUND, () => spendAllowRefresh("details_enterprise", new Date("2026-11-15T00:00:00Z")));
ok(r === false, "the same call declared BACKGROUND would be refused: only the refresh route may declare REFRESH (checked in section D)");

// ── A4. SKUs visitors do not draw are untouched ──────────────────────────
env(); resetLedger({ details_essentials: 9000, text_ids_only: 9000 });
r = await runWithTraffic(TRAFFIC.BACKGROUND, () => spendAllowCapped("details_essentials", 9500));
eq(r, true, "BACKGROUND details_essentials granted at 9000 (not visitor-shared)");
eq(restReads, 0, "no ledger read for a SKU with no reserve");

// ── A5. unreadable ledger refuses background, never visitors ─────────────
env(); resetLedger({ details_enterprise: 10 }); restStatus = 500;
r = await runWithTraffic(TRAFFIC.BACKGROUND, () => takeFromLedgerDetailed("details_enterprise", 950));
eq(r.ok, false, "BACKGROUND refused when the ledger cannot be read (fail closed)");
eq(r.reason, "http", "...labelled as an operational failure, not as the reserve");
const st = await backgroundReserveStatus("details_enterprise");
eq(st.unreadable, true, "the preflight reports unreadable instead of pretending");
eq(st.blocked, false, "...and does not block on a read it could not make");
restStatus = 200;

// ── A6. paid promotion is the owner's explicit setting: left alone ───────
env(); resetLedger({ details_pro: 2000 });
r = await runWithTraffic(TRAFFIC.BACKGROUND, () => spendAllowCapped("details_pro", 7500));
eq(r, false, "paid promotion OFF: details_pro background refused at 2000 (line 1920)");
env({ WAYFIND_PROMOTE_PAID: "1", PROMOTE_DETAILS_MONTH_CAP: "6650" }); resetLedger({ details_pro: 6261 });
eq(humanReserveLine("details_pro"), null, "paid promotion ON: no line on details_pro");
r = await runWithTraffic(TRAFFIC.BACKGROUND, () => spendAllowCapped("details_pro", 7500));
eq(r, true, "paid promotion ON: promotion keeps buying to the owner's 6650 ceiling, exactly as configured");
env(); resetLedger({});

// ── A7. scope isolation across concurrent work ───────────────────────────
env(); resetLedger({ details_enterprise: 380 });
const both = await Promise.all([
  runWithTraffic(TRAFFIC.BACKGROUND, async () => { await new Promise((x) => setTimeout(x, 5)); return spendAllow("details_enterprise"); }),
  (async () => { await new Promise((x) => setTimeout(x, 1)); return spendAllow("details_enterprise"); })(),
]);
eq(both[0], false, "the background job is refused while a visitor request runs beside it");
eq(both[1], true, "the visitor request beside a background job is granted (scopes do not leak)");
let threw = false; try { runWithTraffic("batch", () => 1); } catch { threw = true; }
ok(threw, "an unknown class throws instead of silently becoming VISITOR");

// ── B. the pause is an EXPECTED state to job-watch ───────────────────────
const note = budgetReserveNote("details_pro", 1920, 1920);
ok(isBudgetReserveNote(note) && note.startsWith("skipped: budget-reserve ") && note.length <= 200, "pause note is anchored, prefixed, and fits the 200 char column");
ok(!isDeterministicFailureNote(note), "the pause never matches billing|quota|unavailable (would page after one run)");
const pausedRow = { job: "promote-index", attempted: 0, succeeded: 0, consecutive_zero: 0, last_note: note };
let c = classifyHealth([pausedRow]);
ok(c.incidents.length === 0 && c.idle.length === 1 && c.healthy.length === 0, "classifyHealth: a paused run is IDLE, not an incident");
ok(c.budgetLimited.length === 1, "...and is listed with the budget-limited jobs so it is distinguishable from nothing-to-do");
c = classifyHealth([{ ...pausedRow, consecutive_zero: 0 }, { job: "x", attempted: 3, succeeded: 3, consecutive_zero: 0, last_note: null }]);
ok(c.incidents.length === 0, "a paused job beside a healthy one pages nobody");
// negative controls: the shapes that DO page
c = classifyHealth([{ job: "promote-index", attempted: 15, succeeded: 0, consecutive_zero: 2, last_note: budgetLimitNote("details_pro", 12, 7350) }]);
ok(c.incidents.length === 1, "NEG CONTROL: a run that claims places and fails them (attempted 15, succeeded 0) for 2 runs IS an incident, which is why the pause happens before the claim");
c = classifyHealth([{ job: "promote-index", attempted: 0, succeeded: 0, consecutive_zero: 0, last_note: "quota: google 429 on place details" }]);
ok(c.incidents.length === 1, "NEG CONTROL: a quota: note pages on the first run");
c = classifyHealth([{ job: "promote-index", attempted: 0, succeeded: 0, consecutive_zero: 0, last_note: "queue empty" }]);
ok(c.budgetLimited.length === 0, "NEG CONTROL: plain idle is not listed as a reserve pause");
const sqlSrc = readFileSync(join(ROOT, "supabase/migrations/20260909_wf_job_health_unavailable_is_dead.sql"), "utf8");
ok(/\(r\.attempted > 0 OR r\.failed > 0\) AND\s*r\.succeeded = 0/.test(sqlSrc), "SQL wf_job_health still defines dead as (attempted>0 OR failed>0) AND succeeded=0, so attempted 0 / failed 0 can never accrue a streak");

// ── C. the REAL promote-index route pauses before the claim ──────────────
const HOOK = pathToFileURL(join(ROOT, "scripts/lib/nodeResolveHook.mjs")).href;
const ROUTE = pathToFileURL(join(ROOT, "app/api/cron/promote-index/route.js")).href;
function runRoute(used) {
  const code = `
    import { register } from "node:module";
    register(${JSON.stringify(HOOK)}, import.meta.url);
    process.env.WAYFIND_GATE = "free"; process.env.CRON_SECRET = "s"; process.env.GOOGLE_MAPS_SERVER_KEY = "k";
    process.env.SUPABASE_URL = "https://ledger.fake.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_fake"; process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ledger.fake.test"; process.env.VERCEL_ENV = "production";
    delete process.env.WAYFIND_PROMOTE_PAID; delete process.env.PROMOTE_DETAILS_MONTH_CAP;
    const month = new Date().toISOString().slice(0, 7);
    const log = { pulses: [], claims: 0, google: 0, other: [] };
    globalThis.fetch = async (url, init = {}) => {
      const u = String(url);
      if (u.includes("/rest/v1/wf_spend_ledger")) { const m = u.match(/sku=eq\\.([^&]+)/); return Response.json(m && m[1] === "details_pro" ? [{ used: ${used} }] : []); }
      if (u.includes("/rest/v1/wf_job_pulse")) { log.pulses.push(JSON.parse(init.body)); return new Response(null, { status: 201 }); }
      if (u.includes("wf_promotion_claim")) { log.claims++; return Response.json([]); }
      if (u.includes("places.googleapis.com")) { log.google++; return Response.json({}); }
      if (u.includes("/rest/v1/")) return Response.json([]);
      log.other.push(u); return Response.json([]);
    };
    const { GET } = await import(${JSON.stringify(ROUTE)});
    const res = await GET(new Request("https://x.test/api/cron/promote-index", { headers: { authorization: "Bearer s" } }));
    log.body = await res.json();
    console.log("@@" + JSON.stringify(log));
  `;
  const p = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", timeout: 60000, env: { ...process.env, NODE_NO_WARNINGS: "1" } });
  const m = /@@(.*)/.exec(p.stdout || "");
  if (!m) { console.error(p.stderr.slice(0, 600)); return null; }
  return JSON.parse(m[1]);
}
const paused = runRoute(1920);
ok(!!paused, "the real route ran in the child (otherwise every assertion below is about nothing)");
if (paused) {
  eq(paused.claims, 0, "at the line the route never claims work (no claim, no release round trips)");
  eq(paused.google, 0, "...and makes no Google call");
  const p = paused.pulses.find((x) => x.job === "promote-index");
  ok(!!p && p.attempted === 0 && p.succeeded === 0 && p.failed === 0 && isBudgetReserveNote(p.note), `the pause is pulsed as attempted 0 / failed 0 with the reserve note (got ${JSON.stringify(p)})`);
  ok(paused.body && paused.body.skipped === "budget-reserve", "the HTTP answer names the pause");
}
const running = runRoute(1919);
ok(!!running, "the real route ran below the line");
if (running) {
  eq(running.claims, 1, "one used below the line the route claims work as before");
  ok(!running.pulses.some((x) => isBudgetReserveNote(x.note)), "...and does not pause");
}

// ── D. every cron route that can reach a grant declares its class ────────
const GRANT_RX = /\b(spendAllow[A-Za-z]*|takeFromLedger[A-Za-z]*)\s*\(/;
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
function importsOf(file, files) {
  const out = new Set();
  for (const m of strip(files.get(file)).matchAll(/(?:from\s*|import\s*\(\s*|import\s+)["']([^"']+)["']/g)) {
    if (!m[1].startsWith(".")) continue;
    const base = resolve(dirname(file), m[1]);
    for (const cand of [base, base + ".js", base + ".mjs", base + ".jsx", join(base, "index.js")]) if (files.has(cand)) { out.add(cand); break; }
  }
  return out;
}
/** files: Map(absPath -> source). Returns { violations, grantFiles, cronRoutes, declared }. */
function scanTrafficDeclarations(files, root) {
  const spendGate = join(root, "lib/spendGate.js");
  const grantFiles = new Set([...files.keys()].filter((f) => f !== spendGate && GRANT_RX.test(strip(files.get(f)))));
  const cronRoutes = [...files.keys()].filter((f) => f.startsWith(join(root, "app/api/cron") + "/") && f.endsWith("/route.js"));
  const violations = [], declared = [];
  const declRx = /runWithTraffic\(\s*TRAFFIC\.(BACKGROUND|REFRESH|VISITOR)\b/g;
  for (const route of cronRoutes) {
    const seen = new Set([route]), q = [route], hits = [];
    while (q.length) { const f = q.shift(); if (grantFiles.has(f)) hits.push(f); for (const d of importsOf(f, files)) if (!seen.has(d)) { seen.add(d); q.push(d); } }
    if (!hits.length) continue;
    const own = [...strip(files.get(route)).matchAll(declRx)].map((m) => m[1]);
    const libDeclared = hits.filter((h) => h !== route && [...strip(files.get(h)).matchAll(declRx)].length > 0);
    const rel = route.slice(root.length + 1);
    if (own.includes("VISITOR")) violations.push(`${rel} declares VISITOR: a cron job is never a person waiting`);
    if (own.length) { declared.push(rel); continue; }
    if (hits.every((h) => h === route ? false : libDeclared.includes(h))) { declared.push(rel + " (via lib)"); continue; }
    violations.push(`${rel} reaches a Google grant (${hits.map((h) => h.slice(root.length + 1)).join(", ")}) without runWithTraffic(TRAFFIC.X, ...)`);
  }
  for (const s of ["scripts/promote-worker.mjs", "scripts/add-seasonal-venues-2026-10-19.mjs"]) {
    const f = join(root, s);
    if (!files.has(f)) { violations.push(`${s} is missing`); continue; }
    if (!/declareProcessTraffic\(\s*TRAFFIC\.BACKGROUND\s*\)/.test(strip(files.get(f)))) violations.push(`${s} makes grants without declareProcessTraffic(TRAFFIC.BACKGROUND)`);
  }
  return { violations, grantFiles, cronRoutes, declared };
}
function loadTree() {
  const files = new Map();
  const walk = (d) => { for (const n of readdirSync(d)) { if (n === "node_modules" || n.startsWith(".")) continue; const p = join(d, n); const s = statSync(p); if (s.isDirectory()) walk(p); else if (/\.(js|mjs|jsx)$/.test(n)) files.set(p, readFileSync(p, "utf8")); } };
  for (const d of ["app", "lib"]) walk(join(ROOT, d));
  for (const s of ["scripts/promote-worker.mjs", "scripts/add-seasonal-venues-2026-10-19.mjs"]) files.set(join(ROOT, s), readFileSync(join(ROOT, s), "utf8"));
  return files;
}
const tree = loadTree();
const real = scanTrafficDeclarations(tree, ROOT);
// positive probes: the scanner can see what it claims to see
ok(real.grantFiles.has(join(ROOT, "lib/placeDetails.js")) && real.grantFiles.has(join(ROOT, "app/api/photo/route.js")) && real.grantFiles.has(join(ROOT, "app/api/cron/promote-index/route.js")), "PROBE: the scanner finds known grant callers (visitor and background)");
ok(real.cronRoutes.length >= 30, `PROBE: the scanner sees the cron routes (${real.cronRoutes.length})`);
const must = ["promote-index", "atlas-build", "hero-images", "credited-photos", "inventory-refresh", "photo-warm"];
for (const m of must) ok(real.declared.some((d) => d.includes("/" + m + "/")), `PROBE: ${m} reaches a grant and is declared`);
ok(real.violations.length === 0, "every cron route that can reach a grant declares its class: " + real.violations.join(" | "));
// classes are the right ones
const src = (p) => strip(tree.get(join(ROOT, p)));
for (const m of ["promote-index", "atlas-build", "hero-images", "credited-photos"]) ok(/runWithTraffic\(\s*TRAFFIC\.BACKGROUND\b/.test(src(`app/api/cron/${m}/route.js`)), `${m} is declared BACKGROUND`);
ok(/runWithTraffic\(\s*TRAFFIC\.REFRESH\b/.test(src("app/api/cron/inventory-refresh/route.js")), "inventory-refresh is declared REFRESH (own budget, owner's split)");
ok(/runWithTraffic\(\s*TRAFFIC\.BACKGROUND\b/.test(src("lib/ownedHotelIdentity.js")), "the photo-warm hotel backfill entry is declared BACKGROUND");
// no request-handler file declares a class: undeclared == visitor stays true
const visitorDeclarers = [...tree.keys()].filter((f) => /^(?:app\/(?!api\/cron\/)|lib\/(?!spendGate))/.test(f.slice(ROOT.length + 1)) && /runWithTraffic\(\s*TRAFFIC\.VISITOR/.test(strip(tree.get(f))));
ok(visitorDeclarers.length === 0, "no visitor path needs to declare (nothing declared == VISITOR)");
// NEGATIVE CONTROL: strip one declaration from an in-memory copy and the scanner must fail
const mutated = new Map(tree);
const pi = join(ROOT, "app/api/cron/promote-index/route.js");
mutated.set(pi, tree.get(pi).replace("runWithTraffic(TRAFFIC.BACKGROUND", "((_, f) => f())(TRAFFIC.BACKGROUND"));
ok(mutated.get(pi) !== tree.get(pi), "NEG CONTROL: the mutation applied");
ok(scanTrafficDeclarations(mutated, ROOT).violations.some((v) => v.includes("promote-index")), "NEG CONTROL: an undeclared promote-index is reported");
const mutated2 = new Map(tree);
const ir = join(ROOT, "app/api/cron/inventory-refresh/route.js");
mutated2.set(ir, tree.get(ir).replace("TRAFFIC.REFRESH", "TRAFFIC.VISITOR"));
ok(scanTrafficDeclarations(mutated2, ROOT).violations.some((v) => v.includes("VISITOR")), "NEG CONTROL: a cron route declaring VISITOR is reported");
const mutated3 = new Map(tree);
const nw = join(ROOT, "app/api/cron/zz-new-job/route.js");
mutated3.set(nw, 'import { spendAllow } from "../../../../lib/spendGate";\nexport async function GET() { return Response.json(await spendAllow("details_enterprise")); }\n');
ok(scanTrafficDeclarations(mutated3, ROOT).violations.some((v) => v.includes("zz-new-job")), "NEG CONTROL: a NEW cron route that takes a grant without declaring fails the build");

// restore
globalThis.fetch = realFetch;
for (const k of KEYS) delete process.env[k];
for (const k of KEYS) if (k in saved) process.env[k] = saved[k];

if (failures) { console.error(`human-traffic-reserve: ${failures} failure(s), ${passes} passed`); process.exit(1); }
console.log(`human-traffic-reserve: OK - ${passes} assertions (background refused at 80% of the visitor ceiling and granted below; visitors granted to their cap; refresh keeps its split; pause pulse is idle to job-watch; real promote-index pauses before its claim; ${real.cronRoutes.length} cron routes scanned, ${real.grantFiles.size} grant files, ${real.declared.length} declared)`);
