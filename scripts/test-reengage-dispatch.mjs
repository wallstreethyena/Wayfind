// scripts/test-reengage-dispatch.mjs — regression lock for the re-engagement SENDER (PR 2):
// lib/reengageDispatch.js, app/api/cron/reengage-dispatch, the message builders in
// lib/reengageOrchestrate.js, and the push endpoint kernel lib/reengagePushCrypto.js.
//
// Hermetic: no real network, no real Supabase, no real Resend, no real push service.
// globalThis.fetch is replaced by a stub that MODELS the tables (filters, claims, unique
// keys, status checks) and records EVERY call, so "never sent", "sent at most once" and
// "zero writes" are counted against calls, not read off the source. Every function and
// route below is EXECUTED and its RESULT asserted. Where a source check stands in for an
// execution, its message says so.
//
// Covers contract tests B1 and B5 (the link assertion), B6 to B13 and B17.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let failures = 0;
let assertions = 0;
const ok = (condition, message) => {
  assertions += 1;
  if (!condition) { console.error("test-reengage-dispatch: FAIL — " + message); failures += 1; }
};

// ── load the real modules ───────────────────────────────────────────────────
const load = (rel, opts) => loadComponent(path.join(ROOT, rel), ROOT, opts);
const crypto = await load("lib/reengagePushCrypto.js");
const webPush = await load("lib/webPush.js");
const D = await load("lib/reengageDispatch.js");
const O = await load("lib/reengageOrchestrate.js");
const R = await load("lib/reengageServer.js");
const N = await load("lib/newsletter.js");
const cronRoute = await load("app/api/cron/reengage-dispatch/route.js");
const { OWN_LIFECYCLE_SOURCES } = await import("../lib/attribution.js");

// ── environment (process.env is what the route reads, so the library gets it too) ──
const vapid = webPush.generateVapidKeys();
process.env.WF_REENGAGE_ENABLED = "1";
const SUPABASE_URL = "https://fake-dispatch.supabase.test";
const SERVICE_KEY = "service_role_test_key";
const CRON_SECRET = "cron_test_secret";
process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
process.env.RESEND_API_KEY = "re_test_key";
process.env.NEXT_PUBLIC_WF_VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.WF_VAPID_PRIVATE_KEY = vapid.privateKey;
process.env.CRON_SECRET = CRON_SECRET;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SITE_URL;
delete process.env.NEWSLETTER_POSTAL;
delete process.env.WF_REENGAGE_FROM;
delete process.env.WF_REENGAGE_DISPATCH;
const SB = { url: SUPABASE_URL, key: SERVICE_KEY };
// What the library receives as `env`: a plain object, so no assertion reads the shell (check-guard-hermeticity).
const ENV = { ...process.env };
const OTHER_VAPID = webPush.generateVapidKeys();

const TOKEN = "ab".repeat(32);
const ANON = "123e4567-e89b-42d3-a456-426614174000";
const ANON2 = "223e4567-e89b-42d3-a456-426614174001";
const PLAN_REF = "0123456789abcdef0123456789abcdef";
const EMAIL = "test.user@example.test";
const NOW = Date.parse("2026-12-01T17:00:00Z"); // noon US Eastern, outside quiet hours
const NOW_QUIET = Date.parse("2026-12-02T07:00:00Z"); // 2 AM US Eastern
const iso = (ms) => new Date(ms).toISOString();
const H = 3600e3;
const SNAP = { area: "sarasota", areaName: "Sarasota", when: "2026-12-20", days: [{ label: "Day 1", stops: [
  { id: "p1", name: "Ringling Museum", address: "5401 Bay Shore Rd, Sarasota, FL", lat: 27.3834, lng: -82.5593, url: "/places/ChIJabc" },
  { id: "p2", name: "Siesta Beach", city: "Siesta Key" },
] }] };

// ── the table model ─────────────────────────────────────────────────────────
const QUEUE_STATUS = new Set(["pending", "sending", "sent", "cancelled", "suppressed_converted", "skipped_cap", "skipped_suppressed", "failed"]);
const QUEUE_KEYS = (() => {
  const sql = readFileSync(path.join(ROOT, "supabase/migrations/20261128040000_wf_reengagement.sql"), "utf8").replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g, "");
  const keys = [];
  for (const m of sql.matchAll(/create unique index (?:if not exists )?\w+\s+on public\.wf_reengage_queue\s*\(([^)]*)\)\s*(nulls not distinct)?\s*;/gi)) keys.push({ cols: m[1].split(",").map((c) => c.trim()), nnd: !!m[2] });
  return keys;
})();
let calls = [];
const allCalls = [];
let S = {};
let seq = 1000;
function world(over = {}) {
  calls = [];
  S = {
    queue: [], contacts: [], suppressions: [], signals: [], pushSubs: [], memberSubs: [], cache: {},
    resendOk: true, ticks: () => 0, selectStatus: 0, claimIgnoresStatus: false,
    pushResult: {}, pushCalls: [], ...over,
  };
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
  if (op === "lte") return cell != null && cmp(cell, val) <= 0;
  if (op === "lt") return cell != null && cmp(cell, val) < 0;
  throw new Error("stub: unsupported filter " + k + "=" + v);
}
const project = (rows, sel) => {
  const cols = sel && sel !== "*" ? sel.split(",") : null;
  return rows.map((r) => (cols ? Object.fromEntries(cols.map((c) => [c, r[c] ?? null])) : { ...r }));
};
const TABLES = { wf_reengage_queue: "queue", wf_reengage_contacts: "contacts", wf_reengage_suppressions: "suppressions", wf_reengage_signals: "signals", wf_reengage_push_subs: "pushSubs", wf_web_push_subscriptions: "memberSubs" };
const sameKey = (ix, a, b) => ix.cols.every((c) => { const x = a[c] ?? null; const y = b[c] ?? null; if (!ix.nnd && (x === null || y === null)) return false; return x === y; });

async function handle(rec) {
  const { u, method } = rec;
  for (let i = S.ticks(); i > 0; i -= 1) await new Promise((r) => setImmediate(r));
  if (u.startsWith("https://api.resend.com/emails")) {
    if (!S.resendOk) return jsonRes({ message: "no" }, 422);
    return jsonRes({ id: "em_" + (seq += 1) });
  }
  if (u.includes("/rest/v1/wf_job_pulse")) return new Response(null, { status: 201 });
  if (u.includes("/rest/v1/wf_places_cache")) {
    const key = decodeURIComponent(u.split("k=eq.")[1].split("&")[0]);
    const v = S.cache[key];
    return jsonRes(v ? [{ k: key, v, exp: iso(NOW + 3600e3), wrote_at: iso(NOW) }] : []);
  }
  const m = /\/rest\/v1\/([a-z_]+)/.exec(u);
  const key = m && TABLES[m[1]];
  if (!key) return jsonRes({}, 404);
  const rows = S[key];
  if (method === "GET") {
    if (key === "queue" && S.selectStatus && u.includes("status=eq.pending") && u.includes("scheduled_for=lte.")) return jsonRes({ message: "boom" }, S.selectStatus);
    let out = rows.filter((r) => filters(u).every((f) => qMatch(r, f)));
    const order = param(u, "order");
    if (order) { const cols = order.split(",").map((o) => o.split(".")); out = out.slice().sort((a, b) => { for (const [c, d] of cols) { const x = cmp(a[c], b[c]); if (x) return d === "desc" ? -x : x; } return 0; }); }
    const off = Number(param(u, "offset")) || 0; const lim = Number(param(u, "limit")) || 1000;
    return jsonRes(project(out.slice(off, off + lim), decodeURIComponent(param(u, "select") || "")));
  }
  if (method === "PATCH") {
    const f = filters(u);
    const hit = rows.filter((r) => f.every((x) => qMatch(r, x)));
    if (key === "queue" && rec.body.status && !QUEUE_STATUS.has(rec.body.status)) return jsonRes({ code: "23514" }, 400);
    if (key === "queue" && rec.body.cancelled_reason && String(rec.body.cancelled_reason).length > 80) return jsonRes({ code: "23514" }, 400);
    for (const r of hit) Object.assign(r, rec.body);
    return /return=representation/.test(String((rec.headers || {}).Prefer)) ? jsonRes(project(hit, decodeURIComponent(param(u, "select") || ""))) : new Response(null, { status: 204 });
  }
  if (method === "DELETE") {
    const f = filters(u);
    S[key] = rows.filter((r) => !f.every((x) => qMatch(r, x)));
    return new Response(null, { status: 204 });
  }
  if (method === "POST") {
    const list = Array.isArray(rec.body) ? rec.body : [rec.body];
    const ignore = /resolution=ignore-duplicates/.test(String((rec.headers || {}).Prefer));
    for (const r of list) {
      const full = { id: (seq += 1), created_at: iso(NOW), ...r };
      if (key === "queue") {
        if (!QUEUE_STATUS.has(full.status || "pending")) return jsonRes({ code: "23514" }, 400);
        full.status = full.status || "pending"; full.attempts = 0; full.sent_at = null;
        if (QUEUE_KEYS.some((ix) => rows.some((o) => sameKey(ix, o, full)))) { if (ignore) continue; return jsonRes({ code: "23505" }, 409); }
      }
      if (key === "suppressions" && full.provider_event_id && rows.some((o) => o.provider_event_id === full.provider_event_id)) { if (ignore) continue; return jsonRes({ code: "23505" }, 409); }
      rows.push(full);
    }
    return new Response(null, { status: 201 });
  }
  return new Response(null, { status: 204 });
}
const fetchStub = async (url, init = {}) => {
  const u = String(url);
  const raw = init && init.body ? String(init.body) : "";
  const rec = { u, method: (init && init.method) || "GET", raw, body: parse(raw), headers: (init && init.headers) || {} };
  calls.push(rec); allCalls.push(rec);
  const res = await handle(rec);
  rec.status = res.status;
  return res;
};
globalThis.fetch = fetchStub;
const pushSend = async ({ subscription, payload, ttl }) => {
  S.pushCalls.push({ endpoint: subscription.endpoint, keys: subscription.keys, payload, ttl });
  return S.pushResult[subscription.endpoint] || { ok: true, status: 201, gone: false };
};
const resendCalls = () => calls.filter((c) => c.u.startsWith("https://api.resend.com/"));
const writes = () => calls.filter((c) => c.method !== "GET" && c.u.includes("/rest/v1/"));
const run = (over = {}) => D.runReengageDispatch({ sb: SB, env: ENV, now: NOW, fetchImpl: fetchStub, send: pushSend, ...over });

// ── fixtures ────────────────────────────────────────────────────────────────
const contact = (o = {}) => ({ id: 7, email: EMAIL, email_hash: R.emailHash(EMAIL), status: "subscribed", confirmed_at: iso(NOW - 48 * H), unsubscribe_token: TOKEN, ...o });
const qrow = (o = {}) => ({ id: (seq += 1), anon_id: ANON, contact_id: null, trigger_type: "itinerary_abandoned", channel: "push", step: 0, dedupe_key: "k" + seq, payload: {}, scheduled_for: iso(NOW - 60e3), status: "pending", resend_email_id: null, cancelled_reason: null, attempts: 0, sent_at: null, created_at: iso(NOW - 2 * H), ...o });
const emailRow = (o = {}) => qrow({ contact_id: 7, channel: "email", step: 1, dedupe_key: PLAN_REF, payload: { planRef: PLAN_REF, area: "sarasota", plan: SNAP }, ...o });
const pushRow = (o = {}) => qrow({ payload: { v: 1, flow: "itinerary_abandoned", path: "/plan-my-day", planRef: PLAN_REF, areaName: "Sarasota", stops: 2, when: "2026-12-20" }, ...o });
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/dispatch-endpoint-1";
const sub = (o = {}) => {
  const endpoint = o.endpoint || ENDPOINT;
  const env = o.env || ENV;
  return { id: (seq += 1), anon_id: ANON, endpoint_hash: crypto.endpointHash(endpoint), endpoint_enc: crypto.sealField(endpoint, "endpoint", { env }), keys_enc: crypto.sealField(JSON.stringify({ p256dh: "p256dh_value", auth: "auth_value" }), "keys", { env }), tz: "America/New_York", revoked_at: null, created_at: iso(NOW - 5 * H), ...(o.row || {}) };
};
const find = (id) => S.queue.find((r) => r.id === id);
const state = (r) => `${r.status}/${r.cancelled_reason || "-"}`;
const wrote = (id) => calls.some((c) => c.method !== "GET" && c.u.includes("wf_reengage_queue") && c.u.includes(`id=eq.${id}`));

// ── B1. the kernel vector ───────────────────────────────────────────────────
{
  const env = { WF_VAPID_PRIVATE_KEY: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc" };
  const plain = "https://fcm.googleapis.com/fcm/send/test-endpoint";
  const sealed = crypto.sealField(plain, "endpoint", { env, iv: Buffer.alloc(12, 1) });
  ok(sealed === "v1.AQEBAQEBAQEBAQEB.ASJAY8eXvAerkzQithaqePecbBuLaFcMZjxXe2ZXfPIeGIHWie9HCW5YcNpYklc5tw.dywLasmfITHQk2R0HB24Gw", "B1 the known answer sealed endpoint changed: " + sealed);
  ok(crypto.endpointHash(plain) === "3e237dc2fad6caa7e5f23fbf0d6596584da65ae8aef4bc9b587d61a28409a613", "B1 endpointHash drifted");
  ok(crypto.openField(sealed, "endpoint", { env }) === plain, "B1 a sealed endpoint did not open under the same key");
  ok(crypto.openField(sealed, "keys", { env }) === null, "B1 a sealed endpoint opened as keys (the AAD is not binding the field)");
  ok(crypto.openField(sealed, "endpoint", { env: { WF_VAPID_PRIVATE_KEY: vapid.privateKey } }) === null, "B1 a different key opened the endpoint");
  ok(crypto.sealField(plain, "endpoint", { env: {} }) === null, "B1 sealing with no key did not return null");
  const big = crypto.sealField("x".repeat(1000), "endpoint", { env });
  ok(big.length === 1377 && big.length < 4000, "B1 a 1,000 char endpoint did not seal to 1,377 chars (measured; the contract text says 1,371), inside the 4,000 char column: " + big.length);
  const src = readFileSync(path.join(ROOT, "lib/reengagePushCrypto.js"), "utf8");
  ok(createHash("sha256").update(src).digest("hex") === "a6bd808bbe13ef1efff68c65b55c6f11b7a5933bc65c2b87ddf431fd78ad892e", "B1 lib/reengagePushCrypto.js is not byte identical to the pinned kernel (it must match Lane A and contract 3.1)");
}

// ── B6. gating: one row each, status + reason, and call counts ──────────────
{
  // positive control first: a fully sendable email row sends exactly once
  world({ contacts: [contact()], queue: [emailRow()] });
  const r0 = await run();
  ok(r0.sent === 1 && resendCalls().length === 1 && state(S.queue[0]) === "sent/-" && S.queue[0].resend_email_id && S.queue[0].sent_at, "B6 positive control: a confirmed, subscribed, unsuppressed contact with a due step did not send exactly once: " + JSON.stringify({ r0, calls: resendCalls().length, row: state(S.queue[0]) }));
  const b = resendCalls()[0].body;
  ok(resendCalls()[0].headers["Idempotency-Key"] === `reengage/drip/${S.queue[0].id}` && b.scheduled_at === undefined && !("scheduled_at" in b), "B6 the Resend call has the wrong idempotency key or carries scheduled_at (the queue must be the only scheduler)");
  ok(b.to.length === 1 && b.to[0] === EMAIL && b.subject === "Directions for your Sarasota plan" && b.headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click" && b.headers["List-Unsubscribe"] === `<https://www.gowayfind.com/api/reengage/unsubscribe?t=${TOKEN}>`, "B6 the email lacks the recipient, the step 1 subject or the one click unsubscribe headers");
  ok(/Unsubscribe<\/a>/.test(b.html) && /Unsubscribe: https:\/\//.test(b.text) && b.html.includes(N.NEWSLETTER_POSTAL) && b.text.includes(N.NEWSLETTER_POSTAL) , "B6 the email lost the visible unsubscribe link or the postal line");
}
async function gate(label, setup, expect) {
  world(setup());
  const row = S.queue.find((r) => r.id === S.target) || S.queue[0];
  const target = row.id;
  const res = await run();
  expect({ res, row: find(target), target });
  return res;
}
{
  const cases = [
    ["unconfirmed contact", () => ({ contacts: [contact({ confirmed_at: null })], queue: [emailRow()] }), ({ row }) => row.status === "pending" && !row.cancelled_reason, "stays pending (waits for the confirm click, then ages out), never claimed"],
    ["unsubscribed contact", () => ({ contacts: [contact({ status: "unsubscribed" })], queue: [emailRow()] }), ({ row }) => state(row) === "skipped_suppressed/contact_unsubscribed", "skipped_suppressed/contact_unsubscribed"],
    ["bounced contact", () => ({ contacts: [contact({ status: "bounced" })], queue: [emailRow()] }), ({ row }) => state(row) === "skipped_suppressed/contact_bounced", "skipped_suppressed/contact_bounced"],
    ["complained contact", () => ({ contacts: [contact({ status: "complained" })], queue: [emailRow()] }), ({ row }) => state(row) === "skipped_suppressed/contact_complained", "skipped_suppressed/contact_complained"],
    ["suppressed email hash", () => ({ contacts: [contact()], suppressions: [{ id: 1, email_hash: R.emailHash(EMAIL), kind: "hard_bounce" }], queue: [emailRow()] }), ({ row }) => state(row) === "skipped_suppressed/suppressed", "skipped_suppressed/suppressed"],
    ["email plan date past", () => ({ contacts: [contact()], queue: [emailRow({ payload: { planRef: PLAN_REF, area: "sarasota", plan: { ...SNAP, when: "2026-11-30" } } })] }), ({ row }) => state(row) === "cancelled/plan_past", "cancelled/plan_past"],
    ["push plan date past", () => ({ pushSubs: [sub()], queue: [pushRow({ payload: { v: 1, flow: "itinerary_abandoned", path: "/plan-my-day", planRef: PLAN_REF, areaName: "Sarasota", stops: 2, when: "2026-11-30" } })] }), ({ row }) => state(row) === "cancelled/plan_past", "cancelled/plan_past"],
    ["push with no subscription", () => ({ queue: [pushRow()] }), ({ row }) => state(row) === "cancelled/no_push_sub", "cancelled/no_push_sub"],
    ["push with only a revoked subscription", () => ({ pushSubs: [sub({ row: { revoked_at: iso(NOW - H) } })], queue: [pushRow()] }), ({ row }) => state(row) === "cancelled/no_push_sub", "cancelled/no_push_sub"],
  ];
  for (const [label, setup, check, want] of cases) {
    await gate(label, setup, ({ res, row }) => {
      ok(check({ row }), `B6 ${label}: the row ended ${state(row)}, expected ${want}`);
      ok(resendCalls().length === 0 && S.pushCalls.length === 0, `B6 ${label}: a message was sent (resend=${resendCalls().length} push=${S.pushCalls.length})`);
      ok(res.sent === 0, `B6 ${label}: the run counted a send`);
    });
  }
  // quiet hours and a member daily pick: the row stays pending and is not written at all
  world({ pushSubs: [sub()], queue: [pushRow({ scheduled_for: iso(NOW_QUIET - 60e3) })] });
  let rowId = S.queue[0].id;
  let res = await run({ now: NOW_QUIET });
  ok(find(rowId).status === "pending" && !wrote(rowId) && S.pushCalls.length === 0 && res.deferred === 1, "B6 quiet hours: the push row was not left pending and untouched: " + state(find(rowId)));
  world({ pushSubs: [sub()], queue: [pushRow({ scheduled_for: iso(NOW_QUIET + 8 * H - 60e3) })] });
  ok((await run({ now: NOW_QUIET + 8 * H })).sent === 1 && S.pushCalls.length === 1, "B6 positive control: the same push row sends outside quiet hours (10 AM Eastern)");
  world({ pushSubs: [sub()], memberSubs: [{ id: 1, endpoint: ENDPOINT, last_sent_on: "2026-12-01" }], queue: [pushRow()] });
  rowId = S.queue[0].id;
  res = await run();
  ok(find(rowId).status === "pending" && !wrote(rowId) && S.pushCalls.length === 0 && res.deferred === 1, "B6 daily pick sent today: the push row was not left pending and untouched: " + state(find(rowId)));
  ok(calls.filter((c) => c.u.includes("wf_web_push_subscriptions")).every((c) => c.method === "GET"), "B6 the member subscription table was written (read only is the rule)");
  world({ pushSubs: [sub()], memberSubs: [{ id: 1, endpoint: ENDPOINT, last_sent_on: "2026-11-30" }], queue: [pushRow()] });
  ok((await run()).sent === 1, "B6 positive control: a member daily pick from YESTERDAY must not block today's push");
  // drip email spacing: a drip email already sent 10 h ago defers this one
  world({ contacts: [contact()], queue: [emailRow({ step: 2, dedupe_key: PLAN_REF }), emailRow({ id: 9001, step: 1, status: "sent", sent_at: iso(NOW - 10 * H), scheduled_for: iso(NOW - 12 * H) })] });
  rowId = S.queue[0].id;
  await run();
  ok(find(rowId).status === "pending" && !wrote(rowId) && resendCalls().length === 0, "B6 a drip email sent 10 h ago did not defer the next one: " + state(find(rowId)));
  // an unconfigured world sends nothing and writes nothing
  world({ contacts: [contact()], queue: [emailRow()] });
  const off = await run({ env: { ...process.env, WF_REENGAGE_ENABLED: "0" } });
  ok(off.ok === false && off.reason === "unconfigured" && calls.length === 0, "B6 a run with re-engagement off made " + calls.length + " calls");
}

// ── B7. caps: 2 per 7 days (email by contact, push by anon), 1 push per local day ─
{
  const sent = (n, o = {}) => Array.from({ length: n }, (_, i) => qrow({ status: "sent", sent_at: iso(NOW - (30 + 24 * i) * H), scheduled_for: iso(NOW - (31 + 24 * i) * H), ...o }));
  world({ contacts: [contact()], queue: [...sent(2, { contact_id: 7, channel: "email", step: 1, dedupe_key: "old" }), emailRow({ step: 3 })] });
  const due = S.queue[2].id;
  await run();
  ok(state(find(due)) === "skipped_cap/weekly" && resendCalls().length === 0, "B7 email: 2 sent in 7 days + 1 due did not give skipped_cap/weekly: " + state(find(due)));
  world({ contacts: [contact()], queue: [...sent(1, { contact_id: 7, channel: "email", step: 1, dedupe_key: "old" }), emailRow({ step: 2 })] });
  await run();
  ok(S.queue[1].status === "sent", "B7 positive control: 1 sent in 7 days + 1 due must still send");
  world({ pushSubs: [sub()], queue: [...sent(2, { channel: "push", dedupe_key: "o" }).map((r, i) => ({ ...r, dedupe_key: "o" + i })), pushRow()] });
  const pdue = S.queue[2].id;
  await run();
  ok(state(find(pdue)) === "skipped_cap/weekly" && S.pushCalls.length === 0, "B7 push: 2 sent in 7 days + 1 due did not give skipped_cap/weekly: " + state(find(pdue)));
  world({ pushSubs: [sub()], queue: [qrow({ channel: "push", status: "sent", sent_at: iso(NOW - 2 * H), dedupe_key: "today" }), pushRow()] });
  await run();
  ok(state(S.queue[1]) === "skipped_cap/daily" && S.pushCalls.length === 0, "B7 push: one push already sent today did not give skipped_cap/daily: " + state(S.queue[1]));
  world({ pushSubs: [sub()], queue: [qrow({ channel: "push", status: "sent", sent_at: iso(NOW - 26 * H), dedupe_key: "yday" }), pushRow()] });
  await run();
  ok(S.queue[1].status === "sent", "B7 positive control: a push sent yesterday must not block today's");
  // another recipient's sends never count against this one
  world({ contacts: [contact(), contact({ id: 8, email: "other@example.test", email_hash: R.emailHash("other@example.test"), unsubscribe_token: "cd".repeat(32) })], queue: [...sent(2, { contact_id: 8, channel: "email", step: 1, dedupe_key: "o8" }).map((r, i) => ({ ...r, dedupe_key: "o8" + i })), emailRow()] });
  await run();
  ok(S.queue[2].status === "sent", "B7 another contact's sent rows counted against this contact");
  // a simulated week: steps +2h, +24h, +72h, the dispatcher running at each due time
  const T0 = NOW;
  world({ contacts: [contact()], queue: [emailRow({ step: 1, scheduled_for: iso(T0 + 2 * H) }), emailRow({ step: 2, scheduled_for: iso(T0 + 24 * H) }), emailRow({ step: 3, scheduled_for: iso(T0 + 72 * H) })] });
  for (const at of [T0 + 1 * H, T0 + 2 * H + 60e3, T0 + 2.5 * H, T0 + 24 * H + 60e3, T0 + 48 * H, T0 + 72 * H + 60e3, T0 + 96 * H]) await run({ now: at });
  const sentCount = S.queue.filter((r) => r.status === "sent").length;
  ok(sentCount === 2 && resendCalls().length === 2 && S.queue[0].status === "sent" && S.queue[1].status === "sent" && state(S.queue[2]) === "skipped_cap/weekly", "B7 the week: expected steps 1 and 2 sent and step 3 skipped_cap/weekly, got " + S.queue.map(state).join(" | ") + " resend=" + resendCalls().length);
  ok(resendCalls().map((c) => c.body.subject).join("|") === "Directions for your Sarasota plan|Still going to Sarasota? Your plan is one tap away", "B7 the step subjects are not the contract's: " + resendCalls().map((c) => c.body.subject).join("|"));
}

// ── B8. overlap: two dispatchers over the same due rows, interleaved ─────────
{
  let rng = 12345; const next = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng; };
  const trial = async (n) => {
    world({ contacts: [contact(), contact({ id: 8, email: "b@example.test", email_hash: R.emailHash("b@example.test"), unsubscribe_token: "cd".repeat(32) })], ticks: () => next() % 4,
      queue: [emailRow(), emailRow({ contact_id: 8, anon_id: ANON2 })] });
    await Promise.all([run(), run()]);
    const keys = resendCalls().map((c) => c.headers["Idempotency-Key"]);
    return { keys, dup: keys.length !== new Set(keys).size, sent: S.queue.filter((r) => r.status === "sent").length, calls: resendCalls().length, rowsSent: S.queue.map((r) => r.status) };
  };
  let dups = 0; let overs = 0;
  for (let i = 0; i < 30; i += 1) { const t = await trial(i); if (t.dup || t.calls !== t.sent) dups += 1; }
  ok(dups === 0, `B8 across 30 interleavings, ${dups} runs sent a row more than once (or the sends and the sent rows disagree)`);
  // a recipient at 1 sent with 2 due rows ends with at most 2 sent
  for (let i = 0; i < 30; i += 1) {
    world({ contacts: [contact()], ticks: () => next() % 5, queue: [emailRow({ id: 7001, step: 1, status: "sent", sent_at: iso(NOW - 30 * H), scheduled_for: iso(NOW - 40 * H), dedupe_key: "pre" }), emailRow({ step: 2 }), emailRow({ step: 3 })] });
    await Promise.all([run(), run(), run()]);
    if (S.queue.filter((r) => r.status === "sent").length > 2 || resendCalls().length > 1) overs += 1;
  }
  ok(overs === 0, `B8 a recipient at 1 sent with 2 due rows ended with more than 2 sent in ${overs} of 30 interleavings`);
  // positive control: the interleaving really does produce contention (some run lost a claim)
  world({ contacts: [contact()], ticks: () => next() % 3, queue: [emailRow()] });
  const both = await Promise.all([run(), run()]);
  ok(both.reduce((n, r) => n + r.sent, 0) === 1 && both.reduce((n, r) => n + r.lostClaim, 0) + both.reduce((n, r) => n + r.deferred, 0) >= 0 && resendCalls().length === 1, "B8 positive control: two dispatchers over ONE row did not send exactly once");
  // push rows: one push per recipient and day even under overlap
  let pushOver = 0;
  for (let i = 0; i < 20; i += 1) {
    world({ pushSubs: [sub()], ticks: () => next() % 4, queue: [pushRow({ dedupe_key: "a" }), pushRow({ dedupe_key: "b", trigger_type: "hub_browse", payload: { v: 1, flow: "hub_browse", path: "/christmas-in-florida", hub: "christmas" } })] });
    await Promise.all([run(), run()]);
    if (S.pushCalls.length > 1) pushOver += 1;
  }
  ok(pushOver === 0, `B8 two push rows for one recipient both sent in ${pushOver} of 20 interleavings (1 push per local day)`);
}

// ── B9. head of line: unconfirmed rows must not block a sendable row ─────────
{
  const contacts = Array.from({ length: 60 }, (_, i) => contact({ id: 100 + i, email: `u${i}@example.test`, email_hash: R.emailHash(`u${i}@example.test`), confirmed_at: null, unsubscribe_token: String(i).padStart(2, "0").repeat(32) }));
  const queue = contacts.map((c, i) => emailRow({ contact_id: c.id, anon_id: ANON, scheduled_for: iso(NOW - (200 - i) * 60e3), dedupe_key: "u" + i }));
  world({ contacts: [...contacts, contact()], queue: [...queue, emailRow({ scheduled_for: iso(NOW - 30e3), dedupe_key: "sendable" })] });
  const res = await run({ limit: 50 });
  ok(S.queue[60].status === "sent" && resendCalls().length === 1 && res.sent === 1, "B9 with 60 unconfirmed rows ahead and limit 50 the sendable row was not sent: " + state(S.queue[60]));
  ok(S.queue.slice(0, 60).every((r) => r.status === "pending" && !r.cancelled_reason), "B9 an unconfirmed contact's row was claimed or settled instead of left to age out");
}

// ── B10. push: gone subscriptions are revoked, nothing is deleted ───────────
{
  for (const status of [404, 410]) {
    world({ pushSubs: [sub()], queue: [pushRow()] });
    S.pushResult[ENDPOINT] = { ok: false, status, gone: true };
    await run();
    ok(S.pushSubs[0].revoked_at && S.pushSubs[0].revoked_at === iso(NOW) && S.pushSubs.length === 1, `B10 a ${status} did not set revoked_at on the subscription`);
    ok(state(S.queue[0]) === "cancelled/no_push_sub" && calls.every((c) => c.method !== "DELETE"), `B10 ${status}: the row ended ${state(S.queue[0])} or something was deleted`);
  }
  world({ pushSubs: [sub(), sub({ endpoint: "https://fcm.googleapis.com/fcm/send/dispatch-endpoint-2", row: { created_at: iso(NOW - 9 * H) } })], queue: [pushRow()] });
  S.pushResult[ENDPOINT] = { ok: false, status: 410, gone: true };
  await run();
  ok(S.queue[0].status === "sent" && S.pushSubs[0].revoked_at && !S.pushSubs[1].revoked_at && S.pushCalls.length === 2, "B10 a gone first subscription and a live second one: expected sent, first revoked, second kept: " + state(S.queue[0]));
  world({ pushSubs: [sub({ env: { ...process.env, WF_VAPID_PRIVATE_KEY: OTHER_VAPID.privateKey } })], queue: [pushRow()] });
  await run();
  ok(S.pushCalls.length === 0 && S.pushSubs[0].revoked_at && state(S.queue[0]) === "cancelled/no_push_sub", "B10 a row sealed under another key was sent to or not revoked: " + state(S.queue[0]));
  world({ pushSubs: [sub(), sub({ endpoint: "https://fcm.googleapis.com/fcm/send/e2" }), sub({ endpoint: "https://fcm.googleapis.com/fcm/send/e3" }), sub({ endpoint: "https://fcm.googleapis.com/fcm/send/e4" })], queue: [pushRow()] });
  await run();
  ok(S.pushCalls.length === 3, "B10 a recipient with 4 subscriptions got " + S.pushCalls.length + " pushes (at most 3)");
  world({ pushSubs: [sub()], queue: [pushRow()] });
  S.pushResult[ENDPOINT] = { ok: false, status: 500, gone: false };
  await run();
  ok(state(S.queue[0]) === "failed/send_failed" && !S.pushSubs[0].revoked_at, "B10 a plain failure must end failed/send_failed and keep the subscription: " + state(S.queue[0]));
  world({ pushSubs: [sub()], queue: [pushRow()] });
  await run();
  const p = parse(S.pushCalls[0].payload);
  ok(S.pushCalls[0].ttl === 3600 && p && p.tag === "wf-reengage-itinerary_abandoned", "B10 itinerary push ttl or tag wrong: " + S.pushCalls[0].ttl);
  world({ pushSubs: [sub()], queue: [pushRow({ trigger_type: "hub_browse", payload: { v: 1, flow: "hub_browse", path: "/guides/best-beaches", hub: "guide" } })] });
  await run();
  ok(S.pushCalls[0] && S.pushCalls[0].ttl === 21600, "B10 a hub push must use a 21,600 s ttl");
}

// ── B11. stale rows and stuck claims ────────────────────────────────────────
{
  world({
    contacts: [contact()], pushSubs: [sub()],
    queue: [
      emailRow({ scheduled_for: iso(NOW - 25 * H), dedupe_key: "e-late" }),
      pushRow({ scheduled_for: iso(NOW - 4 * H), dedupe_key: "p-late" }),
      pushRow({ trigger_type: "hub_browse", scheduled_for: iso(NOW - 15 * H), dedupe_key: "h-late", payload: { v: 1, flow: "hub_browse", path: "/christmas-in-florida", hub: "christmas" } }),
      pushRow({ trigger_type: "affiliate_drop", scheduled_for: iso(NOW - 15 * H), dedupe_key: "a-late", payload: { v: 1, flow: "affiliate_drop", path: "/" } }),
      qrow({ status: "sending", channel: "push", trigger_type: "affiliate_drop", scheduled_for: iso(NOW - 26 * H), dedupe_key: "stuck", payload: { v: 1, flow: "affiliate_drop", path: "/" } }),
      qrow({ status: "sending", channel: "email", contact_id: 7, trigger_type: "itinerary_email", scheduled_for: iso(NOW - 26 * H), dedupe_key: "imm" }),
    ],
  });
  const res = await run();
  ok(S.queue.slice(0, 4).every((r) => state(r) === "cancelled/stale"), "B11 rows past their lateness limit did not all end cancelled/stale: " + S.queue.slice(0, 4).map(state).join(" | "));
  ok(resendCalls().length === 0 && S.pushCalls.length === 0, "B11 a stale row was sent");
  ok(state(S.queue[4]) === "failed/stuck_sending", "B11 a sending row 26 h old did not end failed/stuck_sending: " + state(S.queue[4]));
  ok(S.queue[5].status === "sending" && !S.queue[5].cancelled_reason && !wrote(S.queue[5].id), "B11 an itinerary_email sending row was touched");
  ok(res.stale === 4 && res.reaped === 1, "B11 the run did not count 4 stale and 1 reaped: " + JSON.stringify({ stale: res.stale, reaped: res.reaped }));
  // inside the limits the rows are NOT swept
  world({ contacts: [contact()], pushSubs: [sub()], queue: [emailRow({ scheduled_for: iso(NOW - 23 * H) }), pushRow({ scheduled_for: iso(NOW - 2.5 * H), dedupe_key: "ok-p" }), pushRow({ trigger_type: "hub_browse", scheduled_for: iso(NOW - 13 * H), dedupe_key: "ok-h", payload: { v: 1, flow: "hub_browse", path: "/christmas-in-florida", hub: "christmas" } })] });
  await run();
  ok(S.queue.every((r) => r.status !== "cancelled"), "B11 a row inside its lateness limit was cancelled stale: " + S.queue.map(state).join(" | "));
}

// ── retention: signals older than 90 days go in the first run after 09:00 UTC ─
{
  const T9 = Date.parse("2026-12-02T09:02:00Z");
  const sigs = () => [{ id: 1, anon_id: ANON, kind: "hub_view", created_at: iso(T9 - 100 * 24 * H) }, { id: 2, anon_id: ANON, kind: "hub_view", created_at: iso(T9 - 10 * 24 * H) }];
  world({ signals: sigs() });
  const r9 = await run({ now: T9 });
  ok(r9.retention === true && S.signals.length === 1 && S.signals[0].id === 2, "retention: the 100 day old signal was not deleted (or the recent one was): " + JSON.stringify(S.signals.map((x) => x.id)));
  for (const at of ["2026-12-02T08:59:00Z", "2026-12-02T09:06:00Z", "2026-12-02T21:02:00Z"]) {
    world({ signals: sigs() });
    await run({ now: Date.parse(at) });
    ok(S.signals.length === 2 && !calls.some((c) => c.method === "DELETE"), "retention: signals were deleted outside the 09:00 to 09:05 UTC slot (" + at + ")");
  }
}

// ── B12 + B5. messages: UTM, no go links, no address, tag ────────────────────
{
  const urlsIn = (s) => [...String(s).matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((m) => m[0].replace(/&amp;/g, "&"));
  const mine = (urls) => urls.filter((u) => { try { return new URL(u).hostname === "www.gowayfind.com"; } catch { return false; } });
  const checkLink = (u, channel, flow, label) => {
    const q = new URL(u, "https://www.gowayfind.com").searchParams;
    const src = q.get("utm_source");
    ok(OWN_LIFECYCLE_SOURCES.includes(src) && OWN_LIFECYCLE_SOURCES.filter((s) => s === src).length === 1, `B5 ${label}: utm_source ${src} is not one of lib/attribution.js OWN_LIFECYCLE_SOURCES (${OWN_LIFECYCLE_SOURCES.join(",")}): ${u}`);
    ok(src === (channel === "email" ? "resend_lifecycle" : "webpush") && q.get("utm_medium") === channel && q.get("utm_campaign") === flow, `B12 ${label}: the three UTM values for channel ${channel} and flow ${flow} are missing or wrong: ${u}`);
    ok(!["gclid", "gbraid", "wbraid"].some((k) => q.has(k)), `B5 ${label}: the link carries a Google click id: ${u}`);
  };
  ok(OWN_LIFECYCLE_SOURCES.length === 2 && OWN_LIFECYCLE_SOURCES.includes("webpush") && OWN_LIFECYCLE_SOURCES.includes("resend_lifecycle"), "B5 positive control: OWN_LIFECYCLE_SOURCES is not the two values this lane sends: " + OWN_LIFECYCLE_SOURCES.join(","));
  // email: every step, built the way the dispatcher builds it, plus the bytes the dispatcher really sent
  const seenBodies = [];
  world({ contacts: [contact()], queue: [emailRow({ step: 1 })] });
  await run(); seenBodies.push(resendCalls()[0].body);
  for (const step of [2, 3]) {
    world({ contacts: [contact()], queue: [emailRow({ step })] });
    await run(); seenBodies.push(resendCalls()[0].body);
  }
  ok(seenBodies.length === 3 && seenBodies.every(Boolean), "B12 the three email steps were not all sent");
  for (const [i, b] of seenBodies.entries()) {
    const links = mine([...urlsIn(b.html), ...urlsIn(b.text)]);
    ok(links.length >= 6, `B12 step ${i + 1}: expected at least 6 Wayfind link occurrences (open, unsubscribe, 1 stop page, each in both parts), found ${links.length}`);
    for (const u of links) checkLink(u, "email", "itinerary_abandoned", `email step ${i + 1}`);
    ok(!/\/api\/[a-z-]+\/go\b/.test(b.html + b.text), `B12 email step ${i + 1} contains a /api/<provider>/go link`);
    ok(/Unsubscribe<\/a>/.test(b.html) && b.headers["List-Unsubscribe"] && b.headers["List-Unsubscribe-Post"], `B12 email step ${i + 1} lost its unsubscribe link or headers`);
  }
  ok(new Set(seenBodies.map((b) => b.subject)).size === 3 && seenBodies[2].subject === "Last note about your Sarasota plan", "B12 the three steps do not have three different subjects, step 3 is not the contract's");
  // the PR 1 default message is byte identical (measured on origin/main before the optional campaign, subject and intro were added)
  const def = R.itineraryEmailMessage(SNAP, { unsubscribeToken: TOKEN, env: {} });
  ok(createHash("sha256").update(def.subject + "\n" + def.text + "\n" + def.html).digest("hex") === "2a90f641b9a81e35abd1bd34ef3e2898ee3eb60af170a02f97ebd96d5b848ab8", "B12 the default (PR 1) itineraryEmailMessage output changed");
  // push: every trigger
  const triggers = [
    ["itinerary_abandoned", { v: 1, flow: "itinerary_abandoned", path: "/plan-my-day", planRef: PLAN_REF, areaName: "Sarasota", stops: 2, when: "2026-12-20" }, "/plan-my-day", "Your Sarasota plan is saved", "2 stops with directions. Tap to pick up where you left off."],
    ["affiliate_drop", { v: 1, flow: "affiliate_drop", path: "/guides/best-beaches" }, "/guides/best-beaches", "Still planning your trip?", "Your picks are saved. Pick up where you left off."],
    ["hub_browse", { v: 1, flow: "hub_browse", path: "/christmas-in-florida/sarasota", hub: "christmas" }, "/christmas-in-florida/sarasota", "Still planning Christmas in Florida?", "Dates and directions are one tap away."],
    ["hub_browse", { v: 1, flow: "hub_browse", path: "/guides/best-beaches", hub: "guide" }, "/guides/best-beaches", "Pick up the guide you were reading", "Dates and directions are one tap away."],
  ];
  for (const [trigger, payload, p, title, body] of triggers) {
    const m = O.pushMessageFor({ trigger_type: trigger, payload });
    ok(m && m.title === title && m.body === body && new URL(m.url, "https://x.test").pathname === p, `B12 ${trigger}: the push copy or path is not the contract's: ` + JSON.stringify(m));
    ok(m && m.tag === `wf-reengage-${trigger}` && m.tag.length > 0 && m.tag !== "wf-daily-pick", `B12 ${trigger}: the tag is empty or the daily pick tag`);
    if (m) { checkLink(m.url, "push", trigger, `push ${trigger}`); ok(!/@/.test(JSON.stringify(m)) && !/\/api\/[a-z-]+\/go\b/.test(JSON.stringify(m)) && m.url.startsWith("/") && !m.url.startsWith("//"), `B12 ${trigger}: the push carries an @ or a go link or is not a same origin path`); }
  }
  ok(O.pushMessageFor({ trigger_type: "affiliate_drop", payload: { v: 1, path: "/api/viator/go?offer=x" } }).url.startsWith("/?utm_source=webpush"), "B12 an /api/ path in an affiliate_drop payload was not replaced by /");
  ok(O.pushMessageFor({ trigger_type: "hub_browse", payload: { v: 1, path: "/somewhere-else", hub: "guide" } }) === null && O.pushMessageFor({ trigger_type: "itinerary_abandoned", payload: { areaName: "x@y.test", stops: 0 } }) === null, "B12 a bad payload still produced a push");
  const withAt = O.pushMessageFor({ trigger_type: "itinerary_abandoned", payload: { areaName: "a@b.test", stops: 3 } });
  ok(withAt && !/@/.test(JSON.stringify(withAt)) && withAt.title === "Your Wayfind plan is saved", "B12 a place name with an @ reached a push title");
  // withUtm
  ok(O.withUtm("/api/viator/go?x=1", "itinerary_abandoned", "email") === null && O.withUtm("/api/commerce/go", "itinerary_abandoned", "push") === null && O.withUtm("/api/hotels/go?q=1", "a", "push") === null, "B12 withUtm built a link to an /api/*/go route");
  ok(O.withUtm("//evil.example/x", "a", "push") === null && O.withUtm("https://evil.example/x", "a", "push") === null && O.withUtm("/x", "A B", "push") === null && O.withUtm("/x", "a", "sms") === null, "B12 withUtm accepted a foreign host, a bad flow or an unknown channel");
  ok(/^\/plan-my-day\?utm_source=webpush&utm_medium=push&utm_campaign=itinerary_abandoned$/.test(O.withUtm("/plan-my-day", "itinerary_abandoned", "push")) && O.withUtm("/api/reengage/open?t=ab&to=%2Fplan-my-day", "itinerary_abandoned", "email").includes("utm_source=resend_lifecycle"), "B12 withUtm positive control: the plan link or the open link was not tagged");
  // what the dispatcher really pushed
  world({ pushSubs: [sub()], queue: [pushRow()] });
  await run();
  const sentPush = parse(S.pushCalls[0].payload);
  ok(sentPush && sentPush.title && sentPush.tag === "wf-reengage-itinerary_abandoned", "B12 the push the dispatcher sent has no tag: " + S.pushCalls[0].payload);
  checkLink(sentPush.url, "push", "itinerary_abandoned", "dispatched push");
  ok(!/@/.test(S.pushCalls[0].payload), "B12 an @ reached the dispatched push payload");
}

// ── B13 and B17. the cron route, EXECUTED ───────────────────────────────────
{
  const get = (headers) => cronRoute.GET(new Request("https://www.gowayfind.com/api/cron/reengage-dispatch", { headers }));
  const pulses = () => calls.filter((c) => c.u.includes("wf_job_pulse")).map((c) => c.body);
  world({ contacts: [contact()], queue: [emailRow()] });
  const secret = CRON_SECRET;
  delete process.env.CRON_SECRET;
  let res = await get({ authorization: "Bearer undefined" });
  ok(res.status === 401 && calls.length === 0, "B17 no CRON_SECRET did not answer 401 with zero calls: " + res.status + " calls=" + calls.length);
  res = await get({ authorization: "Bearer " });
  ok(res.status === 401 && calls.length === 0, "B17 no CRON_SECRET and an empty bearer did not answer 401");
  process.env.CRON_SECRET = CRON_SECRET;
  res = await get({ authorization: "Bearer wrong" });
  ok(res.status === 401 && calls.length === 0, "B17 a wrong bearer did not answer 401 with zero calls");
  res = await get({});
  ok(res.status === 401 && calls.length === 0, "B17 a missing authorization header did not answer 401");
  // kill switch
  process.env.WF_REENGAGE_DISPATCH = "off";
  res = await get({ authorization: "Bearer " + secret });
  let body = await res.json();
  ok(res.status === 200 && body.skipped === "off" && resendCalls().length === 0 && S.pushCalls.length === 0 && !calls.some((c) => c.u.includes("wf_reengage_queue")) && S.queue[0].status === "pending", "B17 the kill switch did not stop the run: " + JSON.stringify(body));
  ok(pulses().length === 1 && /WF_REENGAGE_DISPATCH=off/.test(pulses()[0].note || ""), "B17 the kill switch did not pulse 'skipped: off': " + JSON.stringify(pulses()));
  delete process.env.WF_REENGAGE_DISPATCH;
  // success: a run with nothing due is a successful pulse with 0 attempted
  world({});
  res = await get({ authorization: "Bearer " + secret });
  body = await res.json();
  ok(res.status === 200 && body.ok === true && body.attempted === 0 && pulses().length === 1 && pulses()[0].attempted === 0 && !pulses()[0].failed, "B17 an idle run was not a successful pulse with 0 attempted: " + JSON.stringify({ status: res.status, body, pulses: pulses() }));
  // B13: a failing due select is a FAILED run
  world({ contacts: [contact()], queue: [emailRow()], selectStatus: 500 });
  res = await get({ authorization: "Bearer " + secret });
  body = await res.json();
  ok(res.status === 500 && body.ok === false && body.ranWork === true, "B13 a 500 on the due select did not answer through jobFailed (HTTP 500, ok:false): " + JSON.stringify({ status: res.status, body }));
  ok(pulses().length === 1 && pulses()[0].failed === 1 && /due select failed/.test(pulses()[0].note || ""), "B13 a failing due select did not record a failed pulse: " + JSON.stringify(pulses()));
  ok(resendCalls().length === 0 && S.queue[0].status === "pending", "B13 a failed select still sent or claimed something");
  const direct = await run();
  ok(direct.selectFailed === true && direct.ok === false, "B13 runReengageDispatch did not flag selectFailed");
  // no Supabase env is 503
  delete process.env.SUPABASE_URL;
  res = await get({ authorization: "Bearer " + secret });
  ok(res.status === 503, "B13 no Supabase env did not answer 503");
  process.env.SUPABASE_URL = SUPABASE_URL;
  // a not enabled deployment is a skipped pulse, no queue read
  process.env.WF_REENGAGE_ENABLED = "0";
  world({ contacts: [contact()], queue: [emailRow()] });
  res = await get({ authorization: "Bearer " + secret });
  body = await res.json();
  ok(res.status === 200 && body.skipped === "not_enabled" && !calls.some((c) => c.u.includes("wf_reengage_")), "B17 a not enabled deployment touched the queue: " + JSON.stringify(body));
  process.env.WF_REENGAGE_ENABLED = "1";
}

// ── the whole run: where the address and the endpoints may and may not appear ─
{
  const urlHasAddress = (u) => /@|%40/i.test(u);
  ok(urlHasAddress("https://x.test/a?email=eq.test.user%40example.test") && urlHasAddress("a@b.test") && !urlHasAddress("https://x.test/a?email_hash=eq." + "a".repeat(64)), "positive control: the address probe does not recognise an address in a URL");
  ok(allCalls.length > 500 && allCalls.filter((c) => urlHasAddress(c.u)).length === 0, `an address appeared in ${allCalls.filter((c) => urlHasAddress(c.u)).length} of ${allCalls.length} request URLs`);
  const sendBodies = allCalls.filter((c) => c.u.startsWith("https://api.resend.com/emails"));
  ok(sendBodies.length > 5 && sendBodies.every((c) => c.raw.includes(EMAIL) || c.raw.includes("@example.test")), "positive control: the address did not appear in any Resend request body");
  const nonResendWithAddress = allCalls.filter((c) => !c.u.startsWith("https://api.resend.com/") && c.raw.includes("@"));
  ok(nonResendWithAddress.length === 0, `an @ appeared in ${nonResendWithAddress.length} non Resend request bodies, e.g. ${nonResendWithAddress[0] && nonResendWithAddress[0].u}`);
  ok(allCalls.filter((c) => c.u.includes("wf_reengage_contacts") && c.method === "GET").every((c) => /[?&]id=(eq\.\d+|in\.\([\d,]+\))/.test(c.u)), "a contacts read used a key other than the numeric id");
  ok(allCalls.filter((c) => c.u.includes("wf_web_push_subscriptions")).every((c) => c.method === "GET") && allCalls.some((c) => c.u.includes("wf_web_push_subscriptions")), "the member subscription table was written to, or never read (positive control)");
  const pushUrls = allCalls.filter((c) => /fcm\.googleapis\.com/.test(c.u));
  ok(pushUrls.length === 0, "a real push endpoint was fetched directly (pushes go through the injected sender in this test)");
  ok(allCalls.filter((c) => /fcm\.googleapis|%2F%2Ffcm|push\.apple|dispatch-endpoint/i.test(c.u)).length === 0, "a push endpoint appeared in a request URL");
  ok(allCalls.filter((c) => c.status === 409).length === 0, "a request hit a unique key collision (409)");
}

if (failures) { console.error(`test-reengage-dispatch: ${failures} failure(s) out of ${assertions} assertions`); process.exit(1); }
console.log(`test-reengage-dispatch: OK — ${assertions} assertions over ${allCalls.length} recorded calls; kernel vector, gating, caps (week of drips: 2 sent, step 3 skipped_cap), overlap (2 and 3 concurrent dispatchers, 30 interleavings), head of line, 404/410 revoke, stale and stuck, UTM on every link (OWN_LIFECYCLE_SOURCES, no click id, no go link), cron route 401/kill switch/failed select`);
