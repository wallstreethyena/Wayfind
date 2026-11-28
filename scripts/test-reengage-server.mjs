// scripts/test-reengage-server.mjs — regression lock for the SERVER half of the
// re-engagement feature ("email me this plan"): lib/reengageServer.js,
// app/api/reengage/email, app/api/reengage/unsubscribe, the planRef added to
// app/api/plan-my-day, and the middleware wiring.
//
// Hermetic: no real network, no real Supabase, no real Resend. globalThis.fetch
// is stubbed for the whole run and EVERY call is recorded, so "never sent" and
// "zero database calls" are counted against actual calls, not read off the source.
// Every route and function below is EXECUTED and the RESULT asserted; the one
// place a source check stands in for an execution says so in its message.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let failures = 0;
let assertions = 0;
const ok = (condition, message) => {
  assertions += 1;
  if (!condition) { console.error("test-reengage-server: FAIL — " + message); failures += 1; }
};

// ── environment ─────────────────────────────────────────────────────────────
process.env.SUPABASE_URL = "https://fake-reengage.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role_test_key";
process.env.RESEND_API_KEY = "re_test_key";
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SITE_URL;
delete process.env.NEWSLETTER_POSTAL;
delete process.env.WF_REENGAGE_ENABLED;
delete process.env.WF_REENGAGE_FROM;

const TOKEN = "ab".repeat(32);
const ANON = "123e4567-e89b-42d3-a456-426614174000";
const PLAN_REF = "0123456789abcdef0123456789abcdef";
const EMAIL_IN = "  Test.User@Example.TEST ";
const EMAIL = "test.user@example.test";

// ── fetch stub: records every call ──────────────────────────────────────────
let calls = [];
const allCalls = []; // never reset: the whole-run "no address in any URL" check reads this
let S = {};
function reset(over = {}) {
  calls = [];
  S = { plan: { [PLAN_REF]: null }, cache: {}, contact: null, insertConflict: false, suppressed: false, resendOk: true, queueOk: true, sentRows: [], itinRows: [], capDown: false, unsubRows: null, dbDown: false, ...over };
}
const jsonRes = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const FUTURE = () => new Date(Date.now() + 3600e3).toISOString();
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const method = (init && init.method) || "GET";
  const raw = init && init.body ? String(init.body) : "";
  const rec = { u, method, raw, body: parse(raw), headers: (init && init.headers) || {} };
  calls.push(rec);
  allCalls.push(rec);
  if (u.startsWith("https://api.resend.com/emails")) return S.resendOk ? jsonRes({ id: "em_1" }) : jsonRes({ message: "no" }, 422);
  if (!u.includes("/rest/v1/")) return jsonRes({}, 404);
  if (S.dbDown) return jsonRes({}, 500);
  if (u.includes("/rest/v1/wf_places_cache")) {
    if (method !== "GET") return jsonRes({}, 201);
    const key = decodeURIComponent(u.split("k=eq.")[1].split("&")[0]);
    if (key.startsWith("reengage-plan:")) {
      const snap = S.plan[key.slice("reengage-plan:".length)];
      return jsonRes(snap ? [{ k: key, v: snap, exp: FUTURE(), wrote_at: new Date().toISOString() }] : []);
    }
    return jsonRes(S.cache[key] ? [{ k: key, v: S.cache[key], exp: FUTURE(), wrote_at: new Date().toISOString() }] : []);
  }
  if (u.includes("/rest/v1/wf_reengage_contacts")) {
    if (method === "GET") return jsonRes(S.contact ? [S.contact] : []);
    if (method === "POST") return S.insertConflict ? jsonRes([]) : jsonRes([{ id: 7, status: "subscribed", unsubscribe_token: raw.includes('"unsubscribe_token"') ? parse(raw).unsubscribe_token : TOKEN }], 201);
    if (method === "PATCH" && u.includes("unsubscribe_token=eq.") && u.includes("confirmed_at=is.null")) {
      // confirm: honours its own filters against the stateful contact
      if (S.contact && u.includes("status=eq.subscribed") && S.contact.status === "subscribed" && !S.contact.confirmed_at) S.contact.confirmed_at = parse(raw).confirmed_at;
      return new Response(null, { status: 204 });
    }
    if (method === "PATCH" && u.includes("unsubscribe_token=eq.")) {
      // unsubscribe: a stateful contact is flipped only when the status filter lets it through
      if (S.contact && !S.unsubRows) {
        if (u.includes("status=eq.subscribed") && S.contact.status !== "subscribed") return jsonRes([]);
        S.contact.status = parse(raw).status; S.contact.unsubscribed_at = parse(raw).unsubscribed_at;
        return jsonRes([{ id: S.contact.id, email: EMAIL, anon_id: ANON }]);
      }
      return jsonRes(S.unsubRows || [{ id: 7, email: EMAIL, anon_id: ANON }]);
    }
    if (method === "PATCH") return new Response(null, { status: 204 });
  }
  if (u.includes("/rest/v1/wf_reengage_suppressions")) return method === "GET" ? jsonRes(S.suppressed ? [{ id: 1 }] : []) : jsonRes({}, 201);
  if (u.includes("/rest/v1/wf_reengage_queue")) {
    if (method === "GET" && u.includes("trigger_type=eq.itinerary_email")) {
      if (S.capDown) return jsonRes({}, 500);
      const lim = Number((u.match(/[?&]limit=(\d+)/) || [])[1]) || 1000;
      return jsonRes(S.itinRows.slice(0, lim));
    }
    if (method === "GET") return jsonRes(S.sentRows);
    if (method === "POST") return S.queueOk ? jsonRes({}, 201) : jsonRes({}, 500);
    return new Response(null, { status: 204 });
  }
  return jsonRes({}, 404);
};
const only = (pred) => calls.filter(pred);
const resendCalls = () => only((c) => c.u.startsWith("https://api.resend.com/"));
const queuePosts = () => only((c) => c.method === "POST" && c.u.includes("/rest/v1/wf_reengage_queue"));
const dbCalls = () => only((c) => c.u.includes("/rest/v1/"));
const post = (route, body, headers = {}) => route.POST(new Request("https://www.gowayfind.com/api/reengage/email", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }));

// ── load the real modules (jsxLoad stubs next/cache and friends) ────────────
const lib = await loadComponent(path.join(ROOT, "lib/reengageServer.js"), ROOT);
const nl = await loadComponent(path.join(ROOT, "lib/newsletter.js"), ROOT);
const emailRoute = await loadComponent(path.join(ROOT, "app/api/reengage/email/route.js"), ROOT);
const unsubRoute = await loadComponent(path.join(ROOT, "app/api/reengage/unsubscribe/route.js"), ROOT);

// ── the plan the server built ───────────────────────────────────────────────
const NAME1 = 'Ringling <script>alert(1)</script> & "Museum"';
const SNAP = {
  area: "sarasota", areaName: "Sarasota", when: "2026-11-28",
  days: [{ label: "Day 1", stops: [
    { id: "p1", name: NAME1, address: "5401 Bay Shore Rd, Sarasota, FL", lat: 27.3834, lng: -82.5593, url: "/places/ChIJabc" },
    { id: "p2", name: "Siesta Beach", city: "Siesta Key" },
  ] }],
};

// ── 1. constants, normalizing, the snapshot rebuild ─────────────────────────
ok(lib.CONSENT_VERSION === "trip-v1", "consent version is not trip-v1");
ok(lib.CONSENT_TEXT === "Email me this plan, plus up to 3 follow ups for this trip with directions and backup picks. Unsubscribe anytime.", "consent text drifted from the contract");
ok(lib.normalizeEmail(EMAIL_IN) === EMAIL, "normalizeEmail did not trim and lowercase");
ok(lib.isValidEmail(EMAIL) && !lib.isValidEmail("nope") && !lib.isValidEmail("a b@c.com"), "isValidEmail wrong");
{
  const dirty = { ...SNAP, secret: "SECRET_FIELD", days: [{ label: "Day 1", extra: "SECRET_DAY", stops: [
    { ...SNAP.days[0].stops[0], tracking: "SECRET_STOP" },
    { id: "p3", name: "Evil Stop", url: "https://evil.example/x" },
    { id: "p4", name: "No Coords", lat: 0, lng: 0 },
    { name: "No Id" },
  ] }] };
  const clean = lib.sanitizePlan(dirty);
  const dump = JSON.stringify(clean);
  ok(clean && !/SECRET_/.test(dump), "sanitizePlan let an unknown field through");
  ok(!/evil\.example/.test(dump) && clean.days[0].stops.find((s) => s.id === "p3").url === undefined, "sanitizePlan kept a non Wayfind link");
  ok(clean.days[0].stops.length === 3 && clean.days[0].stops.find((s) => s.id === "p4").lat === undefined, "sanitizePlan kept a 0,0 coordinate or a stop with no id");
  ok(lib.sanitizePlan({ days: [{ stops: [] }] }) === null && lib.sanitizePlan(null) === null && lib.sanitizePlan({ days: "x" }) === null, "sanitizePlan did not return null for an empty plan");
  const big = { area: "x", areaName: "X", days: Array.from({ length: 12 }, (_, d) => ({ label: "D" + d, stops: Array.from({ length: 20 }, (_, i) => ({ id: `s${d}-${i}`, name: "N".repeat(100), address: "A".repeat(160), city: "C".repeat(60), lat: 1.5, lng: 2.5, url: "/places/" + "z".repeat(150) })) })) };
  const bigClean = lib.sanitizePlan(big);
  ok(bigClean && JSON.stringify(bigClean).length <= 12000, "sanitizePlan did not keep the plan inside the queue payload budget");
}

// ── 2. the email: built only from the snapshot, escaped, opt out visible ────
const msg = lib.itineraryEmailMessage(SNAP, { unsubscribeToken: TOKEN, env: {} });
ok(msg && msg.subject === "Your Sarasota plan", "email subject wrong: " + (msg && msg.subject));
{
  ok(msg.html.includes("&lt;script&gt;alert(1)&lt;/script&gt;") && !/<script/i.test(msg.html), "HTML email did not escape a place name");
  ok(msg.html.includes("&amp;") && msg.html.includes("&quot;Museum&quot;"), "HTML email did not escape & and quotes in a place name");
  const hrefs = [...msg.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  const mine = hrefs.filter((h) => { try { return new URL(h).hostname === "www.gowayfind.com"; } catch { return false; } });
  ok(mine.length >= 3, "expected at least 3 Wayfind links (place, open, unsubscribe), found " + mine.length);
  ok(mine.every((h) => { const q = new URL(h).searchParams; return q.get("utm_source") === "resend_lifecycle" && q.get("utm_medium") === "email" && q.get("utm_campaign") === "itinerary_email"; }), "a Wayfind link in the email lacks the three utm tags: " + mine.join(" | "));
  const open = mine.map((h) => new URL(h)).find((u) => u.pathname === "/api/reengage/open");
  ok(open && open.searchParams.get("t") === TOKEN && open.searchParams.get("to") === "/plan-my-day" && />Open my plan<\/a>/.test(msg.html) && /Open my plan: https:\/\/www\.gowayfind\.com\/api\/reengage\/open\?t=/.test(msg.text), "the primary \"Open my plan\" link is missing, does not go through /api/reengage/open, or lacks the token or a plan-my-day target");
  const unsub = mine.map((h) => new URL(h)).find((u) => u.pathname === "/api/reengage/unsubscribe");
  ok(unsub && unsub.searchParams.get("t") === TOKEN, "visible unsubscribe link missing or carries the wrong token");
  ok(/Unsubscribe<\/a>/.test(msg.html) && /Unsubscribe: https:\/\/www\.gowayfind\.com\/api\/reengage\/unsubscribe\?t=/.test(msg.text), "unsubscribe link is not visible in both parts");
  const textUrls = [...msg.text.matchAll(/https?:\/\/\S+/g)].map((m) => m[0]);
  ok(textUrls.filter((u) => u.includes("gowayfind.com")).every((u) => new URL(u).searchParams.get("utm_source") === "resend_lifecycle"), "a Wayfind link in the text part lacks utm tags");
  ok(msg.html.includes("destination=27.3834,-82.5593") && msg.text.includes("https://www.google.com/maps/dir/?api=1&destination=27.3834,-82.5593"), "directions link for a stop with coordinates wrong");
  ok(msg.text.includes("destination=Siesta%20Beach%2C%20Siesta%20Key"), "directions link for a stop without coordinates did not fall back to the encoded name and place");
  ok(msg.text.includes("5401 Bay Shore Rd, Sarasota, FL") && msg.text.includes("Siesta Key"), "street address or city missing from the email");
  ok(msg.text.includes(nl.NEWSLETTER_POSTAL) && msg.html.includes(nl.NEWSLETTER_POSTAL), "postal line missing");
  const withEnv = lib.itineraryEmailMessage(SNAP, { unsubscribeToken: TOKEN, env: { NEWSLETTER_POSTAL: "1 Test Way, Tampa, FL 33601" } });
  ok(withEnv.text.includes("1 Test Way, Tampa, FL 33601") && !withEnv.text.includes(nl.NEWSLETTER_POSTAL), "NEWSLETTER_POSTAL env did not override the postal line");
  ok(!/[–—]/.test(msg.text) && !/\s-\s/.test(msg.text), "email text carries a dash used as punctuation");
}
{
  // Nothing outside the snapshot reaches the message.
  const dirty = { ...SNAP, secret: "SECRET_FIELD", days: [{ label: "Day 1", extra: "SECRET_DAY", stops: [{ ...SNAP.days[0].stops[0], tracking: "SECRET_STOP" }, { id: "p3", name: "Evil Stop", url: "https://evil.example/x" }] }] };
  const m = lib.itineraryEmailMessage(dirty, { unsubscribeToken: TOKEN, env: {} });
  ok(m && !/SECRET_|evil\.example/.test(m.text + m.html), "a field outside the snapshot reached the email");
  const named = [...m.text.matchAll(/^\d+\. (.+)$/gm)].map((x) => x[1]);
  ok(named.join("|") === NAME1 + "|Evil Stop", "email lists a place that is not in the snapshot: " + JSON.stringify(named));
  ok(lib.itineraryEmailMessage(SNAP, { unsubscribeToken: "short", env: {} }) === null, "a message was built without a valid unsubscribe token");
  ok(lib.itineraryEmailMessage({ days: [] }, { unsubscribeToken: TOKEN, env: {} }) === null, "a message was built for an empty plan");
}

// ── 3. the Resend call ──────────────────────────────────────────────────────
{
  reset();
  const sendArgs = { to: EMAIL_IN, plan: SNAP, unsubscribeToken: TOKEN, planRef: PLAN_REF };
  const r1 = await lib.sendItineraryEmail(sendArgs, { env: { RESEND_API_KEY: "re_k" }, fetchImpl: globalThis.fetch, report: () => {} });
  const c = resendCalls();
  ok(r1.sent === true && r1.id === "em_1" && c.length === 1, "send did not make exactly one Resend call: " + JSON.stringify(r1) + " calls=" + c.length);
  const b = c[0] && c[0].body;
  ok(b && b.from === "Wayfind <trips@gowayfind.com>" && b.to.length === 1 && b.to[0] === EMAIL, "from/to wrong: " + JSON.stringify(b && { from: b.from, to: b.to }));
  ok(b && b.headers["List-Unsubscribe"] === `<https://www.gowayfind.com/api/reengage/unsubscribe?t=${TOKEN}>` && b.headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click", "List-Unsubscribe headers wrong: " + JSON.stringify(b && b.headers));
  ok(c[0] && c[0].headers.Authorization === "Bearer re_k" && /^reengage\/itinerary\/[a-f0-9]{40}$/.test(c[0].headers["Idempotency-Key"]), "auth or idempotency header wrong");
  ok(b && !JSON.stringify(b).includes("SECRET"), "the Resend body carried a field outside the snapshot");
  reset();
  await lib.sendItineraryEmail(sendArgs, { env: { RESEND_API_KEY: "re_k" }, fetchImpl: globalThis.fetch, report: () => {} });
  const idemSame = resendCalls()[0].headers["Idempotency-Key"];
  reset();
  await lib.sendItineraryEmail({ ...sendArgs, planRef: "f".repeat(32) }, { env: { RESEND_API_KEY: "re_k" }, fetchImpl: globalThis.fetch, report: () => {} });
  const idemOther = resendCalls()[0].headers["Idempotency-Key"];
  ok(idemSame && idemOther && idemSame !== idemOther, "idempotency key did not change with the plan");
  reset();
  const rf = await lib.sendItineraryEmail(sendArgs, { env: { RESEND_API_KEY: "re_k", WF_REENGAGE_FROM: "Wayfind <x@gowayfind.com>" }, fetchImpl: globalThis.fetch, report: () => {} });
  ok(rf.sent && resendCalls()[0].body.from === "Wayfind <x@gowayfind.com>", "WF_REENGAGE_FROM did not override the sender");
  reset();
  const none = await lib.sendItineraryEmail(sendArgs, { env: {}, fetchImpl: globalThis.fetch, report: () => {} });
  ok(none.sent === false && none.reason === "unconfigured" && calls.length === 0, "send ran without RESEND_API_KEY");
  reset({ resendOk: false });
  const bad = await lib.sendItineraryEmail(sendArgs, { env: { RESEND_API_KEY: "re_k" }, fetchImpl: globalThis.fetch, report: () => {} });
  ok(bad.sent === false && bad.reason === "send_failed", "a refused Resend call did not report send_failed");
}

// ── 4. the drip: exact offsets, idempotent insert ───────────────────────────
{
  const t0 = Date.UTC(2026, 10, 28, 12, 0, 0);
  const rows = lib.dripSchedule(t0);
  ok(rows.length === 3 && rows.map((r) => r.step).join() === "1,2,3", "dripSchedule is not 3 steps");
  ok(rows.map((r) => Date.parse(r.scheduled_for) - t0).join() === [2, 24, 72].map((h) => h * 3600e3).join(), "dripSchedule offsets are not exactly +2h, +24h, +72h");
  ok(lib.dripSchedule(new Date(t0).toISOString())[0].scheduled_for === rows[0].scheduled_for && lib.dripSchedule(new Date(t0))[2].scheduled_for === rows[2].scheduled_for, "dripSchedule disagrees across Date/ISO/ms input");
  reset();
  const q = await lib.enqueueDrip({ anonId: ANON, contactId: 7, planRef: PLAN_REF, plan: SNAP }, { fetchImpl: globalThis.fetch, now: t0 });
  const p = queuePosts();
  ok(q.ok && q.rows === 3 && p.length === 1, "enqueueDrip did not make exactly one insert of 3 rows");
  const c = p[0];
  ok(c && c.u.includes("on_conflict=contact_id,trigger_type,channel,step,dedupe_key") && !c.u.includes("anon_id,trigger_type") && /resolution=ignore-duplicates/.test(c.headers.Prefer), "enqueueDrip insert is not idempotent PER CONTACT (on_conflict must name contact_id, with ignore-duplicates): " + (c && c.u));
  ok(c && c.body.length === 3 && c.body.every((r) => r.trigger_type === "itinerary_abandoned" && r.channel === "email" && r.status === "pending" && r.dedupe_key === PLAN_REF && r.anon_id === ANON && r.contact_id === 7 && r.payload.planRef === PLAN_REF && r.payload.plan.days[0].stops[0].id === "p1"), "queue rows have the wrong shape");
  ok(c && c.body.map((r) => r.step).join() === "1,2,3" && c.body.map((r) => Date.parse(r.scheduled_for) - t0).join() === [2, 24, 72].map((h) => h * 3600e3).join(), "queue rows have the wrong steps or times");
  ok(c && c.body.every((r) => Buffer.byteLength(JSON.stringify(r.payload)) <= 16000), "queue payload exceeds the table's 16000 byte check");
  reset();
  await lib.enqueueDrip({ anonId: ANON, contactId: null, planRef: PLAN_REF, plan: SNAP }, { fetchImpl: globalThis.fetch, now: t0 });
  ok(queuePosts().length === 1 && queuePosts()[0].u.includes("on_conflict=anon_id,trigger_type,channel,step,dedupe_key") && queuePosts()[0].body.every((r) => r.contact_id === null), "with no contact the drip did not fall back to the anon key");
  reset();
  const badRef = await lib.enqueueDrip({ anonId: ANON, contactId: 7, planRef: "nope", plan: SNAP }, { fetchImpl: globalThis.fetch });
  ok(!badRef.ok && calls.length === 0, "enqueueDrip ran with a bad plan reference");
}

// ── 5. the 7 day cap ────────────────────────────────────────────────────────
{
  reset({ sentRows: [{ id: 1 }] });
  ok(await lib.withinWeeklyCap(ANON, "email", { contactId: 7, max: 2, fetchImpl: globalThis.fetch }) === true, "1 sent in 7 days should still be within the cap of 2");
  const u = calls[0] && calls[0].u;
  ok(u && u.includes("contact_id=eq.7") && !u.includes("anon_id=") && u.includes("trigger_type=neq.itinerary_email") && u.includes("channel=eq.email") && u.includes("status=eq.sent") && u.includes("sent_at=gte.") && u.includes("limit=2"), "the email cap query does not count this CONTACT's sent follow ups in the window: " + u);
  reset({ sentRows: [{ id: 1 }, { id: 2 }] });
  ok(await lib.withinWeeklyCap(ANON, "email", { contactId: 7, max: 2, fetchImpl: globalThis.fetch }) === false, "2 sent in 7 days should be AT the cap of 2");
  reset();
  ok(await lib.withinWeeklyCap(ANON, "email", { fetchImpl: globalThis.fetch }) === false && calls.length === 0, "the email cap ran without a contact id (a GPC visitor's anon id is new every request, so it would always pass)");
  reset({ sentRows: [] });
  ok(await lib.withinWeeklyCap(ANON, "push", { max: 2, fetchImpl: globalThis.fetch }) === true && calls[0].u.includes("channel=eq.push") && calls[0].u.includes(`anon_id=eq.${ANON}`), "0 sent should be within the cap, scoped to the channel asked (push counts by anon id)");
  reset({ dbDown: true });
  ok(await lib.withinWeeklyCap(ANON, "email", { contactId: 7, max: 2, fetchImpl: globalThis.fetch }) === false, "the cap must fail closed on a read error");
  reset();
  ok(await lib.withinWeeklyCap("not-a-uuid", "push", { fetchImpl: globalThis.fetch }) === false && await lib.withinWeeklyCap(ANON, "sms", { fetchImpl: globalThis.fetch }) === false && calls.length === 0, "the cap ran for a bad anon id or channel");
}

// ── 6. cancelling pending rows ──────────────────────────────────────────────
{
  reset();
  await lib.cancelPendingFor(ANON, "converted", { fetchImpl: globalThis.fetch });
  const a = calls[0];
  ok(a && a.method === "PATCH" && a.u.includes(`anon_id=eq.${ANON}`) && a.u.includes("status=eq.pending") && a.body.status === "suppressed_converted" && a.body.cancelled_reason === "converted", "converted did not mark pending rows suppressed_converted");
  reset();
  await lib.cancelPendingFor(ANON, "unsubscribed", { contactId: 9, fetchImpl: globalThis.fetch });
  const b = calls[0];
  ok(b && b.u.includes("contact_id=eq.9") && !b.u.includes("anon_id=") && b.body.status === "cancelled" && b.body.cancelled_reason === "unsubscribed", "contact scoped cancel wrong");
  reset();
  const bad = await lib.cancelPendingFor("nope", "x", { fetchImpl: globalThis.fetch });
  ok(bad.ok === false && calls.length === 0, "cancel ran with no valid target (it would have cancelled everyone)");
}

// ── 7. the snapshot of a plan-my-day answer ─────────────────────────────────
const REAL_OUT = {
  ok: true, source: "wayfind", pool: [], weather: null,
  itinerary: { v: 1, title: "T", city: "Sarasota", state: "FL", startDate: "2026-11-28", endDate: "2026-11-28", days: [
    { date: "2026-11-28", label: "Saturday", stops: [
      { id: "p1", name: "Ringling Museum", kind: "place", city: "Sarasota", lat: 27.3834, lng: -82.5593, photo: null, href: "/places/ChIJabc", ticket: { href: "/api/commerce/go?x=1", label: "Get Tickets" }, why: "w" },
      { id: "p2", name: "Siesta Beach", kind: "place", city: "Siesta Key", lat: null, lng: null, href: null },
    ] },
  ] },
};
{
  const snap = lib.planSnapshot(REAL_OUT);
  ok(snap && snap.area === "sarasota" && snap.areaName === "Sarasota" && snap.when === "2026-11-28" && snap.days.length === 1 && snap.days[0].label === "Saturday", "planSnapshot header wrong: " + JSON.stringify(snap));
  const s0 = snap.days[0].stops;
  ok(s0[0].id === "p1" && s0[0].name === "Ringling Museum" && s0[0].lat === 27.3834 && s0[0].lng === -82.5593 && s0[0].url === "/places/ChIJabc" && s0[0].city === "Sarasota", "planSnapshot stop 1 wrong");
  ok(s0[1].lat === undefined && s0[1].url === undefined && !("ticket" in s0[0]) && !("photo" in s0[0]) && !("why" in s0[0]), "planSnapshot kept null coordinates, null links or fields outside the snapshot shape");
  ok(lib.planSnapshot({ ok: false }) === null && lib.planSnapshot({ ok: true, itinerary: { days: [] } }) === null, "planSnapshot built a snapshot with no stops");
}

// ── 8. the email route ──────────────────────────────────────────────────────
const ANON_RX_TEST = (v) => /^[0-9a-f-]{36}$/.test(String(v));
const GOOD = { email: EMAIL_IN, consent: true, planRef: PLAN_REF, anonId: ANON, page: "/plan-my-day" };
const bodies = [];
const run = async (body, headers) => { const r = await post(emailRoute, body, headers); const text = await r.clone().text(); bodies.push(text); return { r, text, json: parse(text) }; };
{
  // gate: off unless WF_REENGAGE_ENABLED is exactly "1" and every env is present
  reset({ plan: { [PLAN_REF]: SNAP } });
  let x = await run(GOOD);
  ok(x.r.status === 503 && x.json.code === "unconfigured" && x.json.ok === false && calls.length === 0, "route answered without WF_REENGAGE_ENABLED, or touched the network");
  process.env.WF_REENGAGE_ENABLED = "true";
  x = await run(GOOD);
  ok(x.r.status === 503 && calls.length === 0, "a non \"1\" WF_REENGAGE_ENABLED turned the route on");
  process.env.WF_REENGAGE_ENABLED = "1";
  delete process.env.RESEND_API_KEY;
  x = await run(GOOD);
  ok(x.r.status === 503 && x.json.code === "unconfigured" && calls.length === 0, "route ran without RESEND_API_KEY");
  process.env.RESEND_API_KEY = "re_test_key";
  delete process.env.SUPABASE_URL;
  x = await run(GOOD);
  ok(x.r.status === 503 && x.json.code === "unconfigured" && calls.length === 0, "route ran without Supabase env");
  process.env.SUPABASE_URL = "https://fake-reengage.supabase.test";

  // validation, before any store is touched
  reset({ plan: { [PLAN_REF]: SNAP } });
  x = await run({ ...GOOD, consent: undefined });
  ok(x.r.status === 400 && x.json.code === "consent" && calls.length === 0, "missing consent was not a 400 consent with zero calls");
  x = await run({ ...GOOD, consent: "true" });
  ok(x.r.status === 400 && x.json.code === "consent", "a string consent counted as consent");
  x = await run({ ...GOOD, email: "nope" });
  ok(x.r.status === 400 && x.json.code === "invalid", "a bad address was not rejected");
  x = await run({ ...GOOD, planRef: "xyz" });
  ok(x.r.status === 400 && x.json.code === "invalid", "a bad plan reference was not rejected");
  x = await run({ ...GOOD, anonId: "'; drop table" });
  ok(x.r.status === 400 && x.json.code === "invalid", "a bad anonymous id was not rejected");
  x = await run({ ...GOOD, email: "nope", anonId: undefined });
  ok(x.r.status === 400 && x.json.code === "invalid", "an absent anon id bypassed email validation");
  x = await run("not json");
  ok(x.r.status === 400 && x.json.code === "invalid", "a body that is not JSON was not rejected");
  ok(calls.length === 0, "validation failures touched the network");

  // plan expired: no contact is written, nothing is sent
  reset();
  x = await run({ ...GOOD, planRef: "e".repeat(32) });
  ok(x.r.status === 404 && x.json.code === "plan_expired", "an unknown plan reference was not a 404 plan_expired");
  ok(resendCalls().length === 0 && only((c) => c.u.includes("wf_reengage_")).length === 0, "an expired plan still wrote a contact or sent mail");

  // happy path, new contact
  reset({ plan: { [PLAN_REF]: SNAP } });
  x = await run(GOOD);
  ok(x.r.status === 200 && JSON.stringify(x.json) === '{"ok":true}', "happy path did not answer exactly {ok:true}: " + x.text);
  ok(resendCalls().length === 1, "happy path made " + resendCalls().length + " Resend calls");
  const dripPost = queuePosts().find((c) => c.body && c.body.length === 3);
  const sentPost = queuePosts().find((c) => c.body && c.body.length === 1);
  ok(queuePosts().length === 2 && dripPost && dripPost.body.every((r) => r.contact_id === 7 && r.trigger_type === "itinerary_abandoned"), "happy path did not queue 3 drip rows for the contact (and exactly one more queue write)");
  ok(sentPost && sentPost.body[0].trigger_type === "itinerary_email" && sentPost.body[0].channel === "email" && sentPost.body[0].step === 0 && sentPost.body[0].status === "sent" && typeof sentPost.body[0].sent_at === "string" && sentPost.body[0].resend_email_id === "em_1" && sentPost.body[0].dedupe_key === PLAN_REF && sentPost.body[0].contact_id === 7 && sentPost.u.includes("on_conflict=contact_id,trigger_type,channel,step,dedupe_key"), "the immediate send left no itinerary_email 'sent' queue row for the contact: " + JSON.stringify(sentPost && sentPost.body));
  const ins = only((c) => c.method === "POST" && c.u.includes("wf_reengage_contacts"))[0];
  ok(ins && ins.body.email === EMAIL && ins.body.status === "subscribed" && ins.body.consent_version === "trip-v1" && ins.body.consent_text === lib.CONSENT_TEXT && ins.body.consent_page === "/plan-my-day" && ins.body.anon_id === ANON && /^[a-f0-9]{64}$/.test(ins.body.unsubscribe_token), "contact row missing the consent or token: " + JSON.stringify(ins && ins.body));
  const sent = resendCalls()[0].body;
  ok(sent.to[0] === EMAIL && sent.headers["List-Unsubscribe"].includes(ins.body.unsubscribe_token) && sent.html.includes("Ringling") && sent.subject === "Your Sarasota plan", "the email did not come from the stored snapshot and the contact's own token");

  // order: the email goes out before the drip is queued
  const iR = calls.findIndex((c) => c.u.startsWith("https://api.resend.com/"));
  const iQ = calls.findIndex((c) => c.method === "POST" && c.u.includes("wf_reengage_queue"));
  const iD = calls.findIndex((c) => c.method === "POST" && c.u.includes("wf_reengage_queue") && c.body && c.body.length === 3);
  ok(iR > -1 && iQ > iR && iD > iQ, "the send row or the drip was queued out of order (send, then its row, then the drip)");
  ok(calls.findIndex((c) => c.u.includes("trigger_type=eq.itinerary_email")) > -1 && calls.findIndex((c) => c.u.includes("trigger_type=eq.itinerary_email")) < iR, "the per recipient cap was not read before the email was sent");
  ok(!calls.some((c) => c.u.includes("wf_reengage_contacts") && c.method === "GET" && c.u.includes("email=eq")) && calls.some((c) => c.u.includes("wf_reengage_contacts") && c.u.includes(`email_hash=eq.${lib.emailHash(EMAIL)}`)), "the contact was not looked up by email_hash alone");
  ok(ins && ins.body.email_hash === lib.emailHash(EMAIL) && ins.u.includes("on_conflict=email_hash"), "the contact insert is not keyed and conflicted on email_hash");

  // an existing contact: its consent record is NEVER rewritten (no PATCH at all), no second insert, token kept
  reset({ plan: { [PLAN_REF]: SNAP }, contact: { id: 7, status: "subscribed", unsubscribe_token: TOKEN } });
  x = await run({ ...GOOD, anonId: "00000000-0000-4000-8000-000000000001", page: "/somewhere-else" });
  ok(x.r.status === 200 && resendCalls().length === 1 && only((c) => c.method === "PATCH").length === 0 && only((c) => c.method === "POST" && c.u.includes("wf_reengage_contacts")).length === 0, "an existing contact was re-inserted, or a later request PATCHed its consent fields (" + only((c) => c.method === "PATCH").length + " PATCH calls)");
  ok(resendCalls()[0].body.headers["List-Unsubscribe"].includes(TOKEN), "an existing contact's unsubscribe token changed");

  // a parallel insert won the race: the route reads the winner and carries on
  reset({ plan: { [PLAN_REF]: SNAP }, insertConflict: true });
  S.contact = null;
  let reads = 0;
  const baseFetch = globalThis.fetch;
  globalThis.fetch = async (u, i) => { const m = (i && i.method) || "GET"; if (m === "GET" && String(u).includes("wf_reengage_contacts")) { reads += 1; if (reads === 2) S.contact = { id: 8, status: "subscribed", unsubscribe_token: TOKEN }; } return baseFetch(u, i); };
  x = await run(GOOD);
  globalThis.fetch = baseFetch;
  ok(x.r.status === 200 && reads === 2 && resendCalls().length === 1, "a lost insert race did not fall back to reading the existing row");

  // opted out: still {ok:true}, zero Resend calls, zero drip rows
  for (const status of ["unsubscribed", "bounced", "complained"]) {
    reset({ plan: { [PLAN_REF]: SNAP }, contact: { id: 7, status, unsubscribe_token: TOKEN } });
    x = await run(GOOD);
    ok(x.r.status === 200 && JSON.stringify(x.json) === '{"ok":true}', status + " contact did not get {ok:true}");
    ok(resendCalls().length === 0 && queuePosts().length === 0, status + " contact was emailed or queued");
    ok(only((c) => c.method === "PATCH").length === 0 && only((c) => c.method === "POST" && c.u.includes("wf_reengage_contacts")).length === 0 && S.contact.status === status, status + " contact was rewritten by someone asking for a plan");
  }
  reset({ plan: { [PLAN_REF]: SNAP }, contact: { id: 7, status: "subscribed", unsubscribe_token: TOKEN }, suppressed: true });
  x = await run(GOOD);
  ok(x.r.status === 200 && x.text === '{"ok":true}' && resendCalls().length === 0 && queuePosts().length === 0, "a suppressed address was emailed or queued");

  // per recipient cap: 3 immediate emails a day, the 4th is {ok:true} and nothing else
  reset({ plan: { [PLAN_REF]: SNAP }, contact: { id: 7, status: "subscribed", unsubscribe_token: TOKEN }, itinRows: [{ id: 1 }, { id: 2 }, { id: 3 }] });
  x = await run(GOOD);
  ok(x.r.status === 200 && x.text === '{"ok":true}' && resendCalls().length === 0 && queuePosts().length === 0, "the 4th itinerary email in 24 hours was sent or queued (" + resendCalls().length + " Resend calls)");
  const capQ = calls.find((c) => c.u.includes("trigger_type=eq.itinerary_email"));
  ok(capQ && capQ.u.includes("contact_id=eq.7") && capQ.u.includes("status=eq.sent") && capQ.u.includes("channel=eq.email") && /sent_at=gte\.[^&]+/.test(capQ.u) && capQ.u.includes("limit=3"), "the daily cap did not count this contact's sent itinerary emails in the window: " + (capQ && capQ.u));
  const since = capQ ? Date.parse(decodeURIComponent(capQ.u.match(/sent_at=gte\.([^&]+)/)[1])) : 0;
  ok(Math.abs((Date.now() - since) - 24 * 3600e3) < 60e3, "the daily cap window is not 24 hours");
  reset({ plan: { [PLAN_REF]: SNAP }, contact: { id: 7, status: "subscribed", unsubscribe_token: TOKEN }, itinRows: [{ id: 1 }, { id: 2 }] });
  x = await run(GOOD);
  ok(x.r.status === 200 && resendCalls().length === 1, "the 3rd itinerary email in 24 hours was refused (cap is 3)");
  reset({ plan: { [PLAN_REF]: SNAP }, contact: { id: 7, status: "subscribed", unsubscribe_token: TOKEN }, capDown: true });
  x = await run(GOOD);
  ok(x.r.status === 503 && resendCalls().length === 0, "a failed cap read still sent mail (it must fail closed)");

  // GPC visitors (no anonId): a fresh server id each request, so dedupe must be per CONTACT
  reset({ plan: { [PLAN_REF]: SNAP } });
  await run({ ...GOOD, anonId: undefined });
  const gpc1 = queuePosts().find((c) => c.body && c.body.length === 3);
  reset({ plan: { [PLAN_REF]: SNAP }, contact: { id: 7, status: "subscribed", unsubscribe_token: TOKEN } });
  await run({ ...GOOD, anonId: undefined });
  const gpc2 = queuePosts().find((c) => c.body && c.body.length === 3);
  const ck = (c) => c.body.map((r) => [r.contact_id, r.trigger_type, r.channel, r.step, r.dedupe_key].join("|")).join(",");
  ok(gpc1 && gpc2 && gpc1.body[0].anon_id !== gpc2.body[0].anon_id && ANON_RX_TEST(gpc1.body[0].anon_id), "positive control: two GPC requests did not get different server ids, so the dedupe check below proves nothing");
  ok(gpc1 && gpc2 && ck(gpc1) === ck(gpc2) && gpc1.u.includes("on_conflict=contact_id,trigger_type,channel,step,dedupe_key") && gpc2.u.includes("on_conflict=contact_id,trigger_type,channel,step,dedupe_key"), "two GPC requests for one address and plan would queue duplicate drips: the conflict key is not the contact's");

  // failures are reported, not swallowed, and nothing is queued for a mail that never left
  reset({ plan: { [PLAN_REF]: SNAP }, resendOk: false });
  x = await run(GOOD);
  ok(x.r.status === 503 && x.json.code === "unavailable" && queuePosts().length === 0, "a refused send was not a 503 with no drip rows");
  reset({ plan: { [PLAN_REF]: SNAP }, dbDown: true });
  x = await run(GOOD);
  ok(x.r.status === 503 && resendCalls().length === 0, "a database failure still sent mail");
  reset({ plan: { [PLAN_REF]: SNAP }, queueOk: false });
  x = await run(GOOD);
  ok(x.r.status === 200 && resendCalls().length === 1, "a drip queue failure should not undo an email that was already sent");

  // a synthetic request neither writes nor sends
  reset({ plan: { [PLAN_REF]: SNAP } });
  x = await run(GOOD, { "x-wf-synthetic": "1" });
  ok(x.r.status === 200 && x.text === '{"ok":true}' && calls.length === 0, "a synthetic request touched the network");

  // nothing the route said ever carried the address
  ok(bodies.length > 20 && bodies.every((t) => !/example\.test|test\.user/i.test(t)), "a response body echoed the email address (" + bodies.length + " bodies checked)");
  ok(bodies.some((t) => t === '{"ok":true}'), "positive control: no body was a plain success, so the echo check proved nothing");
}

// ── 9. the unsubscribe route ────────────────────────────────────────────────
const U = (m, t) => new Request("https://www.gowayfind.com/api/reengage/unsubscribe" + (t === undefined ? "" : "?t=" + t), { method: m, ...(m === "POST" ? { body: "List-Unsubscribe=One-Click", headers: { "content-type": "application/x-www-form-urlencoded" } } : {}) });
// The confirm page's button: a plain form post carrying via=page.
const P = (t) => new Request("https://www.gowayfind.com/api/reengage/unsubscribe?t=" + t, { method: "POST", body: "via=page", headers: { "content-type": "application/x-www-form-urlencoded" } });
{
  reset();
  let r = await unsubRoute.GET(U("GET", "not-a-token"));
  ok(r.status === 303 && r.headers.get("location") === "https://www.gowayfind.com/unsubscribe?list=trip&done=invalid" && calls.length === 0, "GET with a bad token made a database call or did not redirect to done=invalid");
  r = await unsubRoute.GET(U("GET"));
  ok(r.status === 303 && calls.length === 0, "GET with no token made a database call");
  r = await unsubRoute.GET(U("GET", "'; drop table--"));
  ok(r.status === 303 && calls.length === 0, "GET with an injection shaped token made a database call");
  r = await unsubRoute.POST(U("POST", "short"));
  ok(r.status === 400 && calls.length === 0, "POST with a bad token made a database call");

  // GET is the visible link: mail scanners pre-open it, so it must change NOTHING.
  reset();
  r = await unsubRoute.GET(U("GET", TOKEN));
  ok(r.status === 303 && r.headers.get("location") === `https://www.gowayfind.com/unsubscribe?list=trip&t=${TOKEN}` && calls.length === 0, "GET with a real token mutated or read the database, or did not go to the confirm page: " + r.headers.get("location") + " calls=" + calls.length);

  reset();
  r = await unsubRoute.POST(P(TOKEN));
  ok(r.status === 303 && r.headers.get("location") === "https://www.gowayfind.com/unsubscribe?list=trip&done=1", "the confirm button did not redirect to done=1: " + r.headers.get("location"));
  const patch = calls.find((c) => c.method === "PATCH" && c.u.includes(`unsubscribe_token=eq.${TOKEN}`));
  ok(patch && patch.body.status === "unsubscribed" && typeof patch.body.unsubscribed_at === "string", "the contact was not flipped to unsubscribed");
  ok(patch && patch.u.includes("&status=eq.subscribed"), "the unsubscribe PATCH has no status=eq.subscribed filter: " + (patch && patch.u));
  const cancel = calls.find((c) => c.method === "PATCH" && c.u.includes("wf_reengage_queue"));
  ok(cancel && cancel.u.includes("contact_id=eq.7") && cancel.u.includes("status=eq.pending") && cancel.body.status === "cancelled" && cancel.body.cancelled_reason === "unsubscribed", "pending drip rows were not cancelled for this contact");
  const sup = calls.find((c) => c.method === "POST" && c.u.includes("wf_reengage_suppressions"));
  ok(sup && sup.body.kind === "unsubscribe" && sup.body.contact_id === 7 && /^[a-f0-9]{64}$/.test(sup.body.email_hash) && /ignore-duplicates/.test(sup.headers.Prefer) && sup.u.includes("on_conflict=provider_event_id"), "suppression row missing, or not idempotent");
  ok(!sup.raw.includes(EMAIL) && !JSON.stringify(cancel.body).includes(EMAIL), "the suppression row stored the raw address, not just its hash");
  const emailHashed = lib.emailHash(EMAIL);
  ok(sup.body.email_hash === emailHashed && emailHashed.length === 64, "suppression hash is not the sha256 of the lowercased address");

  // idempotent: a second click is the same answer
  reset();
  r = await unsubRoute.POST(P(TOKEN));
  ok(r.status === 303 && r.headers.get("location").endsWith("done=1"), "a repeat click did not give the same answer");

  // a bounced / complained contact: found (done=1), status and unsubscribed_at NOT rewritten
  for (const status of ["bounced", "complained"]) {
    reset({ contact: { id: 7, status, unsubscribe_token: TOKEN, email: EMAIL, anon_id: ANON, unsubscribed_at: null } });
    r = await unsubRoute.POST(P(TOKEN));
    ok(r.status === 303 && r.headers.get("location").endsWith("done=1"), status + " token did not count as found (done=1): " + r.headers.get("location"));
    ok(S.contact.status === status && S.contact.unsubscribed_at === null, status + " contact's status or unsubscribed_at was overwritten by an unsubscribe click");
    ok(calls.some((c) => c.method === "PATCH" && c.u.includes("wf_reengage_queue") && c.u.includes("contact_id=eq.7") && c.u.includes("status=eq.pending")), status + " click did not still cancel pending drip rows");
  }
  // an already unsubscribed contact: a repeat click does not rewrite unsubscribed_at
  reset({ contact: { id: 7, status: "unsubscribed", unsubscribe_token: TOKEN, email: EMAIL, anon_id: ANON, unsubscribed_at: "2026-11-01T00:00:00.000Z" } });
  r = await unsubRoute.POST(P(TOKEN));
  ok(r.headers.get("location").endsWith("done=1") && S.contact.unsubscribed_at === "2026-11-01T00:00:00.000Z", "a repeat unsubscribe click rewrote unsubscribed_at");
  // a subscribed contact is flipped by the same stateful stub (positive control for the checks above)
  reset({ contact: { id: 7, status: "subscribed", unsubscribe_token: TOKEN, email: EMAIL, anon_id: ANON, unsubscribed_at: null } });
  r = await unsubRoute.POST(P(TOKEN));
  ok(S.contact.status === "unsubscribed" && typeof S.contact.unsubscribed_at === "string", "positive control: the stateful stub did not flip a subscribed contact, so the no-overwrite checks above proved nothing");
  // an unknown token is still found:false (nothing cancelled, nothing suppressed)
  reset({ unsubRows: [] });
  r = await unsubRoute.POST(P("c".repeat(64)));
  ok(r.headers.get("location").endsWith("done=invalid") && only((c) => c.u.includes("wf_reengage_queue") || c.u.includes("wf_reengage_suppressions")).length === 0, "an unknown token cancelled queue rows or wrote a suppression");
  reset({ dbDown: true });
  r = await unsubRoute.POST(P(TOKEN));
  ok(r.headers.get("location").endsWith("done=error"), "a database failure did not redirect to done=error");

  reset();
  r = await unsubRoute.POST(U("POST", TOKEN));
  const pj = await r.json();
  ok(r.status === 200 && pj.ok === true && calls.some((c) => c.method === "PATCH" && c.u.includes("unsubscribe_token=eq.")), "RFC 8058 one click POST did not unsubscribe");
  reset();
  r = await unsubRoute.HEAD(U("HEAD", TOKEN));
  ok(r.status === 200 && calls.length === 0, "a HEAD request (link prefetch) changed or read the database");
}

// ── 9b. the open route: "Open my plan" confirms, and is never an open redirect ─
const openRoute = await loadComponent(path.join(ROOT, "app/api/reengage/open/route.js"), ROOT);
const O = (qs, m = "GET") => new Request("https://www.gowayfind.com/api/reengage/open" + qs, { method: m });
const UTMQ = "&utm_source=resend_lifecycle&utm_medium=email&utm_campaign=itinerary_email";
{
  reset({ contact: { id: 7, status: "subscribed", unsubscribe_token: TOKEN, email: EMAIL, anon_id: ANON, confirmed_at: null } });
  let r = await openRoute.GET(O(`?t=${TOKEN}&to=${encodeURIComponent("/plan-my-day")}${UTMQ}`));
  const conf = calls.find((c) => c.method === "PATCH" && c.u.includes("wf_reengage_contacts"));
  ok(r.status === 303 && r.headers.get("location") === "https://www.gowayfind.com/plan-my-day?utm_source=resend_lifecycle&utm_medium=email&utm_campaign=itinerary_email", "a valid open click did not 303 to the plan page keeping its utm params: " + r.headers.get("location"));
  ok(conf && conf.u.includes(`unsubscribe_token=eq.${TOKEN}`) && conf.u.includes("status=eq.subscribed") && conf.u.includes("confirmed_at=is.null") && typeof conf.body.confirmed_at === "string" && !("status" in conf.body), "the confirm PATCH is not scoped to a subscribed, unconfirmed contact: " + (conf && conf.u));
  ok(typeof S.contact.confirmed_at === "string" && calls.length === 1, "a valid token did not set confirmed_at (or made extra calls)");
  const firstAt = S.contact.confirmed_at;
  // a second click never moves confirmed_at; an opted out contact is never confirmed
  await openRoute.GET(O(`?t=${TOKEN}&to=%2F`));
  ok(S.contact.confirmed_at === firstAt, "a second click moved confirmed_at");
  reset({ contact: { id: 7, status: "unsubscribed", unsubscribe_token: TOKEN, email: EMAIL, anon_id: ANON, confirmed_at: null } });
  await openRoute.GET(O(`?t=${TOKEN}&to=%2Fplan-my-day`));
  ok(S.contact.confirmed_at === null, "an unsubscribed contact was confirmed by a click");
  // allowed targets
  for (const [to, want] of [["/", "/"], ["/plan-my-day", "/plan-my-day"], ["/p/ChIJabc_-9", "/p/ChIJabc_-9"], ["/guides/best-beaches", "/guides/best-beaches"]]) {
    reset({ contact: { id: 7, status: "subscribed", unsubscribe_token: TOKEN, email: EMAIL, anon_id: ANON } });
    r = await openRoute.GET(O(`?t=${TOKEN}&to=${encodeURIComponent(to)}`));
    ok(r.status === 303 && r.headers.get("location") === "https://www.gowayfind.com" + want, `allowed target ${to} was not honoured: ` + r.headers.get("location"));
  }
  // never an open redirect: everything else lands on "/"
  const evil = ["//evil.com", "https://evil.com", "/\\evil", "/\\evil.com/x", "http://www.gowayfind.com@evil.com", "javascript:alert(1)", "/plan-my-day?x=1", "/plan-my-day/../../evil", "/p/", "/p/a/b", "/guides/UPPER", "/api/reengage/unsubscribe", "///evil.com", "/%2F%2Fevil.com", "/plan-my-day\n", "evil.com", "", "/" + "a".repeat(300)];
  for (const to of evil) {
    reset({ contact: { id: 7, status: "subscribed", unsubscribe_token: TOKEN, email: EMAIL, anon_id: ANON } });
    r = await openRoute.GET(O(`?t=${TOKEN}&to=${encodeURIComponent(to)}`));
    const loc = r.headers.get("location");
    ok(r.status === 303 && loc === "https://www.gowayfind.com/", `to=${JSON.stringify(to).slice(0, 40)} did not land on "/": ${loc}`);
  }
  ok(new URL((await openRoute.GET(O(`?t=${TOKEN}&to=${encodeURIComponent("//evil.com")}`))).headers.get("location")).hostname === "www.gowayfind.com", "positive control: the redirect host check did not run");
  // utm values are re-checked, unknown params dropped
  reset();
  r = await openRoute.GET(O(`?t=${TOKEN}&to=%2F&utm_source=${encodeURIComponent("x y<script>")}&utm_medium=email&evil=1`));
  const lu = new URL(r.headers.get("location"));
  ok(!lu.searchParams.has("utm_source") && lu.searchParams.get("utm_medium") === "email" && !lu.searchParams.has("evil"), "the redirect kept a malformed utm value or an unknown param: " + lu.search);
  // a bad token costs zero database calls and still opens the page
  for (const bad of ["short", "'; drop table--", "A".repeat(64), ""]) {
    reset();
    r = await openRoute.GET(O(`?t=${encodeURIComponent(bad)}&to=%2Fplan-my-day`));
    ok(r.status === 303 && r.headers.get("location") === "https://www.gowayfind.com/plan-my-day" && calls.length === 0, `a malformed token (${bad.slice(0, 12)}) made a database call or did not redirect`);
  }
  reset();
  r = await openRoute.GET(O(`?to=%2Fplan-my-day`));
  ok(r.status === 303 && calls.length === 0, "no token made a database call");
  // a database failure never blocks the redirect
  reset({ dbDown: true });
  r = await openRoute.GET(O(`?t=${TOKEN}&to=%2Fplan-my-day`));
  ok(r.status === 303 && r.headers.get("location") === "https://www.gowayfind.com/plan-my-day", "a database failure blocked the redirect");
  // HEAD (link prefetch) changes nothing
  reset();
  r = await openRoute.HEAD(O(`?t=${TOKEN}`, "HEAD"));
  ok(r.status === 200 && calls.length === 0, "a HEAD request confirmed a contact or touched the database");
}

// ── 10. planRef on /api/plan-my-day (EXECUTES the real route on a cached plan) ─
{
  reset();
  const pmd = await loadComponent(path.join(ROOT, "lib/planMyDay.js"), ROOT);
  const st = await loadComponent(path.join(ROOT, "lib/siteTime.js"), ROOT);
  const route = await loadComponent(path.join(ROOT, "app/api/plan-my-day/route.js"), ROOT);
  const picks = pmd.parsePlanRequest({ area: "sarasota", when: "today", vibe: "easy" }, st.siteTodayStr());
  const cacheKey = pmd.planCacheKey(picks);
  S.cache[cacheKey] = { ...REAL_OUT, _gap: null };
  const askPlan = () => route.POST(new Request("https://www.gowayfind.com/api/plan-my-day", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ area: "sarasota", when: "today", vibe: "easy" }) }));
  const settle = () => new Promise((r) => setTimeout(r, 60));
  const a = await (await askPlan()).json();
  await settle();
  ok(a.ok === true && a.cached === true && /^[a-f0-9]{32}$/.test(a.planRef || ""), "a cached plan answer had no 32 hex planRef: " + JSON.stringify(Object.keys(a)));
  ok(!("_gap" in a), "the private cache field leaked");
  const stored = calls.find((c) => c.method === "POST" && c.u.includes("wf_places_cache") && c.body && c.body.k === "reengage-plan:" + a.planRef);
  ok(stored && stored.body.v.area === "sarasota" && stored.body.v.areaName === "Sarasota" && stored.body.v.when === "2026-11-28" && stored.body.v.days[0].stops[0].name === "Ringling Museum" && stored.body.v.days[0].stops[0].url === "/places/ChIJabc", "the snapshot was not stored under reengage-plan:<planRef> with the built plan: " + JSON.stringify(stored && stored.body.v));
  const ttl = stored ? Date.parse(stored.body.exp) - Date.now() : 0;
  ok(Math.abs(ttl - 7 * 24 * 3600e3) < 3600e3, "the snapshot TTL is not 7 days (" + Math.round(ttl / 3600e3) + "h)");
  ok(!calls.some((c) => c.method === "POST" && c.u.includes("wf_places_cache") && c.body && String(c.body.k).startsWith("planday3") && JSON.stringify(c.body.v).includes("planRef")), "planRef was written into the shared plan cache entry");
  const b = await (await askPlan()).json();
  ok(/^[a-f0-9]{32}$/.test(b.planRef || "") && b.planRef !== a.planRef, "two answers shared one planRef");
  // that stored snapshot is exactly what the email route reads back
  S.plan[a.planRef] = stored.body.v;
  reset({ plan: { [a.planRef]: stored.body.v } });
  const e = await run({ ...GOOD, planRef: a.planRef });
  ok(e.r.status === 200 && resendCalls().length === 1 && resendCalls()[0].body.html.includes("Ringling Museum"), "the snapshot the plan route stored was not the one the email route sent");
  // an unplannable answer gets no planRef
  S.cache[cacheKey] = { ...REAL_OUT, itinerary: { ...REAL_OUT.itinerary, days: [] }, _gap: null };
  globalThis.__wfServerCacheMem && globalThis.__wfServerCacheMem.delete(cacheKey);
  const none = await (await askPlan()).json();
  ok(none.ok === true && !("planRef" in none), "a plan with no stops still got a planRef");
  const invalid = await (await route.POST(new Request("https://www.gowayfind.com/api/plan-my-day", { method: "POST", body: JSON.stringify({ area: "nowhere" }) }))).json();
  ok(invalid.ok === false && !("planRef" in invalid), "an error answer carried a planRef");

  // feature OFF: a cached answer goes out unchanged: no planRef, and ZERO cache writes
  const askFrom = (ip) => route.POST(new Request("https://www.gowayfind.com/api/plan-my-day", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ area: "sarasota", when: "today", vibe: "easy" }) }));
  const freshCache = () => { S.cache[cacheKey] = { ...REAL_OUT, _gap: null }; globalThis.__wfServerCacheMem && globalThis.__wfServerCacheMem.delete(cacheKey); };
  const snapshotWrites = () => calls.filter((c) => c.method === "POST" && c.u.includes("wf_places_cache") && c.body && String(c.body.k).startsWith("reengage-plan:")).length;
  freshCache();
  delete process.env.WF_REENGAGE_ENABLED;
  calls = [];
  const off = await (await askFrom("203.0.113.1")).json();
  await settle();
  ok(off.ok === true && off.cached === true && Array.isArray(off.itinerary && off.itinerary.days), "positive control: the feature-off request did not return the cached plan");
  ok(!("planRef" in off), "feature off: the plan answer still carried a planRef");
  ok(calls.filter((c) => c.method !== "GET" && c.u.includes("wf_places_cache")).length === 0, "feature off: the plan route still wrote to the cache store (" + calls.filter((c) => c.method !== "GET" && c.u.includes("wf_places_cache")).length + " writes)");
  // feature ON, same request: the control that the checks above could have failed
  process.env.WF_REENGAGE_ENABLED = "1";
  freshCache();
  calls = [];
  const on = await (await askFrom("203.0.113.2")).json();
  await settle();
  ok(/^[a-f0-9]{32}$/.test(on.planRef || "") && snapshotWrites() === 1, "positive control: with the feature on the same cached request minted one planRef and one snapshot write");
  // a cache hit loop cannot mint without limit: the per-IP limit applies BEFORE minting
  freshCache();
  calls = [];
  const burst = [];
  for (let i = 0; i < 9; i++) burst.push(/^[a-f0-9]{32}$/.test((await (await askFrom("203.0.113.9")).json()).planRef || ""));
  await settle();
  ok(burst.slice(0, 6).every(Boolean) && burst.slice(6).every((m) => !m), "cache hits minted past the per-IP limit: " + burst.join());
  ok(snapshotWrites() === 6, "cache hits wrote " + snapshotWrites() + " snapshots for one IP, expected exactly the 6 allowed");
  // SOURCE-LEVEL (the cache MISS path needs a full itinerary build, which this test cannot run): withPlanRef itself is gated on the feature
  const routeSrc = readFileSync(path.join(ROOT, "app/api/plan-my-day/route.js"), "utf8").replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, "$1");
  ok(/function withPlanRef\(out\) \{\s*try \{\s*if \(!reengageConfigured\(\)\) return out;/.test(routeSrc) && (routeSrc.match(/withPlanRef\(/g) || []).length === 4, "SOURCE-LEVEL: withPlanRef is not gated on reengageConfigured() first (the cache miss paths mint through it)");
  const other = await (await askFrom("203.0.113.10")).json();
  ok(/^[a-f0-9]{32}$/.test(other.planRef || ""), "the per-IP limit leaked to a different IP");
}

// ── 11. middleware wiring (EXECUTES the real middleware) ────────────────────
{
  const mwSrc = readFileSync(path.join(ROOT, "middleware.js"), "utf8");
  const entry = path.join(ROOT, "middleware.js");
  const source = mwSrc.replace('import { NextResponse } from "next/server";', 'const NextResponse = { next: () => new Response(null, { status: 204 }) };');
  ok(source !== mwSrc, "the middleware NextResponse import was not stubbed, so the checks below ran against nothing");
  const real = await loadComponent(entry, ROOT, { sourceOverrides: new Map([[entry, source]]) });
  ok(real.config.matcher.includes("/api/newsletter/subscribe"), "positive control: an existing matcher entry was not found");
  ok(real.config.matcher.includes("/api/reengage/email") && real.config.matcher.includes("/api/reengage/unsubscribe") && real.config.matcher.includes("/api/reengage/open"), "a reengage route is missing from the middleware matcher");
  const call = (p, method, headers) => real.middleware({ nextUrl: new URL("https://www.gowayfind.com" + p), method, headers: new Headers({ "x-forwarded-for": "203.0.113." + Math.floor(Math.random() * 250), ...headers }) });
  ok(call("/api/reengage/email", "POST", { "sec-fetch-site": "cross-site", origin: "https://external.example" }).status === 403, "a cross-site POST to /api/reengage/email was not refused");
  ok(call("/api/reengage/email", "POST", {}).status === 403, "a headerless POST to /api/reengage/email was not refused");
  ok(call("/api/reengage/email", "POST", { "sec-fetch-site": "same-origin" }).status === 204, "a same-origin POST to /api/reengage/email was refused");
  ok(call("/api/reengage/unsubscribe", "POST", { "sec-fetch-site": "cross-site", origin: "https://mail.example" }).status === 204, "a mail app's cross-site one click POST was blocked by the same-origin gate");
  ok(call("/api/reengage/unsubscribe", "GET", {}).status === 204, "a headerless unsubscribe click (mail client link) was blocked");
  // the tight per-IP limit on the send route: 5 a minute, then 429
  const ip = { "x-forwarded-for": "198.51.100.77", "sec-fetch-site": "same-origin" };
  const burst = [];
  for (let i = 0; i < 7; i++) burst.push(real.middleware({ nextUrl: new URL("https://www.gowayfind.com/api/reengage/email"), method: "POST", headers: new Headers(ip) }).status);
  ok(burst.slice(0, 5).every((s) => s === 204) && burst[5] === 429, "the per-IP limit on /api/reengage/email is not 5 a minute: " + burst.join());
  // the open link is opened from mail apps: rate limited, never same-origin gated
  ok(call("/api/reengage/open", "GET", {}).status === 204 && call("/api/reengage/open", "GET", { "sec-fetch-site": "cross-site" }).status === 204, "the mail link /api/reengage/open was blocked by the same-origin gate");
  const openBurst = [];
  for (let i = 0; i < 130; i++) openBurst.push(real.middleware({ nextUrl: new URL("https://www.gowayfind.com/api/reengage/open"), method: "GET", headers: new Headers({ "x-forwarded-for": "198.51.100.79" }) }).status);
  ok(openBurst[0] === 204 && openBurst.includes(429) && openBurst.slice(0, 100).every((s) => s === 204), "/api/reengage/open is not rate limited by the general per-IP limit (and must not get the tight send limit)");
  // its OWN bucket: newsletter signups from one IP do not spend the plan email budget, and the reverse
  const mw = (p, ip) => real.middleware({ nextUrl: new URL("https://www.gowayfind.com" + p), method: "POST", headers: new Headers({ "x-forwarded-for": ip, "sec-fetch-site": "same-origin" }) }).status;
  const nl5 = Array.from({ length: 5 }, () => mw("/api/newsletter/subscribe", "198.51.100.90"));
  ok(nl5.every((s) => s === 204) && mw("/api/newsletter/subscribe", "198.51.100.90") === 429, "positive control: 5 newsletter signups were not exactly the newsletter limit: " + nl5.join());
  ok(mw("/api/reengage/email", "198.51.100.90") === 204, "newsletter signups spent the plan email rate limit (shared bucket)");
  const re5 = Array.from({ length: 5 }, () => mw("/api/reengage/email", "198.51.100.91"));
  ok(re5.every((s) => s === 204) && mw("/api/reengage/email", "198.51.100.91") === 429, "positive control: the plan email limit is not 5 a minute: " + re5.join());
  ok(mw("/api/newsletter/subscribe", "198.51.100.91") === 204, "plan emails spent the newsletter signup rate limit (shared bucket)");
  const unsubBurst = [];
  for (let i = 0; i < 7; i++) unsubBurst.push(real.middleware({ nextUrl: new URL("https://www.gowayfind.com/api/reengage/unsubscribe"), method: "POST", headers: new Headers({ "x-forwarded-for": "198.51.100.78" }) }).status);
  ok(unsubBurst.every((s) => s === 204), "the unsubscribe route got the tight send limit (a person unsubscribing must not be throttled at 5)");
}

// ── 12. the unsubscribe page (source check: the page is a server component) ──
{
  const page = readFileSync(path.join(ROOT, "app/unsubscribe/page.js"), "utf8").replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, "$1");
  ok(/sp\.list === "trip" && done === "1"/.test(page) && /You are unsubscribed from trip emails\./.test(page), "unsubscribe page does not handle ?list=trip&done=1 (source check, the page was not rendered)");
  ok(/if \(done === "1"\) \{[\s\S]*You&apos;re unsubscribed/.test(page), "the newsletter unsubscribe confirmation was removed");
}

// ── 13. the address never rides in a URL (EVERY recorded request of the whole run) ─
{
  const probe = (u) => /@|%40/i.test(u);
  ok(probe("https://x.test/rest/v1/wf_reengage_contacts?email=eq.test.user%40example.test") && probe("a@b.test") && !probe("https://x.test/rest/v1/wf_reengage_contacts?email_hash=eq." + "a".repeat(64)), "positive control: the URL probe does not recognise an address in a query string");
  const inUrl = allCalls.filter((c) => probe(c.u));
  ok(allCalls.length > 150 && inUrl.length === 0, "an '@' or '%40' appeared in " + inUrl.length + " of " + allCalls.length + " request URLs, e.g. " + (inUrl[0] && inUrl[0].u));
  ok(allCalls.some((c) => c.method === "POST" && c.u.includes("wf_reengage_contacts") && c.raw.includes(EMAIL)) && allCalls.some((c) => c.u.startsWith("https://api.resend.com/") && c.raw.includes(EMAIL)), "positive control: the address did not appear in any request BODY (the contact insert and the Resend call), so the URL check proved nothing");
  ok(allCalls.filter((c) => c.u.includes("wf_reengage_contacts") && c.method === "GET").every((c) => /[?&](?:email_hash|unsubscribe_token)=eq\.[a-f0-9]{64}/.test(c.u)) && allCalls.some((c) => c.u.includes("wf_reengage_contacts") && c.u.includes("email_hash=eq.")), "a contacts lookup used a key other than email_hash or the token");
}

if (failures) { console.error(`test-reengage-server: ${failures} failure(s) out of ${assertions} assertions`); process.exit(1); }
console.log(`test-reengage-server: OK — ${assertions} assertions; ${bodies.length} route responses checked for an echoed address; email escaped + opt out + utm + directions, drip +2h/+24h/+72h, 7 day cap fails closed, opted out contacts never emailed, unsubscribe touches zero rows on a bad token, planRef snapshot round trips plan route to email route`);
