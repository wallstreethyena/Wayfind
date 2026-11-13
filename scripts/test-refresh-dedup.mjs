#!/usr/bin/env node
// scripts/test-refresh-dedup.mjs — the inventory refresh must not buy the same place twice inside its
// freshness window (owner request 2026-11-12: "find out why the same places are being checked repeatedly").
//
// THE FAILURE THIS LOCKS OUT. After #1893 any row whose last check was not ENTERPRISE stayed eligible for ever,
// because an essentials/pro check does not re-date refreshed_at (only enterprise does) and the selector keyed on
// refreshed_at. Enterprise and Pro were spent for the month, so the only tier left was essentials: the 160 head
// rows (anchors, then most reviewed) were re-checked at essentials every four hours. wf_spend_ledger on
// 2026-11-12: refresh_details_essentials 7,402 lookups, wf_inventory held 669 distinct stamped places.
//
// WHAT RUNS HERE (real code, fake store). The REAL app/api/cron/inventory-refresh/route.js runs in a child
// process against a fake PostgREST (filters, or(), order, limit, compare-and-swap PATCH), a fake spend ledger
// (the real lib/spendGate.js grants against it) and a fake Google. Every assertion is about what the route
// SELECTED and what Google was ASKED, not about its source text.
//   S1 a place checked inside its window is not selected again; a stale or never-checked place is; a second
//      run over the same database buys nothing (the first run's stamps hold).
//   S2 #1893 is preserved: with enterprise affordable a cheap-checked row IS selected and goes to the rich tier.
//   S3 only a RICHER tier is ever bought for a row already checked inside its window.
//   S4 new inventory (never checked) is taken before a scheduled re-check, at either hour slot.
//   S5 the Google daily counter: paused at the line (no select, no call, expected-pause pulse), new inventory
//      still allowed between the scheduled and the new-inventory lines, unreadable counter = paused.
//   S6 pure predicates (refreshEligible, tiersToTry) with a positive and a negative control.
import { spawnSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { refreshEligible, tiersToTry, neverChecked, ESSENTIALS_MASK, PRO_MASK } from "../lib/inventoryGoogleCheck.js";
import { BACKGROUND_DAILY_LINES } from "../lib/spendGate.js";
import { classifyHealth, isBudgetReserveNote } from "../lib/jobPulse.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { failures++; console.error("refresh-dedup: FAIL - " + m); } };
const eq = (a, e, m) => ok(JSON.stringify(a) === JSON.stringify(e), `${m} (got ${JSON.stringify(a)}, expected ${JSON.stringify(e)})`);

const HOOK = pathToFileURL(join(ROOT, "scripts/lib/nodeResolveHook.mjs")).href;
const ROUTE = pathToFileURL(join(ROOT, "app/api/cron/inventory-refresh/route.js")).href;
const GATE = pathToFileURL(join(ROOT, "lib/spendGate.js")).href;
const FULL_MASK_MARK = "rating"; // PLACE_DETAILS_FIELDS (enterprise) carries rating; the cheap masks never do

// spec: { rows:[{id, refDays, checkedDays|null, tier, anchor, reviews, locked}], ledger:{sku:used}, dailyUsed, ledgerStatus,
//         runs:[{limit, now}] }
function runChild(spec) {
  const code = `
    import { register } from "node:module";
    register(${JSON.stringify(HOOK)}, import.meta.url);
    const spec = ${JSON.stringify(spec)};
    process.env.WAYFIND_GATE = "free"; process.env.CRON_SECRET = "s"; process.env.GOOGLE_MAPS_SERVER_KEY = "k";
    process.env.SUPABASE_URL = "https://fake.test"; process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_fake";
    delete process.env.WAYFIND_PROMOTE_PAID;
    const gate = await import(${JSON.stringify(GATE)});
    const realNow = Date.now();
    const DAY = 86400000, iso = (ms) => new Date(ms).toISOString();
    const MONTH = new Date().toISOString().slice(0, 7);
    const ledger = new Map(Object.entries(spec.ledger || {}));
    if (spec.dailyUsed != null) ledger.set(gate.backgroundDailySku(), spec.dailyUsed);
    const db = spec.rows.map((r) => ({
      place_id: r.id, metro: "tampa", refreshed_at: iso(realNow - r.refDays * DAY), locked: !!r.locked, status: null, excluded: null,
      lat: 27.5, lng: -82.4, anchor: !!r.anchor, independent_coords: null,
      signals: Object.assign({ reviews: r.reviews || 0 }, r.checkedDays == null ? {} : { google_checked_at: iso(realNow - r.checkedDays * DAY), google_check_tier: r.tier }),
    }));
    const log = { google: [], pulses: [], selects: 0, patches: 0, runs: [], dailyAfter: null };
    const val = (row, f) => {
      if (f.startsWith("signals->>")) { const v = row.signals ? row.signals[f.slice(10)] : undefined; return v == null ? null : String(v); }
      const v = row[f]; return v == null ? null : v;
    };
    const cond = (row, expr) => {
      const i = expr.indexOf("."), f = expr.slice(0, i), rest = expr.slice(i + 1), j = rest.indexOf("."), op = rest.slice(0, j), arg = rest.slice(j + 1);
      const v = val(row, f);
      if (op === "is") return arg === "null" ? v == null : v != null;
      if (v == null) return false; // SQL: a comparison with NULL is never true
      if (op === "eq") return String(v) === arg;
      if (op === "neq") return String(v) !== arg;
      if (op === "lt") return String(v) < arg;
      throw new Error("fake PostgREST: unsupported op " + op);
    };
    const cmp = (a, b) => (typeof a === "boolean" ? Number(a) - Number(b) : typeof a === "number" ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
    const orderVal = (row, f) => {
      if (f.startsWith("signals->>")) { const v = row.signals ? row.signals[f.slice(10)] : undefined; return v == null ? null : String(v); }
      if (f.startsWith("signals->")) { const v = row.signals ? row.signals[f.slice(9)] : undefined; return v == null ? null : v; }
      return row[f] == null ? null : row[f];
    };
    globalThis.fetch = async (url, init = {}) => {
      const u = new URL(String(url)), p = u.pathname, method = (init.method || "GET").toUpperCase();
      if (p === "/rest/v1/wf_inventory" && method === "GET") {
        log.selects++;
        let rows = db.filter((r) => {
          const lt = u.searchParams.get("refreshed_at");
          if (lt && !(r.refreshed_at < lt.replace(/^lt\\./, ""))) return false;
          return u.searchParams.getAll("or").every((g) => g.replace(/^\\(|\\)$/g, "").split(",").some((e) => cond(r, e)));
        });
        const ord = (u.searchParams.get("order") || "").split(",").filter(Boolean).map((t) => { const [f, dir, nulls] = t.split("."); return { f, desc: dir === "desc", nulls }; });
        rows = rows.slice().sort((a, b) => {
          for (const o of ord) {
            const x = orderVal(a, o.f), y = orderVal(b, o.f);
            if (x == null && y == null) continue;
            const nullsFirst = o.nulls ? o.nulls === "nullsfirst" : o.desc;
            if (x == null) return nullsFirst ? -1 : 1;
            if (y == null) return nullsFirst ? 1 : -1;
            const c = cmp(x, y); if (c) return o.desc ? -c : c;
          }
          return 0;
        });
        const lim = Number(u.searchParams.get("limit")) || rows.length;
        return Response.json(rows.slice(0, lim));
      }
      if (p === "/rest/v1/wf_inventory" && method === "PATCH") {
        log.patches++;
        const id = (u.searchParams.get("place_id") || "").replace(/^eq\\./, "");
        const row = db.find((r) => r.place_id === id);
        const sg = u.searchParams.get("signals");
        let match = !!row;
        if (row && sg) match = sg === "is.null" ? row.signals == null : JSON.stringify(JSON.parse(sg.replace(/^eq\\./, ""))) === JSON.stringify(row.signals);
        if (!match) return Response.json([]);
        Object.assign(row, JSON.parse(init.body));
        return Response.json([{ place_id: id }]);
      }
      if (p === "/rest/v1/wf_spend_ledger") {
        if (spec.ledgerStatus) return new Response("down", { status: spec.ledgerStatus });
        const sku = decodeURIComponent((u.search.match(/sku=eq\\.([^&]+)/) || [])[1] || "");
        return Response.json(ledger.has(sku) ? [{ used: ledger.get(sku) }] : []);
      }
      if (p === "/rest/v1/rpc/wf_spend_take") {
        if (spec.ledgerStatus) return new Response("down", { status: spec.ledgerStatus });
        const b = JSON.parse(init.body); const n = ledger.get(b.p_sku) || 0;
        if (n + 1 <= b.p_cap) { ledger.set(b.p_sku, n + 1); return Response.json(true); }
        return Response.json(false);
      }
      if (p === "/rest/v1/rpc/wf_spend_refund") { const b = JSON.parse(init.body); ledger.set(b.p_sku, Math.max(0, (ledger.get(b.p_sku) || 0) - b.p_n)); return Response.json(true); }
      if (p === "/rest/v1/wf_job_pulse") { log.pulses.push(JSON.parse(init.body)); return new Response(null, { status: 201 }); }
      if (u.hostname === "places.googleapis.com") {
        const id = decodeURIComponent(p.split("/").pop());
        log.google.push({ id, mask: (init.headers || {})["X-Goog-FieldMask"] });
        return Response.json({ id, location: { latitude: 27.5, longitude: -82.4 }, businessStatus: "OPERATIONAL", displayName: { text: "x" }, rating: 4.5, userRatingCount: 100 });
      }
      return Response.json([]);
    };
    const { GET } = await import(${JSON.stringify(ROUTE)});
    for (const run of spec.runs) {
      const g0 = log.google.length, s0 = log.selects, pl0 = log.pulses.length;
      const hour = Math.floor(realNow / 3600000) + (run.slotPlus || 0);
      const realDateNow = Date.now; Date.now = () => hour * 3600000 + 1000; // only the hourly rotation slot is steered
      let res; try { res = await GET(new Request("https://x.test/api/cron/inventory-refresh?limit=" + (run.limit || 40), { headers: { authorization: "Bearer s" } })); } finally { Date.now = realDateNow; }
      log.runs.push({ status: res.status, body: await res.json(), google: log.google.slice(g0), selects: log.selects - s0, pulses: log.pulses.slice(pl0) });
    }
    log.dailyAfter = ledger.get(gate.backgroundDailySku()) ?? null;
    log.final = Object.fromEntries(db.map((r) => [r.place_id, r.signals.google_check_tier || null]));
    console.log("@@" + JSON.stringify(log));
  `;
  const p = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", timeout: 90000, env: { ...process.env, NODE_NO_WARNINGS: "1" } });
  const m = /@@(.*)/.exec(p.stdout || "");
  if (!m) { console.error((p.stderr || "").slice(0, 900)); return null; }
  return JSON.parse(m[1]);
}
const ids = (r) => r.google.map((g) => g.id);
// ledgers: enterprise AND pro spent for the month (the 2026-11-12 production state) vs affordable
const SPENT = { details_enterprise: 988, details_pro: 6263, refresh_details_enterprise: 40, refresh_details_pro: 161, details_essentials: 100, refresh_details_essentials: 100 };
const RICH = { details_enterprise: 100, details_pro: 100, refresh_details_enterprise: 10, refresh_details_pro: 10, details_essentials: 100, refresh_details_essentials: 100 };
const PRO_ONLY = { ...SPENT, details_pro: 100, refresh_details_pro: 10 };

// ── S1: inside the window = not selected again ───────────────────────────
const s1 = runChild({
  ledger: SPENT,
  rows: [
    { id: "dup-essentials-2d", refDays: 60, checkedDays: 2, tier: "essentials", anchor: true, reviews: 9000 },   // the production shape
    { id: "dup-essentials-1d", refDays: 60, checkedDays: 1, tier: "essentials", reviews: 8000 },
    { id: "never-checked", refDays: 60, checkedDays: null, reviews: 10 },
    { id: "checked-30d-ago", refDays: 60, checkedDays: 30, tier: "essentials", reviews: 20 },
    { id: "fresh-content", refDays: 5, checkedDays: null, reviews: 99999 },
    { id: "enterprise-5d", refDays: 60, checkedDays: 5, tier: "enterprise", reviews: 5000 },
  ],
  runs: [{}, {}],
});
ok(!!s1, "S1: the real route ran in the child (otherwise every assertion below is about nothing)");
if (s1) {
  eq(ids(s1.runs[0]).sort(), ["checked-30d-ago", "never-checked"], "S1: run 1 buys exactly the never-checked and the out-of-window rows");
  ok(s1.runs[0].google.every((g) => g.mask === ESSENTIALS_MASK), "S1: enterprise and pro are spent, so the only tier bought is essentials");
  eq(ids(s1.runs[1]), [], "S1: run 2 over the same database buys NOTHING (run 1's stamps hold; no place is checked twice in the window)");
  ok(s1.runs[1].pulses.every((x) => x.attempted === 0 && x.failed === 0), "S1: the empty run is idle (attempted 0, failed 0), never a dead run");
  ok(s1.runs[0].google.length === 2 && s1.final["dup-essentials-2d"] === "essentials", "S1 control: the two duplicates were left exactly as they were");
}

// ── S2: #1893 preserved — with enterprise affordable a cheap-checked row goes to the rich tier ──
const s2 = runChild({
  ledger: RICH,
  rows: [{ id: "berns", refDays: 60, checkedDays: 2, tier: "essentials", reviews: 9833 }, { id: "fresh-content", refDays: 5, checkedDays: 2, tier: "essentials" }],
  runs: [{}],
});
ok(!!s2, "S2: the real route ran");
if (s2) {
  eq(ids(s2.runs[0]), ["berns"], "S2: Bern's shape (essentials check, stale content) is selected while enterprise is affordable");
  ok(s2.runs[0].google[0] && s2.runs[0].google[0].mask.includes(FULL_MASK_MARK), "S2: ...and bought at the ENTERPRISE tier that can re-date it, not essentials");
}

// ── S3: only a richer tier is bought for a row already checked in the window ──
const s3 = runChild({
  ledger: { ...RICH, refresh_details_enterprise: 474, details_pro: 6263, refresh_details_pro: 161 }, // exactly ONE enterprise grant left, pro spent
  rows: [
    { id: "h1", refDays: 60, checkedDays: 2, tier: "essentials", reviews: 9000 },
    { id: "h2", refDays: 60, checkedDays: 2, tier: "essentials", reviews: 8000 },
  ],
  runs: [{}],
});
ok(!!s3, "S3: the real route ran");
if (s3) {
  eq(ids(s3.runs[0]), ["h1"], "S3: the one enterprise grant goes to the first row; the second gets NO essentials re-check (that would re-learn the stamp)");
}
const s3b = runChild({
  ledger: PRO_ONLY,
  rows: [
    { id: "ess", refDays: 60, checkedDays: 2, tier: "essentials", reviews: 100 },
    { id: "pro", refDays: 60, checkedDays: 2, tier: "pro", reviews: 9000 },
  ],
  runs: [{}, {}],
});
ok(!!s3b, "S3b: the real route ran");
if (s3b) {
  eq(ids(s3b.runs[0]), ["ess"], "S3b: with only Pro affordable an essentials-checked row escalates to Pro and a pro-checked row waits");
  ok(s3b.runs[0].google[0] && s3b.runs[0].google[0].mask === PRO_MASK, "S3b: ...at the Pro mask");
  eq(ids(s3b.runs[1]), [], "S3b: the escalated row is not bought again");
}

// ── S4: new inventory before scheduled re-check, at both hour slots ─────
for (const slotPlus of [0, 1]) {
  const s4 = runChild({
    ledger: SPENT,
    rows: [
      { id: "scheduled-big", refDays: 60, checkedDays: 30, tier: "essentials", reviews: 90000 },
      { id: "new-small", refDays: 60, checkedDays: null, reviews: 3 },
    ],
    runs: [{ limit: 1, slotPlus }],
  });
  ok(!!s4, `S4(slot+${slotPlus}): the real route ran`);
  if (s4) eq(ids(s4.runs[0]), ["new-small"], `S4(slot+${slotPlus}): with room for one lookup, the never-checked row outranks a scheduled re-check with 30,000x the reviews`);
}

// ── S5: the Google daily counter ────────────────────────────────────────
const dayRows = [
  { id: "new-1", refDays: 60, checkedDays: null, reviews: 5 },
  { id: "sched-1", refDays: 60, checkedDays: 30, tier: "essentials", reviews: 9000 },
];
const atNew = runChild({ ledger: SPENT, dailyUsed: BACKGROUND_DAILY_LINES["new-or-changed"], rows: dayRows, runs: [{}] });
ok(!!atNew, "S5a: the real route ran at the new-inventory line");
if (atNew) {
  eq(atNew.runs[0].google.length, 0, "S5a: at the top line the run makes no Google call");
  eq(atNew.runs[0].selects, 0, "S5a: ...and does not even select rows");
  const pl = atNew.runs[0].pulses[0];
  ok(!!pl && pl.attempted === 0 && pl.failed === 0 && pl.succeeded === 0 && isBudgetReserveNote(pl.note) && /google-details-daily/.test(pl.note), `S5a: the pause is an expected pulse (got ${JSON.stringify(pl)})`);
  const c = classifyHealth([{ job: "inventory-refresh", attempted: 0, succeeded: 0, consecutive_zero: 0, last_note: pl && pl.note }]);
  ok(c.incidents.length === 0 && c.idle.length === 1 && c.budgetLimited.length === 1, "S5a: the REAL classifyHealth reads the pause as idle, listed as budget-limited, never an incident");
  eq(atNew.dailyAfter, BACKGROUND_DAILY_LINES["new-or-changed"], "S5a: the paused run did not tick the counter");
}
const atSched = runChild({ ledger: SPENT, dailyUsed: BACKGROUND_DAILY_LINES["scheduled-refresh"], rows: dayRows, runs: [{}] });
ok(!!atSched, "S5b: the real route ran at the scheduled line");
if (atSched) {
  eq(ids(atSched.runs[0]), ["new-1"], "S5b: past the scheduled-refresh line only NEW inventory is still bought; the scheduled re-check waits for tomorrow");
  eq(atSched.dailyAfter, BACKGROUND_DAILY_LINES["scheduled-refresh"] + 1, "S5b: one lookup, one tick of the day's counter");
}
const edge = runChild({ ledger: SPENT, dailyUsed: BACKGROUND_DAILY_LINES["scheduled-refresh"] - 1, runs: [{}], rows: [
  { id: "sched-a", refDays: 60, checkedDays: 30, tier: "essentials", reviews: 9000 },
  { id: "sched-b", refDays: 60, checkedDays: 30, tier: "essentials", reviews: 8000 },
] });
ok(!!edge, "S5c: the real route ran one under the scheduled line");
if (edge) {
  eq(edge.runs[0].google.length, 1, "S5c: one under the scheduled line exactly ONE scheduled re-check is bought (the line is exact, not approximate)");
  eq(edge.dailyAfter, BACKGROUND_DAILY_LINES["scheduled-refresh"], "S5c: ...and the counter stops at the line");
}
const onlySched = runChild({ ledger: SPENT, dailyUsed: BACKGROUND_DAILY_LINES["scheduled-refresh"], runs: [{}], rows: [{ id: "sched-only", refDays: 60, checkedDays: 30, tier: "essentials", reviews: 9000 }] });
ok(!!onlySched, "S5f: the real route ran past the scheduled line with only scheduled rows");
if (onlySched) {
  eq(onlySched.runs[0].google.length, 0, "S5f: past the scheduled line with nothing new the run buys nothing");
  ok(/nothing unchecked/.test(String(onlySched.runs[0].body.note)) && !onlySched.runs[0].body.noGrant, `S5f: ...and does not even offer the scheduled rows to the gate (selector honours the line; got ${JSON.stringify(onlySched.runs[0].body)})`);
}
const dead = runChild({ ledger: SPENT, ledgerStatus: 500, rows: dayRows, runs: [{}] });
ok(!!dead, "S5d: the real route ran with an unreadable ledger");
if (dead) {
  eq(dead.runs[0].google.length, 0, "S5d: an unreadable day counter fails CLOSED: no Google call");
  const pl = dead.runs[0].pulses[0];
  ok(!!pl && isBudgetReserveNote(pl.note) && /unreadable/.test(pl.note), `S5d: ...and says so in an expected-pause pulse (got ${JSON.stringify(pl)})`);
}
const below = runChild({ ledger: SPENT, dailyUsed: 10, rows: dayRows, runs: [{}] });
ok(!!below, "S5e: the real route ran well below the line");
if (below) eq(ids(below.runs[0]).sort(), ["new-1", "sched-1"], "S5e: POSITIVE CONTROL: below the line both rows are bought, so the pauses above are the line's doing");

// ── S6: pure predicates, with controls ───────────────────────────────────
const CUT = Date.parse("2026-10-18T00:00:00Z");
const recent = (tier) => ({ refreshed_at: "2026-08-25T00:00:00Z", signals: { google_checked_at: "2026-11-10T00:00:00Z", google_check_tier: tier } });
ok(refreshEligible(recent("essentials"), CUT, { enterprise: false, pro: false }) === false, "S6: a recent essentials check is NOT eligible when no richer tier is affordable");
ok(refreshEligible(recent("essentials"), CUT, { enterprise: false, pro: true }) === true, "S6: ...eligible when Pro is");
ok(refreshEligible(recent("pro"), CUT, { enterprise: false, pro: true }) === false, "S6: a recent pro check is not eligible for Pro again");
ok(refreshEligible(recent("pro"), CUT, { enterprise: true, pro: true }) === true, "S6: ...eligible when enterprise is");
ok(refreshEligible(recent("enterprise"), CUT, { enterprise: true, pro: true }) === false, "S6: a recent ENTERPRISE check is never eligible, even with every tier affordable (it re-dated the row)");
ok(refreshEligible(recent("essentials"), CUT) === true, "S6 control: the default (everything affordable) is the #1893 rule");
ok(refreshEligible({ refreshed_at: "2026-08-25T00:00:00Z", signals: {} }, CUT, { enterprise: false, pro: false }) === true, "S6 control: a never-checked stale row is always eligible");
eq(tiersToTry(recent("essentials"), CUT), ["enterprise", "pro"], "S6: a recent essentials check may only be tried at pro or enterprise");
eq(tiersToTry(recent("pro"), CUT), ["enterprise"], "S6: a recent pro check may only be tried at enterprise");
eq(tiersToTry(recent("enterprise"), CUT), [], "S6: a recent enterprise check may not be tried at all");
eq(tiersToTry({ ...recent("essentials"), locked: true }, CUT), [], "S6: a locked (flag-only) row checked inside the window has nothing to try");
eq(tiersToTry({ refreshed_at: "2026-08-25T00:00:00Z", signals: { google_checked_at: "2026-09-01T00:00:00Z", google_check_tier: "essentials" } }, CUT), ["enterprise", "pro", "essentials"], "S6 control: a check older than the window keeps every tier");
ok(neverChecked({ signals: {} }) && !neverChecked(recent("essentials")), "S6: neverChecked tells new inventory from checked");

if (failures) { console.error(`refresh-dedup: ${failures} failure(s), ${passes} passed`); process.exit(1); }
console.log(`refresh-dedup: OK - ${passes} assertions (the real refresh route over a fake PostgREST + ledger + Google: no place is bought twice inside its window, #1893 escalation kept, new inventory before re-checks, daily line pauses with an expected pulse and fails closed)`);
