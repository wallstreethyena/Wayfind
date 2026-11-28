// scripts/test-reengage-edges.mjs — regression lock for the EDGES of re-engagement PR 2:
//   * the conversion seam in lib/serverEvents.js captureServerInBackground (B2, B3, B4)
//   * the signal route /api/reengage/signal and handleSignal (B16)
//   * the Resend webhook /api/reengage/webhook/resend and verifySvix (B14, B15)
//
// Hermetic: no real network, no real Supabase, no real Resend. globalThis.fetch is a stub that
// MODELS the tables and records EVERY call, so "zero calls", "never awaited" and "no row" are
// counted against actual calls. Every function and route below is EXECUTED and its RESULT
// asserted; where a source check stands in for an execution its message says so.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { loadComponent } from "./lib/jsxLoad.mjs";

// The guards set this for every guard they spawn; a DIRECT run of this file must not emit either.
process.env.WF_SUPPRESS_ANALYTICS = "1";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let failures = 0;
let assertions = 0;
const ok = (condition, message) => {
  assertions += 1;
  if (!condition) { console.error("test-reengage-edges: FAIL — " + message); failures += 1; }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const within = (p, ms) => Promise.race([Promise.resolve(p).then(() => true, () => true), sleep(ms).then(() => false)]);
const until = async (pred, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (pred()) return true; await sleep(10); } return pred(); };

// ── environment ─────────────────────────────────────────────────────────────
const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"; // the fake secret Resend publishes in its docs, never a real one
process.env.WF_REENGAGE_ENABLED = "1";
process.env.SUPABASE_URL = "https://fake-edges.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role_test_key";
process.env.RESEND_API_KEY = "re_test_key";
process.env.WF_RESEND_WEBHOOK_SECRET = SECRET;
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL; // the go route reads offers with the anon pair
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon_test_key";
delete process.env.NEXT_PUBLIC_SITE_URL;
delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
const ANON = "123e4567-e89b-42d3-a456-426614174000";
const ANON2 = "223e4567-e89b-42d3-a456-426614174001";
const PLAN_REF = "0123456789abcdef0123456789abcdef";
const TOKEN = "ab".repeat(32);
const EMAIL = "test.user@example.test";
const SNAP = { area: "sarasota", areaName: "Sarasota", when: "2026-12-20", days: [{ label: "Day 1", stops: [{ id: "p1", name: "Ringling Museum", lat: 27.3834, lng: -82.5593 }, { id: "p2", name: "Siesta Beach", city: "Siesta Key" }] }] };

// ── the table model ─────────────────────────────────────────────────────────
const QUEUE_STATUS = new Set(["pending", "sending", "sent", "cancelled", "suppressed_converted", "skipped_cap", "skipped_suppressed", "failed"]);
const QUEUE_KEYS = (() => {
  const sql = readFileSync(path.join(ROOT, "supabase/migrations/20261128040000_wf_reengagement.sql"), "utf8").replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g, "");
  const keys = [];
  for (const m of sql.matchAll(/create unique index (?:if not exists )?\w+\s+on public\.wf_reengage_queue\s*\(([^)]*)\)\s*(nulls not distinct)?\s*;/gi)) keys.push({ cols: m[1].split(",").map((c) => c.trim()), nnd: !!m[2] });
  return keys;
})();
const SIGNAL_KINDS_DB = new Set(["itinerary_generated", "out_click", "hub_view", "return_visit"]);
let calls = [];
const allCalls = [];
let S = {};
let seq = 5000;
function world(over = {}) {
  calls = [];
  S = { queue: [], contacts: [], suppressions: [], signals: [], pushSubs: [], cache: {}, deals: [], hang: false, storeDown: false, resendCancels: [], ...over };
}
const jsonRes = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const filters = (u) => (u.split("?")[1] || "").split("&").filter(Boolean).map((p) => { const i = p.indexOf("="); return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))]; }).filter(([k]) => !["select", "limit", "order", "on_conflict", "offset"].includes(k));
const param = (u, k) => ((u.split("?")[1] || "").split("&").map((p) => p.split("=")).find(([x]) => x === k) || [])[1];
const cmp = (a, b) => (typeof a === "string" && /^\d{4}-\d{2}-\d{2}T/.test(a) ? Date.parse(a) - Date.parse(b) : (a < b ? -1 : a > b ? 1 : 0));
function qMatch(row, [k, v]) {
  const cell = row[k];
  if (v === "is.null") return cell == null;
  if (v === "not.is.null") return cell != null;
  const dot = v.indexOf(".");
  const op = v.slice(0, dot); const val = v.slice(dot + 1);
  if (op === "eq") return cell != null && String(cell) === val;
  if (op === "neq") return String(cell) !== val;
  if (op === "in") return val.slice(1, -1).split(",").includes(String(cell));
  if (op === "gte") return cell != null && cmp(cell, val) >= 0;
  if (op === "lt") return cell != null && cmp(cell, val) < 0;
  throw new Error("stub: unsupported filter " + k + "=" + v);
}
const project = (rows, sel) => { const cols = sel && sel !== "*" ? sel.split(",") : null; return rows.map((r) => (cols ? Object.fromEntries(cols.map((c) => [c, r[c] ?? null])) : { ...r })); };
const TABLES = { wf_reengage_queue: "queue", wf_reengage_contacts: "contacts", wf_reengage_suppressions: "suppressions", wf_reengage_signals: "signals", wf_reengage_push_subs: "pushSubs", wf_deals: "deals" };
const sameKey = (ix, a, b) => ix.cols.every((c) => { const x = a[c] ?? null; const y = b[c] ?? null; if (!ix.nnd && (x === null || y === null)) return false; return x === y; });
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const never = () => new Promise(() => {});

async function handle(rec) {
  const { u, method } = rec;
  if (u.startsWith("https://api.resend.com/emails/") && u.endsWith("/cancel")) { S.resendCancels.push(u); return jsonRes({ ok: true }); }
  if (u.startsWith("https://api.resend.com/")) return jsonRes({ id: "em_" + (seq += 1) });
  if (u.includes("/rest/v1/wf_job_pulse")) return new Response(null, { status: 201 });
  if (u.includes("/rest/v1/wf_places_cache")) {
    const key = decodeURIComponent(u.split("k=eq.")[1].split("&")[0]);
    const v = S.cache[key];
    return jsonRes(v ? [{ k: key, v, exp: new Date(Date.now() + 3600e3).toISOString(), wrote_at: new Date().toISOString() }] : []);
  }
  const m = /\/rest\/v1\/([a-z_]+)/.exec(u);
  const key = m && TABLES[m[1]];
  if (!key) return jsonRes({}, 404);
  if (S.storeDown && m[1].startsWith("wf_reengage")) return jsonRes({}, 500);
  const rows = S[key];
  if (method === "GET") {
    const out = rows.filter((r) => filters(u).every((f) => qMatch(r, f)));
    return jsonRes(project(out.slice(0, Number(param(u, "limit")) || 1000), decodeURIComponent(param(u, "select") || "")));
  }
  if (method === "PATCH") {
    const hit = rows.filter((r) => filters(u).every((x) => qMatch(r, x)));
    if (key === "queue" && rec.body.status && !QUEUE_STATUS.has(rec.body.status)) return jsonRes({ code: "23514" }, 400);
    for (const r of hit) Object.assign(r, rec.body);
    return /return=representation/.test(String((rec.headers || {}).Prefer)) ? jsonRes(project(hit, decodeURIComponent(param(u, "select") || ""))) : new Response(null, { status: 204 });
  }
  if (method === "POST") {
    const list = Array.isArray(rec.body) ? rec.body : [rec.body];
    const ignore = /resolution=ignore-duplicates/.test(String((rec.headers || {}).Prefer));
    const arbiter = (param(u, "on_conflict") || "").split(",").filter(Boolean);
    for (const r of list) {
      const full = { id: (seq += 1), created_at: new Date().toISOString(), ...r };
      if (key === "queue") {
        if (!QUEUE_STATUS.has(full.status || "pending")) return jsonRes({ code: "23514" }, 400);
        full.status = full.status || "pending"; full.attempts = 0; full.sent_at = null;
        const hit = QUEUE_KEYS.filter((ix) => rows.some((o) => sameKey(ix, o, full)));
        if (hit.length) { const arb = arbiter.length ? QUEUE_KEYS.find((ix) => sameSet(ix.cols, arbiter)) : null; if (ignore && arb && hit.includes(arb)) continue; return jsonRes({ code: "23505" }, 409); }
      }
      if (key === "signals" && !SIGNAL_KINDS_DB.has(full.kind)) return jsonRes({ code: "23514" }, 400);
      if (key === "suppressions" && full.provider_event_id && rows.some((o) => o.provider_event_id === full.provider_event_id)) {
        // Postgres ignores a unique violation only when ON CONFLICT names that constraint's column
        if (ignore && arbiter.length === 1 && arbiter[0] === "provider_event_id") continue;
        return jsonRes({ code: "23505" }, 409);
      }
      rows.push(full);
    }
    return new Response(null, { status: 201 });
  }
  return new Response(null, { status: 204 });
}
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const raw = init && init.body ? String(init.body) : "";
  const rec = { u, method: (init && init.method) || "GET", raw, body: parse(raw), headers: (init && init.headers) || {} };
  calls.push(rec); allCalls.push(rec);
  if (S.hang && (u.includes("wf_reengage") || u.startsWith("https://api.resend.com/"))) return never(); // a store that never answers
  const res = await handle(rec);
  rec.status = res.status;
  return res;
};
const reengageCalls = () => calls.filter((c) => c.u.includes("wf_reengage") || c.u.startsWith("https://api.resend.com/"));
const writeCalls = () => calls.filter((c) => c.method !== "GET" && (c.u.includes("/rest/v1/") || c.u.startsWith("https://api.resend.com/")));

// ── load the real modules ───────────────────────────────────────────────────
const load = (rel, opts) => loadComponent(path.join(ROOT, rel), ROOT, opts);
const R = await load("lib/reengageServer.js");
const W = await load("lib/resendWebhook.js");
const signalRoute = await load("app/api/reengage/signal/route.js");
const hookRoute = await load("app/api/reengage/webhook/resend/route.js");
const events = await load("lib/serverEvents.js");
const goRoute = await load("app/api/commerce/go/route.js");

// ── fixtures ────────────────────────────────────────────────────────────────
const NOWISO = () => new Date().toISOString();
const qrow = (o = {}) => ({ id: (seq += 1), anon_id: ANON, contact_id: null, trigger_type: "itinerary_abandoned", channel: "push", step: 0, dedupe_key: "k" + seq, payload: {}, scheduled_for: new Date(Date.now() + 3600e3).toISOString(), status: "pending", resend_email_id: null, cancelled_reason: null, attempts: 0, sent_at: null, created_at: NOWISO(), ...o });
const sub = (o = {}) => ({ id: (seq += 1), anon_id: ANON, endpoint_hash: "a".repeat(64), revoked_at: null, ...o });
const contact = (o = {}) => ({ id: 7, email: EMAIL, email_hash: R.emailHash(EMAIL), status: "subscribed", confirmed_at: NOWISO(), unsubscribe_token: TOKEN, ...o });
const todayET = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const byId = (id) => S.queue.find((r) => r.id === id);

// ── B2 + B3 + B4. the conversion seam ───────────────────────────────────────
const human = { traffic_class: "human", provider: "undercover_tourist", offer_id: "freetext query that must never be stored" };
const hdrs = (cookie, referer = "https://www.gowayfind.com/guides/best-beaches") => new Headers({ ...(cookie ? { cookie } : {}), ...(referer ? { referer } : {}), "user-agent": "Mozilla/5.0 test" });
const started = (e, extra = {}) => e.captureServerInBackground("provider_redirect_started", { distinctId: "ph-test", properties: human, headers: hdrs("wf_anon_id=" + ANON), ...extra });
const seedForConversion = () => {
  const emailRowA = qrow({ contact_id: 7, channel: "email", step: 1, trigger_type: "itinerary_abandoned", dedupe_key: PLAN_REF, resend_email_id: "11111111-2222-3333-4444-555555555555", payload: { plan: SNAP } });
  const pushRowA = qrow({ trigger_type: "hub_browse", dedupe_key: "2026-12:/guides/x" });
  const dropOld = qrow({ trigger_type: "affiliate_drop", dedupe_key: "2000-01-01" });
  const otherAnon = qrow({ anon_id: ANON2, trigger_type: "hub_browse", dedupe_key: "2026-12:/guides/y" });
  const sent = qrow({ status: "sent", trigger_type: "itinerary_abandoned", dedupe_key: "sent-one" });
  world({ contacts: [contact()], pushSubs: [sub()], queue: [emailRowA, pushRowA, dropOld, otherAnon, sent] });
  return { emailRowA, pushRowA, dropOld, otherAnon, sent };
};
{
  // B2 part 1: with every re-engagement store hung, the call still returns (never awaited)
  const rows = seedForConversion();
  S.hang = true;
  const p = started(events);
  ok(p && typeof p.then === "function", "B2 captureServerInBackground did not return a promise");
  ok(await within(p, 1500), "B2 the call did not return while every re-engagement fetch hung: the seam is on the request path");
  ok(await until(() => reengageCalls().length >= 1), "B2 positive control: the seam never started the suppression (the hang proved nothing)");
  ok(rows.emailRowA.status === "pending", "B2 a hung store somehow settled a row");
  // B2 part 2: with a working store the effects land
  const r2 = seedForConversion();
  const before = S.queue.length;
  const p2 = started(events);
  ok(await within(p2, 1500), "B2 the capture promise did not resolve");
  ok(await until(() => S.signals.some((s) => s.kind === "out_click") && S.queue.some((x) => x.trigger_type === "affiliate_drop" && x.dedupe_key === todayET())), "B2 the out_click signal and the new affiliate_drop row were not written");
  ok(r2.emailRowA.status === "suppressed_converted" && r2.emailRowA.cancelled_reason === "converted", "B2 the pending email row was not suppressed_converted: " + r2.emailRowA.status);
  ok(r2.pushRowA.status === "suppressed_converted", "B2 the pending push row was not suppressed_converted: " + r2.pushRowA.status);
  ok(r2.dropOld.status === "pending" && !r2.dropOld.cancelled_reason, "B2 the pending affiliate_drop row was touched: " + r2.dropOld.status);
  ok(r2.otherAnon.status === "pending" && r2.sent.status === "sent", "B2 another visitor's row or an already sent row was changed");
  ok(S.signals.length === 1 && S.signals[0].kind === "out_click" && S.signals[0].anon_id === ANON && S.signals[0].path === null && JSON.stringify(S.signals[0].meta) === "{}", "B2 exactly one out_click signal with no path and empty meta was not written: " + JSON.stringify(S.signals));
  const drops = S.queue.filter((x) => x.trigger_type === "affiliate_drop" && x.anon_id === ANON);
  const fresh = drops.find((x) => x.dedupe_key === todayET());
  ok(drops.length === 2 && fresh && fresh.channel === "push" && fresh.step === 0 && fresh.status === "pending" && fresh.payload.path === "/guides/best-beaches" && S.queue.length === before + 1, "B2 exactly one new affiliate_drop push row with the Referer path was not written: " + JSON.stringify(fresh));
  ok(Math.abs(Date.parse(fresh.scheduled_for) - (Date.now() + 24 * 3600e3)) < 60e3, "B2 the affiliate_drop row is not due about 24 h from now: " + fresh.scheduled_for);
  ok(!JSON.stringify([...S.queue, ...S.signals]).includes("freetext") && !JSON.stringify([...S.queue, ...S.signals]).includes("undercover_tourist"), "B2 a browser or partner supplied string (offer id, provider) reached a stored row");
  ok(S.resendCancels.length === 1 && S.resendCancels[0] === "https://api.resend.com/emails/11111111-2222-3333-4444-555555555555/cancel", "B2 the belt did not cancel the one scheduled Resend email: " + S.resendCancels.join());
  const patch = calls.find((c) => c.method === "PATCH" && c.u.includes("wf_reengage_queue"));
  ok(patch && /trigger_type=neq\.affiliate_drop/.test(patch.u) && /status=eq\.pending/.test(patch.u) && patch.u.includes(`anon_id=eq.${ANON}`), "B2 the suppression PATCH lacks the affiliate_drop exclusion, the pending filter or the anon filter: " + (patch && patch.u));
  // a visitor with no active push subscription gets the signal row but no drop row
  const r3 = seedForConversion(); S.pushSubs = [];
  await started(events);
  ok(await until(() => S.signals.length === 1) && (await sleep(100), true) && !S.queue.some((x) => x.trigger_type === "affiliate_drop" && x.dedupe_key === todayET()), "B2 an affiliate_drop row was queued for a visitor with no push subscription");
  void r3;
  // a Referer from another site never becomes the landing path
  seedForConversion();
  await started(events, { headers: hdrs("wf_anon_id=" + ANON, "https://evil.example/guides/best-beaches") });
  ok(await until(() => S.queue.some((x) => x.trigger_type === "affiliate_drop" && x.dedupe_key === todayET())) && S.queue.find((x) => x.dedupe_key === todayET()).payload.path === "/", "B2 a foreign Referer became the drop landing path");
  seedForConversion();
  await started(events, { headers: hdrs("wf_anon_id=" + ANON, "https://www.gowayfind.com/api/viator/go?offer=x") });
  ok(await until(() => S.queue.some((x) => x.trigger_type === "affiliate_drop" && x.dedupe_key === todayET())) && S.queue.find((x) => x.dedupe_key === todayET()).payload.path === "/", "B2 an /api/ Referer path became the drop landing path");
}
{
  // B3 negatives: zero re-engagement calls, after a positive control proves the wait is long enough
  seedForConversion();
  await started(events);
  const t0 = Date.now();
  ok(await until(() => reengageCalls().length > 0), "B3 positive control: the seam made no call");
  const settleMs = Math.max(250, (Date.now() - t0) * 4);
  const neg = async (label, fn) => {
    seedForConversion();
    const p = fn();
    ok(await within(p, 1500), `B3 ${label}: the capture promise did not resolve`);
    await sleep(settleMs);
    ok(reengageCalls().length === 0, `B3 ${label}: ${reengageCalls().length} re-engagement calls were made (${reengageCalls().map((c) => c.method + " " + c.u.slice(-60)).join(" | ")})`);
  };
  const flag = process.env.WF_REENGAGE_ENABLED;
  delete process.env.WF_REENGAGE_ENABLED;
  await neg("WF_REENGAGE_ENABLED unset", () => started(events));
  process.env.WF_REENGAGE_ENABLED = "0";
  await neg("WF_REENGAGE_ENABLED=0", () => started(events));
  process.env.WF_REENGAGE_ENABLED = flag;
  for (const tc of ["synthetic", "automation", "crawler", undefined]) await neg("traffic_class " + tc, () => started(events, { properties: { ...human, traffic_class: tc } }));
  await neg("no cookie", () => started(events, { headers: hdrs(null) }));
  await neg("a cookie that is not wf_anon_id", () => started(events, { headers: hdrs("other=" + ANON) }));
  for (const bad of ["not-a-uuid", "123e4567-e89b-42d3-a456-42661417400", "123e4567-e89b-42d3-a456-4266141740000", "'; drop table--", ""]) await neg("malformed cookie " + JSON.stringify(bad), () => started(events, { headers: hdrs("wf_anon_id=" + bad) }));
  await neg("provider_redirect_failed", () => events.captureServerInBackground("provider_redirect_failed", { distinctId: "ph-test", properties: human, headers: hdrs("wf_anon_id=" + ANON) }));
  await neg("provider_redirect_refused", () => events.captureServerInBackground("provider_redirect_refused", { distinctId: "ph-test", properties: human, headers: hdrs("wf_anon_id=" + ANON) }));
  await neg("a call with no options at all", () => events.captureServerInBackground("provider_redirect_started"));
  // a throwing suppressOnConversion leaves the returned promise resolving as before, with no unhandled rejection
  const orchAbs = path.join(ROOT, "lib/reengageOrchestrate.js");
  const orchSrc = readFileSync(orchAbs, "utf8");
  const marker = "export async function suppressOnConversion(anonId, {";
  ok(orchSrc.includes(marker), "B3 the throwing mutation target moved: suppressOnConversion's signature was not found");
  const throwing = orchSrc.replace(marker, "export async function suppressOnConversion(anonId, __opts = {}) { throw new Error('boom'); }\nasync function _unused(anonId, {");
  ok(throwing !== orchSrc, "B3 the throwing mutation did not apply");
  const eventsThrow = await load("lib/serverEvents.js", { sourceOverrides: new Map([[orchAbs, throwing]]) });
  let unhandled = 0;
  const onUnhandled = () => { unhandled += 1; };
  process.on("unhandledRejection", onUnhandled);
  seedForConversion();
  const pThrow = started(eventsThrow);
  ok(await within(pThrow, 1500) && (await pThrow) === false, "B3 a throwing suppressOnConversion changed what the capture promise resolves to");
  await sleep(300);
  ok(unhandled === 0, "B3 a throwing suppressOnConversion produced an unhandled rejection");
  process.off("unhandledRejection", onUnhandled);
  ok(S.queue.find((x) => x.contact_id === 7).status === "pending", "B3 positive control for the throwing copy: nothing was suppressed");
}
{
  // B4. the real commerce redirect, executed. Same request three ways: pending rows + subscription, none, and re-engagement off.
  const goReq = () => new Request("https://www.gowayfind.com/api/commerce/go?provider=undercover_tourist&offer=9912345&surface=cuisine&click_id=wf-abc123", {
    headers: { cookie: `wf_anon_id=${ANON}`, referer: "https://www.gowayfind.com/guides/best-beaches", "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", "sec-fetch-site": "same-origin" },
  });
  const snap = (res) => JSON.stringify({ status: res.status, headers: [...res.headers.entries()].sort() });
  const deal = [{ id: "9912345", affiliate_url: "https://www.anrdoezrs.net/click-101643573-5678?url=https%3A%2F%2Fexample.com" }];
  seedForConversion(); S.deals = deal;
  const withRows = await goRoute.GET(goReq());
  ok(withRows.status === 302 && /anrdoezrs\.net/.test(withRows.headers.get("location") || ""), "B4 positive control: the real go route did not 302 to the partner: " + withRows.status + " " + withRows.headers.get("location"));
  ok(await until(() => S.signals.some((s) => s.kind === "out_click")), "B4 positive control: the seam did not run behind the real go route (so the redirect equality proves nothing)");
  world({ deals: deal });
  const without = await goRoute.GET(goReq());
  const flagBefore = process.env.WF_REENGAGE_ENABLED;
  delete process.env.WF_REENGAGE_ENABLED;
  seedForConversion(); S.deals = deal;
  const off = await goRoute.GET(goReq());
  process.env.WF_REENGAGE_ENABLED = flagBefore;
  ok(snap(withRows) === snap(without) && snap(without) === snap(off), "B4 the redirect differs with pending rows, without, and with re-engagement off:\n" + [snap(withRows), snap(without), snap(off)].join("\n"));
  // a store that never answers must not hold the redirect either
  seedForConversion(); S.deals = deal; S.hang = true;
  const hungP = goRoute.GET(goReq());
  ok(await within(hungP, 2000), "B4 the real go route hung while the re-engagement stores never answered");
  const hung = await hungP;
  ok(snap(hung) === snap(without), "B4 the redirect changed while the re-engagement stores hung");
  // the hang detector is real: a route that AWAITS its capture hangs on the same stub (self-proof of the check above)
  const goAbs = path.join(ROOT, "app/api/commerce/go/route.js");
  const goSrc = readFileSync(goAbs, "utf8");
  const needle = 'try { emit("provider_redirect_started", resolverPath ? { resolver_path: resolverPath } : undefined); } catch {}';
  ok(goSrc.includes(needle), "B4 the self-proof target moved: the started emit line was not found");
  const awaited = goSrc.replace(needle, 'try { emit("provider_redirect_started", resolverPath ? { resolver_path: resolverPath } : undefined); await __waitSeam(); } catch {}').replace("const emit = (event, extra) => {", "const __seamPromises = []; const __waitSeam = () => Promise.all(__seamPromises);\n  const emit = (event, extra) => {").replace("captureServerInBackground(event, { distinctId", "__seamPromises.push(captureServerInBackground(event, { distinctId").replace("personless: !cookieDistinctId });", "personless: !cookieDistinctId }));");
  ok(awaited !== goSrc && awaited.includes("__seamPromises.push"), "B4 the self-proof mutation did not apply");
  // that mutation awaits the capture promise (which resolves quickly); the seam's own work is detached, so it must STILL return
  // promptly. Make the detector bite by awaiting the suppression itself through a stub module that never resolves.
  const hangEvents = readFileSync(path.join(ROOT, "lib/serverEvents.js"), "utf8").replace("mod.suppressOnConversion(m[1], { referer })).catch(() => false);", "mod.suppressOnConversion(m[1], { referer })).catch(() => false); return r;");
  ok(hangEvents.includes("return r;"), "B4 the second self-proof mutation did not apply");
  const eventsAbs = path.join(ROOT, "lib/serverEvents.js");
  const goHang = await load("app/api/commerce/go/route.js", { sourceOverrides: new Map([[goAbs, awaited], [eventsAbs, hangEvents]]) });
  seedForConversion(); S.deals = deal; S.hang = true;
  const hangProbe = goHang.GET(goReq()); hangProbe.then((r) => { globalThis.__probe = "resolved " + r.status; }, (e) => { globalThis.__probe = "rejected " + (e && e.message); });
  await sleep(800);
  ok(globalThis.__probe === undefined, "B4 self-proof: the mutated route settled (" + globalThis.__probe + ") instead of hanging against a store that never answers; the hang check above cannot fail"); void 0;
  ok(!(await within(goHang.GET(goReq()), 800)), "B4 self-proof: a route that awaits the suppression must hang against a store that never answers, and it did not, so the hang check above cannot fail");
}

// ── B16. the signal route, EXECUTED ─────────────────────────────────────────
{
  const post = (body, { cookie = "wf_anon_id=" + ANON, headers = {} } = {}) => signalRoute.POST(new Request("https://www.gowayfind.com/api/reengage/signal", {
    method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers }, body: typeof body === "string" ? body : JSON.stringify(body),
  }));
  const bodyOf = async (res) => JSON.stringify(await res.clone().json());
  // unconfigured: 503 with zero calls (three ways)
  for (const [label, mutate, restore] of [
    ["flag off", () => { delete process.env.WF_REENGAGE_ENABLED; }, () => { process.env.WF_REENGAGE_ENABLED = "1"; }],
    ["no Resend key", () => { delete process.env.RESEND_API_KEY; }, () => { process.env.RESEND_API_KEY = "re_test_key"; }],
    ["no Supabase", () => { delete process.env.SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_URL; }, () => { process.env.SUPABASE_URL = "https://fake-edges.supabase.test"; process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL; }],
  ]) {
    world(); mutate();
    const res = await post({ kind: "return_visit" });
    ok(res.status === 503 && (await res.json()).code === "unconfigured" && calls.length === 0, `B16 unconfigured (${label}) was not 503 with zero calls: ${res.status} calls=${calls.length}`);
    restore();
  }
  // three kinds accepted; out_click and junk refused
  world({ pushSubs: [sub()], cache: { ["reengage-plan:" + PLAN_REF]: SNAP } });
  for (const body of [{ kind: "itinerary_generated", planRef: PLAN_REF }, { kind: "hub_view", path: "/christmas-in-florida" }, { kind: "return_visit" }]) {
    const res = await post(body);
    ok(res.status === 200 && (await bodyOf(res)) === '{"ok":true}', `B16 kind ${body.kind} was not accepted with {ok:true}: ${res.status}`);
  }
  ok(S.signals.map((s) => s.kind).join() === "itinerary_generated,hub_view,return_visit" && S.signals.every((s) => s.anon_id === ANON), "B16 the three accepted kinds did not each write exactly one signal row for the cookie's id: " + JSON.stringify(S.signals));
  ok(S.signals[0].meta.planRef === PLAN_REF && JSON.stringify(S.signals[1].meta) === "{}" && S.signals[1].path === "/christmas-in-florida" && S.signals[0].path === null, "B16 signal meta or path wrong (planRef only for itinerary_generated)");
  for (const bad of [{ kind: "out_click" }, { kind: "nonsense" }, {}, { kind: 5 }, "not json", "[]", { kind: "return_visit", pad: "x".repeat(1100) }]) {
    world();
    const res = await post(bad);
    ok(res.status === 400 && S.signals.length === 0 && writeCalls().length === 0, `B16 ${JSON.stringify(bad).slice(0, 40)} was not a 400 with zero writes: ${res.status}`);
  }
  // the body can never choose the visitor
  world();
  await post({ kind: "return_visit", anonId: ANON2, anon_id: ANON2 });
  ok(S.signals.length === 1 && S.signals[0].anon_id === ANON, "B16 the anonymous id came from the body instead of the cookie");
  // refusals write nothing: no cookie, malformed cookie, GPC, synthetic
  for (const [label, opts] of [
    ["no cookie", { cookie: null }], ["a malformed cookie", { cookie: "wf_anon_id=nope" }],
    ["Global Privacy Control", { headers: { "sec-gpc": "1" } }], ["a synthetic request", { headers: { "user-agent": "WayfindSyntheticMonitor/1.0 (+test)" } }],
  ]) {
    world();
    const res = await post({ kind: "return_visit" }, opts);
    ok(res.status === 200 && (await bodyOf(res)) === '{"ok":true}' && calls.length === 0, `B16 ${label} was not 200 with zero calls: ${res.status} calls=${calls.length}`);
  }
  // queueing: positives first, then the negatives that must queue nothing
  world({ pushSubs: [sub()], cache: { ["reengage-plan:" + PLAN_REF]: SNAP } });
  await post({ kind: "itinerary_generated", planRef: PLAN_REF });
  const it = S.queue.find((r) => r.trigger_type === "itinerary_abandoned");
  ok(it && it.channel === "push" && it.step === 0 && it.dedupe_key === PLAN_REF && it.contact_id === null && it.status === "pending" && Math.abs(Date.parse(it.scheduled_for) - (Date.now() + 30 * 60e3)) < 60e3, "B16 itinerary_generated did not queue one push row due in 30 minutes keyed by the planRef: " + JSON.stringify(it));
  ok(it && it.payload.v === 1 && it.payload.planRef === PLAN_REF && it.payload.areaName === "Sarasota" && it.payload.stops === 2 && it.payload.when === "2026-12-20" && it.payload.path === "/plan-my-day" && it.payload.flow === "itinerary_abandoned", "B16 the itinerary push payload is not built from the snapshot: " + JSON.stringify(it && it.payload));
  await post({ kind: "itinerary_generated", planRef: PLAN_REF });
  ok(S.queue.filter((r) => r.trigger_type === "itinerary_abandoned").length === 1, "B16 a repeat of the same planRef queued a second row");
  world({ pushSubs: [sub()], cache: {} });
  await post({ kind: "itinerary_generated", planRef: "fedcba9876543210fedcba9876543210" });
  ok(S.queue.length === 0 && S.signals.length === 1, "B16 an expired planRef queued something");
  world({ cache: { ["reengage-plan:" + PLAN_REF]: SNAP } });
  await post({ kind: "itinerary_generated", planRef: PLAN_REF });
  ok(S.queue.length === 0, "B16 a visitor with no active subscription had a row queued");
  world({ pushSubs: [sub({ revoked_at: NOWISO() })], cache: { ["reengage-plan:" + PLAN_REF]: SNAP } });
  await post({ kind: "itinerary_generated", planRef: PLAN_REF });
  ok(S.queue.length === 0, "B16 a visitor whose only subscription is revoked had a row queued");
  world();
  await post({ kind: "hub_view", path: "/christmas-in-florida" });
  ok(S.queue.length === 0 && S.signals.length === 1, "B16 a hub view from a visitor with no active subscription queued a row");
  world({ pushSubs: [sub()], cache: { ["reengage-plan:" + PLAN_REF]: SNAP } });
  await post({ kind: "itinerary_generated" });
  await post({ kind: "itinerary_generated", planRef: "NOT-A-PLAN-REF" });
  ok(S.queue.length === 0, "B16 itinerary_generated without a valid planRef queued something");
  // hubs
  world({ pushSubs: [sub()] });
  for (const p of ["/best-beaches", "/christmas-in-florida/", "/christmas-in-florida/x/y", "/guides/", "/guides/a_b", "/api/viator/go", "//evil.example", "/christmas-in-florida?x=1", "/" + "a".repeat(130)]) await post({ kind: "hub_view", path: p });
  ok(S.queue.length === 0, "B16 a hub path outside the pattern queued a row: " + S.queue.map((r) => r.dedupe_key).join());
  await post({ kind: "hub_view", path: "/christmas-in-florida/sarasota" });
  await post({ kind: "hub_view", path: "/guides/best-beaches" });
  await post({ kind: "hub_view", path: "/guides/best-beaches" });
  const hubs = S.queue.filter((r) => r.trigger_type === "hub_browse");
  ok(hubs.length === 2 && hubs.every((r) => r.dedupe_key.startsWith(todayET().slice(0, 7) + ":/") && Math.abs(Date.parse(r.scheduled_for) - (Date.now() + 24 * 3600e3)) < 60e3 && r.channel === "push"), "B16 hub views did not queue one row per hub per month due in 24 h: " + JSON.stringify(hubs.map((r) => r.dedupe_key)));
  ok(hubs.find((r) => r.payload.path === "/christmas-in-florida/sarasota").payload.hub === "christmas" && hubs.find((r) => r.payload.path === "/guides/best-beaches").payload.hub === "guide", "B16 the hub kind in the payload is wrong");
  // return_visit and hub_view from one boot, both orders: the new hub row survives its own page load
  for (const order of [["hub_view", "return_visit"], ["return_visit", "hub_view"]]) {
    world({ pushSubs: [sub()] });
    for (const kind of order) await post({ kind, path: "/christmas-in-florida" });
    const row = S.queue.find((r) => r.trigger_type === "hub_browse");
    ok(row && row.status === "pending" && !row.cancelled_reason, `B16 return_visit and hub_view from one boot (${order.join(" then ")}) did not leave the new hub_browse row pending: ` + (row && state(row)));
  }
  // return_visit cancels rows older than 30 minutes, only for this visitor, only drop and hub rows
  const old = (o) => qrow({ created_at: new Date(Date.now() - 2 * 3600e3).toISOString(), ...o });
  world({ pushSubs: [sub()], queue: [old({ trigger_type: "hub_browse", dedupe_key: "h" }), old({ trigger_type: "affiliate_drop", dedupe_key: "a" }), old({ trigger_type: "itinerary_abandoned", dedupe_key: "i" }), old({ anon_id: ANON2, trigger_type: "hub_browse", dedupe_key: "o" }), qrow({ trigger_type: "affiliate_drop", dedupe_key: "fresh" })] });
  await post({ kind: "return_visit" });
  const st = S.queue.map((r) => r.status + "/" + (r.cancelled_reason || "-"));
  ok(st[0] === "cancelled/returned" && st[1] === "cancelled/returned" && st[2] === "pending/-" && st[3] === "pending/-" && st[4] === "pending/-", "B16 return_visit did not cancel exactly the old hub and drop rows of this visitor: " + st.join(" | "));
  // the answer never reveals what was queued
  world({ pushSubs: [sub()] });
  const queued = await bodyOf(await post({ kind: "hub_view", path: "/christmas-in-florida" }));
  world();
  const notQueued = await bodyOf(await post({ kind: "hub_view", path: "/christmas-in-florida" }));
  ok(queued === notQueued && queued === '{"ok":true}', "B16 the response differs when a row was queued: " + queued + " vs " + notQueued);
  const flagged = await post({ kind: "return_visit" });
  ok(flagged.headers.get("cache-control") === "no-store", "B16 the signal response is cacheable");
}
function state(r) { return `${r.status}/${r.cancelled_reason || "-"}`; }

// ── B14. the Svix signature and the webhook gate, EXECUTED ───────────────────
const DOC = { secret: SECRET, id: "msg_p5jXN8AQM9LWM0D4loKWxJek", timestamp: "1614265330", raw: '{"test": 2432232314}', signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=" };
const AT = 1614265330 * 1000;
{
  ok(W.verifySvix({ ...DOC, now: AT }) === true, "B14 the documented Svix example did not verify (secret, id, timestamp, body, signature as published by Resend)");
  ok(W.verifySvix({ ...DOC, now: AT + 300e3 }) === true && W.verifySvix({ ...DOC, now: AT - 300e3 }) === true, "B14 the 300 s boundary does not verify");
  ok(W.verifySvix({ ...DOC, raw: '{"test": 2432232315}', now: AT }) === false, "B14 a flipped body byte verified");
  ok(W.verifySvix({ ...DOC, now: AT + 301e3 }) === false && W.verifySvix({ ...DOC, now: AT - 301e3 }) === false, "B14 a 301 s skewed timestamp verified");
  const sig = DOC.signature.slice(3);
  const flipped = "v1," + (sig[0] === "g" ? "h" : "g") + sig.slice(1);
  ok(W.verifySvix({ ...DOC, signature: flipped, now: AT }) === false, "B14 a flipped signature byte verified");
  ok(W.verifySvix({ ...DOC, signature: DOC.signature.slice(0, 20), now: AT }) === false, "B14 a truncated signature verified");
  ok(W.verifySvix({ ...DOC, signature: "v1,AAAA " + DOC.signature, now: AT }) === true && W.verifySvix({ ...DOC, signature: DOC.signature + " v1,AAAA", now: AT }) === true, "B14 a header with several entries must verify when any v1 entry matches");
  ok(W.verifySvix({ ...DOC, signature: "v2," + sig, now: AT }) === false && W.verifySvix({ ...DOC, signature: sig, now: AT }) === false, "B14 a non v1 or unversioned entry verified");
  ok(W.verifySvix({ ...DOC, id: "msg_other", now: AT }) === false && W.verifySvix({ ...DOC, timestamp: "1614265331", now: AT }) === false, "B14 a different id or timestamp verified (they are part of the signed content)");
  ok(W.verifySvix({ ...DOC, secret: "whsec_" + Buffer.from("another secret").toString("base64"), now: AT }) === false && W.verifySvix({ ...DOC, secret: "", now: AT }) === false && W.verifySvix({ ...DOC, secret: undefined, now: AT }) === false, "B14 another secret, an empty secret or no secret verified");
  ok(W.verifySvix({ ...DOC, timestamp: "abc", now: AT }) === false && W.verifySvix({ ...DOC, now: Number.NaN }) === false, "B14 a non numeric timestamp or clock verified");
}
const signed = (obj, { id = "msg_test_1", ts = Math.floor(Date.now() / 1000), secret = SECRET, tamper = false, raw: rawIn } = {}) => {
  const raw = rawIn != null ? rawIn : JSON.stringify(obj);
  const mac = createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`${id}.${ts}.${raw}`).digest("base64");
  return new Request("https://www.gowayfind.com/api/reengage/webhook/resend", {
    method: "POST", headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": String(ts), "svix-signature": "v1," + mac },
    body: tamper ? raw.replace("test.user", "test.usex") : raw,
  });
}
const hook = (req) => hookRoute.POST(req);
const bounce = (to, type = "Permanent") => ({ type: "email.bounced", created_at: new Date().toISOString(), data: { email_id: "e1", to, bounce: { type, subType: "General", message: "x" } } });
{
  // no secret: 503 and the body is never read
  const kept = process.env.WF_RESEND_WEBHOOK_SECRET;
  delete process.env.WF_RESEND_WEBHOOK_SECRET;
  world();
  let read = false;
  const res = await hookRoute.POST({ headers: new Headers({ "content-length": "10" }), text: async () => { read = true; return "{}"; } });
  ok(res.status === 503 && (await res.json()).code === "unconfigured" && read === false && calls.length === 0, `B14 no secret was not 503 with the body unread and zero calls: ${res.status} read=${read} calls=${calls.length}`);
  process.env.WF_RESEND_WEBHOOK_SECRET = "   ";
  const res2 = await hookRoute.POST({ headers: new Headers(), text: async () => { read = true; return "{}"; } });
  ok(res2.status === 503 && read === false, "B14 a blank secret was accepted as configured");
  process.env.WF_RESEND_WEBHOOK_SECRET = kept;
  // 401 with zero database calls: flipped byte, 301 s old, each missing header, wrong secret, junk
  const good = bounce([EMAIL]);
  world({ contacts: [contact()] });
  const cases = [
    ["a flipped byte", signed(good, { tamper: true })],
    ["a 301 s old timestamp", signed(good, { ts: Math.floor(Date.now() / 1000) - 301 })],
    ["a timestamp 301 s ahead", signed(good, { ts: Math.floor(Date.now() / 1000) + 301 })],
    ["the wrong secret", signed(good, { secret: "whsec_" + Buffer.from("not the secret").toString("base64") })],
  ];
  for (const h of ["svix-id", "svix-timestamp", "svix-signature"]) {
    const r = signed(good); const headers = new Headers(r.headers); headers.delete(h);
    cases.push(["a missing " + h, new Request(r.url, { method: "POST", headers, body: JSON.stringify(good) })]);
  }
  for (const [label, req] of cases) {
    const res = await hook(req);
    ok(res.status === 401 && calls.length === 0, `B14 ${label} was not 401 with zero calls: ${res.status} calls=${calls.length}`);
  }
  ok(S.suppressions.length === 0 && S.contacts[0].status === "subscribed", "B14 a rejected request changed state");
  // body size
  const big = signed(null, { raw: JSON.stringify({ type: "x", pad: "y".repeat(70000) }) });
  const bigRes = await hook(big);
  ok(bigRes.status === 413 && calls.length === 0, "B14 a body over 65,536 bytes was not 413 with zero calls: " + bigRes.status);
  const ctl = await hook(signed({ type: "email.delivered", data: { to: [EMAIL] } }));
  ok(ctl.status === 200 && calls.length === 0, "B14 positive control: a correctly signed, ignorable event was not 200 with zero calls: " + ctl.status);
}

// ── B15. what a verified event does ─────────────────────────────────────────
{
  const seed = () => {
    const email = qrow({ contact_id: 7, channel: "email", step: 1, dedupe_key: PLAN_REF, payload: { plan: SNAP } });
    const email2 = qrow({ contact_id: 7, channel: "email", step: 2, dedupe_key: PLAN_REF, payload: { plan: SNAP } });
    const other = qrow({ contact_id: 8, channel: "email", step: 1, dedupe_key: "o8" });
    world({ contacts: [contact(), contact({ id: 8, email: "b@example.test", email_hash: R.emailHash("b@example.test"), unsubscribe_token: "cd".repeat(32) })], queue: [email, email2, other] });
    return { email, email2, other };
  };
  for (const [label, evt, kind, status, source] of [
    ["permanent bounce", bounce([EMAIL]), "hard_bounce", "bounced", "resend_bounce"],
    ["complaint", { type: "email.complained", data: { to: [EMAIL] } }, "complaint", "complained", "resend_complaint"],
    ["Resend suppression", { type: "email.suppressed", data: { to: [EMAIL] } }, "hard_bounce", "bounced", "resend_suppressed"],
    ["contact unsubscribe", { type: "contact.updated", data: { id: "c1", email: EMAIL, unsubscribed: true } }, "unsubscribe", "unsubscribed", "resend_contact"],
  ]) {
    const rows = seed();
    const res = await hook(signed(evt, { id: "msg_" + kind + "_1" }));
    ok(res.status === 200 && (await res.json()).ok === true, `B15 ${label}: not 200 {ok:true}: ${res.status}`);
    ok(S.suppressions.length === 1 && S.suppressions[0].email_hash === R.emailHash(EMAIL) && S.suppressions[0].kind === kind && S.suppressions[0].source === source && S.suppressions[0].provider_event_id === `resend:msg_${kind}_1:0`, `B15 ${label}: the suppression row is wrong: ` + JSON.stringify(S.suppressions));
    ok(S.contacts[0].status === status && S.contacts[1].status === "subscribed", `B15 ${label}: the contact status is ${S.contacts[0].status}, expected ${status} (and the other contact untouched)`);
    ok(rows.email.status === "cancelled" && rows.email.cancelled_reason === kind && rows.email2.status === "cancelled" && rows.other.status === "pending", `B15 ${label}: pending rows were not cancelled for this contact only: ${state(rows.email)} ${state(rows.email2)} ${state(rows.other)}`);
    // a replay of the same svix-id adds no row and changes nothing more
    const calls0 = calls.length;
    const replay = await hook(signed(evt, { id: "msg_" + kind + "_1" }));
    ok(replay.status === 200 && S.suppressions.length === 1, `B15 ${label}: a replay of the same svix-id added a row or failed: ${replay.status} rows=${S.suppressions.length}`);
    void calls0;
  }
  // Temporary bounce, delivered, opened, junk types: zero writes
  for (const evt of [bounce([EMAIL], "Temporary"), { type: "email.bounced", data: { to: [EMAIL] } }, { type: "email.delivered", data: { to: [EMAIL] } }, { type: "email.opened", data: { to: [EMAIL] } }, { type: "contact.updated", data: { email: EMAIL, unsubscribed: false } }, { type: "contact.updated", data: { email: EMAIL } }, { type: "domain.updated", data: {} }, { type: "email.complained", data: { to: [] } }]) {
    seed();
    const res = await hook(signed(evt, { id: "msg_ign_" + Math.random().toString(36).slice(2, 8) }));
    ok(res.status === 200 && writeCalls().length === 0 && S.suppressions.length === 0 && S.contacts[0].status === "subscribed", `B15 ${evt.type} (${JSON.stringify(evt.data.bounce || evt.data.unsubscribed)}) wrote something: ${res.status} writes=${writeCalls().length}`);
  }
  // a suppression is written even when no contact exists; the first 5 addresses only; the address is never in a URL
  world();
  const six = Array.from({ length: 6 }, (_, i) => `person${i}@example.test`);
  const res = await hook(signed(bounce(six), { id: "msg_six" }));
  ok(res.status === 200 && S.suppressions.length === 5 && S.suppressions.map((s) => s.provider_event_id).join() === "resend:msg_six:0,resend:msg_six:1,resend:msg_six:2,resend:msg_six:3,resend:msg_six:4" && S.suppressions.every((s, i) => s.email_hash === R.emailHash(six[i])), "B15 six addresses and no contact: expected 5 suppressions keyed by index, got " + S.suppressions.length);
  ok(!calls.some((c) => /@|%40/i.test(c.u)) && !calls.some((c) => c.raw.includes("@")), "B15 an address reached a URL or a request body (only the hash may)");
  // a store failure is 503 so Svix retries
  seed(); S.storeDown = true;
  const down = await hook(signed(bounce([EMAIL]), { id: "msg_down" }));
  ok(down.status === 503 && (await down.json()).code === "unavailable", "B15 a store failure was not 503: " + down.status);
  // an address that is not an address is skipped, not stored
  world();
  await hook(signed({ type: "email.complained", data: { to: ["not an address", 5, null] } }, { id: "msg_bad" }));
  ok(S.suppressions.length === 0, "B15 a non address was stored as a suppression");
  // the contact PATCH only touches subscribed contacts, by hash
  seed();
  await hook(signed(bounce([EMAIL]), { id: "msg_patch" }));
  const patch = calls.find((c) => c.method === "PATCH" && c.u.includes("wf_reengage_contacts"));
  ok(patch && patch.u.includes(`email_hash=eq.${R.emailHash(EMAIL)}`) && patch.u.includes("status=eq.subscribed"), "B15 the contact PATCH is not keyed by email_hash and status=subscribed: " + (patch && patch.u));
  const post0 = calls.find((c) => c.method === "POST" && c.u.includes("wf_reengage_suppressions"));
  ok(post0 && /on_conflict=provider_event_id/.test(post0.u) && /resolution=ignore-duplicates/.test(post0.headers.Prefer), "B15 the suppression insert lacks on_conflict=provider_event_id with ignore-duplicates: " + (post0 && post0.u));
}

// ── the whole run ───────────────────────────────────────────────────────────
{
  ok(allCalls.length > 100, "positive control: the run recorded only " + allCalls.length + " calls");
  ok(!allCalls.some((c) => /@|%40/i.test(c.u)), "an address appeared in a request URL somewhere in the run");
  const queueOrSignalBodies = allCalls.filter((c) => c.method !== "GET" && (c.u.includes("wf_reengage_queue") || c.u.includes("wf_reengage_signals")));
  ok(queueOrSignalBodies.length > 30 && queueOrSignalBodies.every((c) => !c.raw.includes("@")), "an @ appeared in a queue or signal row body (or the positive control saw too few writes: " + queueOrSignalBodies.length + ")");
  ok(allCalls.filter((c) => c.status === 409).length === 0, "a request hit a unique key collision (409): " + allCalls.filter((c) => c.status === 409).map((c) => c.u.slice(-70)).join(" | "));
}

if (failures) { console.error(`test-reengage-edges: ${failures} failure(s) out of ${assertions} assertions`); process.exit(1); }
console.log(`test-reengage-edges: OK — ${assertions} assertions over ${allCalls.length} recorded calls; conversion seam never awaited (hung stores, real commerce go route byte equal with and without rows), neq.affiliate_drop, negatives, signal route, Svix verify (documented example) and webhook effects`);
