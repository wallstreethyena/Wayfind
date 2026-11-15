// scripts/test-meta-partner-handoff.mjs — locks Meta's ONE conversion, the
// server-witnessed PartnerHandoff (lib/metaCapi.js), and the ad-identity fields
// that let a partner click be tied to a Meta campaign / ad set / ad.
//
// THE INVARIANTS (each one EXECUTED, not grepped, except the route census):
//   1. Only a HUMAN, NON-TEST provider_redirect_started from a browser Meta
//      already knows (_fbp or _fbc) becomes a PartnerHandoff. Everything else
//      is skipped with a named reason.
//   2. Meta receives an exact, closed set of keys. No email, phone, name, user
//      id, query string, landing campaign label, click id value or hash ever
//      appears in the payload, even when the input carries them.
//   3. event_id is wf_ph_<click_id>, stable per click (Meta dedupes retries).
//   4. Dormant without META_CAPI_ACCESS_TOKEN (no fetch at all); off switch works.
//   4b. CONSENT GATE (lib/metaConsent.js): META_CAPI_CONSENT_POLICY defaults to
//      blocked (unset/unknown => no send even with a token and cookies);
//      us_no_gpc sends only for country US without GPC or a stored denial, with
//      Limited Data Use on every event; QA lane needs test session + env test
//      code + wf_meta_qa secret cookie and is the ONLY place test_event_code is set.
//   4c. DELIVERY: bounded timeout, success only when events_received >= 1,
//      classified failures, one identical-payload retry, token never in
//      results or logs, same suppression as PostHog captureServer.
//   5. Every partner redirect route emits provider_redirect_started through
//      captureServerInBackground, and that function hands it to the relay.
//   6. utm_content / utm_term (ad id / ad set id) survive landing -> cookie ->
//      the server redirect event's whitelist.
// Never write to the production PostHog project: commerce.js / serverEvents.js are
// reachable from here. The relay itself only runs with an injected mock fetch.
process.env.WF_SUPPRESS_ANALYTICS = "1";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0;
const fail = (m) => { console.error("test-meta-partner-handoff: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// Capture console output so we can prove the token and identifiers never reach a log line.
const logs = [];
const realLog = console.log;
for (const k of ["log", "warn", "info"]) console[k] = (...a) => { logs.push(a.map(String).join(" ")); };

const C = await import("../lib/metaCapi.js");
const M = await import("../lib/metaConsent.js");
const A = await import("../lib/campaignAttribution.js");
const K = await import("../lib/commerce.js");

const FBP = "fb.1.1731400000000.123456789";
const FBC = "fb.1.1731400000000.IwAR0abcDEF_ghi-123";
const headers = (cookie, extra = {}) => {
  const h = { cookie, "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "x-forwarded-for": "203.0.113.7, 10.0.0.1", "x-vercel-ip-country": "US", ...extra };
  return { get: (k) => h[k.toLowerCase()] ?? null };
};
const humanProps = {
  provider: "viator", surface: "christmas_tickets", content_id: "ice-gaylord", offer_id: "12345P1",
  click_id: "wf-abc123def456", traffic_class: "human", landing_path: "/christmas-in-florida",
  landing_campaign: "120253753342110067", landing_content: "120253875276390067", landing_term: "120253753342090067",
  landing_source: "meta", landing_click_type: "fbclid",
};

// ── 1 + 2 + 3: the happy path, exact shape ───────────────────────────────
const env = { META_CAPI_CONSENT_POLICY: "us_no_gpc" };
let b = C.buildPartnerHandoff({ event: "provider_redirect_started", properties: humanProps, headers: headers(`_fbp=${FBP}; _fbc=${FBC}; ph_x=1`), env, now: 1_731_400_000_000 });
ok(b && !b.skip && b.payload && b.pixelId === "1424559705968711", `builds for a human handoff (got ${JSON.stringify(b && b.skip)})`);
const ev = b.payload.data[0];
ok(ev.event_name === "PartnerHandoff", "event name is PartnerHandoff");
ok(ev.event_id === "wf_ph_wf-abc123def456", "event_id is wf_ph_<click_id>");
ok(ev.action_source === "website" && ev.event_time === 1_731_400_000, "website action, seconds timestamp");
ok(ev.event_source_url === "https://www.gowayfind.com/christmas-in-florida", "source url = our host + landing PATH only");
const sameKeys = (o, want) => JSON.stringify(Object.keys(o).sort()) === JSON.stringify(want.slice().sort());
ok(sameKeys(ev, ["event_name", "event_time", "event_id", "action_source", "event_source_url", "user_data", "custom_data", "data_processing_options", "data_processing_options_country", "data_processing_options_state"]), "live event carries exactly the 7 documented keys + the 3 LDU keys");
ok(JSON.stringify(ev.data_processing_options) === '["LDU"]' && ev.data_processing_options_country === 0 && ev.data_processing_options_state === 0, "every us_no_gpc event carries Limited Data Use, country 0, state 0");
ok(sameKeys(ev.user_data, ["fbp", "fbc", "client_ip_address", "client_user_agent"]), `user_data is exactly fbp/fbc/ip/ua (got ${Object.keys(ev.user_data)})`);
ok(ev.user_data.client_ip_address === "203.0.113.7", "first forwarded IP only");
ok(sameKeys(ev.custom_data, ["content_type", "provider", "content_ids", "surface"]), `custom_data is exactly content_type/provider/content_ids/surface (got ${Object.keys(ev.custom_data)})`);
ok(!("value" in ev.custom_data) && !("currency" in ev.custom_data), "no value / currency: intent, not revenue");
ok(!("test_event_code" in b.payload), "a live event never carries test_event_code");
const b2 = C.buildPartnerHandoff({ event: "provider_redirect_started", properties: humanProps, headers: headers(`_fbp=${FBP}`), env, now: 1_731_400_999_000 });
ok(b2.payload.data[0].event_id === ev.event_id, "same click -> same event_id (Meta dedupes a retried redirect)");

// PII probe: hostile inputs everywhere. Positive control first: the probe finds a planted value.
const probe = (payload, needle) => JSON.stringify(payload).indexOf(needle) >= 0;
ok(probe({ x: "gabe@example.com" }, "@"), "control: the probe detects an email");
const hostile = { ...humanProps, email: "gabe@example.com", phone: "9415551234", name: "Gabriel", user_id: "u-77", fbclid: "IwAR0SECRETCLICK",
  surface: "a@b.co", content_id: "x?email=a@b.co", landing_path: "/x?email=a@b.co" };
const bh = C.buildPartnerHandoff({ event: "provider_redirect_started", properties: hostile, headers: headers(`_fbp=${FBP}; email=a@b.co`), env, now: 1 });
ok(bh && bh.payload, "hostile input still produces a payload for the valid parts");
for (const needle of ["@", "9415551234", "Gabriel", "u-77", "IwAR0SECRETCLICK", "?", "120253753342110067", "120253875276390067"]) {
  ok(!probe(bh.payload, needle), `payload never contains ${JSON.stringify(needle)} (no PII, query strings, click id values or campaign labels)`);
}
ok(bh.payload.data[0].event_source_url === "https://www.gowayfind.com/", "an unsafe landing path falls back to /");

// Skips, each with its own reason.
const skip = (props, hdrs, e = env, event = "provider_redirect_started") => C.buildPartnerHandoff({ event, properties: props, headers: hdrs, env: e }).skip;
ok(skip(humanProps, headers(`_fbp=${FBP}`), env, "commerce_cta_clicked") === "not_handoff", "only provider_redirect_started (a client tap is not a handoff)");
ok(skip({ ...humanProps, traffic_class: "automation" }, headers(`_fbp=${FBP}`)) === "not_human", "automation is never sent");
ok(skip({ ...humanProps, traffic_class: "crawler" }, headers(`_fbp=${FBP}`)) === "not_human", "crawlers are never sent");
ok(skip({ ...humanProps, traffic_class: undefined }, headers(`_fbp=${FBP}`)) === "not_human", "a missing class is not assumed human");
ok(skip({ ...humanProps, is_test: true }, headers(`_fbp=${FBP}`)) === "test_traffic", "wf_test sessions are never sent");
ok(skip({ ...humanProps, wf_test: "qa1" }, headers(`_fbp=${FBP}`)) === "test_traffic", "a wf_test label alone also skips");
ok(skip({ ...humanProps, click_id: "" }, headers(`_fbp=${FBP}`)) === "missing_ids", "no click id -> nothing to dedupe on -> skip");
ok(skip(humanProps, headers("ph=1")) === "no_meta_browser_id", "a browser Meta has never seen is not introduced to Meta");
ok(skip(humanProps, headers("_fbp=garbage")) === "no_meta_browser_id", "a malformed _fbp is rejected");
ok(skip(humanProps, headers(`_fbp=${FBP}`, { "x-forwarded-for": "", "x-real-ip": "" })) === "no_ip_or_ua", "no IP -> skip (Meta requires it for website events)");
ok(skip(humanProps, headers(`_fbp=${FBP}`), { META_CAPI_PARTNER_HANDOFF: "off" }) === "disabled", "META_CAPI_PARTNER_HANDOFF=off disables it");
const bt = C.buildPartnerHandoff({ event: "provider_redirect_started", properties: humanProps, headers: headers(`_fbp=${FBP}`), env: { ...env, META_CAPI_TEST_EVENT_CODE: "TEST12345" } });
ok(!("test_event_code" in bt.payload) && bt.lane === "live", "a configured test code is NEVER attached to a real visitor event");

// ── 4: the relay, executed with a mock fetch ─────────────────────────────
const PROD = { META_CAPI_ACCESS_TOKEN: "tok_abc", META_CAPI_CONSENT_POLICY: "us_no_gpc", VERCEL_ENV: "production" };
const posts = [];
const fetchImpl = async (url, init) => { posts.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200, text: async () => JSON.stringify({ events_received: 1, fbtrace_id: "AbC123xyz" }) }; };
let r = await C.relayPartnerHandoff({ event: "provider_redirect_started", properties: humanProps, headers: headers(`_fbp=${FBP}`), env: {}, fetchImpl });
ok(r.sent === false && r.reason === "capi_not_configured" && posts.length === 0, "dormant without a token: no request at all");
r = await C.relayPartnerHandoff({ event: "provider_redirect_started", properties: humanProps, headers: headers(`_fbp=${FBP}`), env: PROD, fetchImpl });
ok(r.sent === true && posts.length === 1, `sends once with a token (got ${JSON.stringify(r)})`);
ok(/^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/1424559705968711\/events$/.test(posts[0].url), "posts to the live dataset's /events");
ok(posts[0].body.access_token === "tok_abc" && posts[0].body.data[0].event_name === "PartnerHandoff", "token in body, PartnerHandoff in data");
r = await C.relayPartnerHandoff({ event: "provider_redirect_started", properties: { ...humanProps, traffic_class: "automation" }, headers: headers(`_fbp=${FBP}`), env: PROD, fetchImpl });
ok(r.sent === false && posts.length === 1, "a skipped event makes no request even with a token");
r = await C.relayPartnerHandoff({ event: "provider_redirect_started", properties: humanProps, headers: headers(`_fbp=${FBP}`), env: { ...PROD, META_CAPI_ACCESS_TOKEN: "tok" }, fetchImpl: async () => { throw new Error("down"); } });
ok(r.sent === false, "a network failure resolves, never throws");

// ── 5: every partner route reaches the relay ─────────────────────────────
const se = strip(read("lib/serverEvents.js"));
const bg = se.slice(se.indexOf("export function captureServerInBackground"));
ok(/relayPartnerHandoff\(\{\s*event,\s*properties:\s*o\.properties,\s*headers:\s*o\.headers,\s*onResult:\s*recordMetaCapiResult\s*\}\)/.test(bg), "captureServerInBackground calls relayPartnerHandoff with the whitelisted properties + headers (+ the safe result recorder)");
ok(/event === "provider_redirect_started"/.test(bg), "the hook is limited to provider_redirect_started");
ok(/serverEmitRefusal\(\{\s*headers\s*\}\)/.test(se.slice(se.indexOf("export async function captureServer(")).split("export function captureServerInBackground")[0]), "PostHog captureServer uses the SAME shared suppression predicate as the Meta relay");
const mc = strip(read("lib/metaCapi.js"));
ok(/serverEmitRefusal\(\{[^}]*strict:\s*true/.test(mc), "relayPartnerHandoff applies the shared predicate in strict mode");
ok(/import \{ relayPartnerHandoff \} from "\.\/metaCapi\.js"/.test(se), "serverEvents imports the relay");
const ROUTES = ["commerce", "viator", "ticketmaster", "stubhub", "hotels"].map((n) => `app/api/${n}/go/route.js`);
for (const f of ROUTES) {
  const s = strip(read(f));
  ok(/captureServerInBackground\(event,/.test(s), `${f} emits through captureServerInBackground`);
  ok(/emit\("provider_redirect_started"/.test(s), `${f} emits provider_redirect_started`);
  ok(/traffic_class:\s*trafficClass/.test(s), `${f} stamps traffic_class on the event`);
}

// ── 6: ad identity survives landing -> cookie -> server event ────────────
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const local = mem(), session = mem();
const state = A.captureLanding({ search: "?utm_source=meta&utm_medium=paid_social&utm_campaign=120253753342110067&utm_term=120253753342090067&utm_content=120253875276390067&fbclid=IwAR0SECRET", pathname: "/christmas-in-florida", referrer: "https://l.facebook.com/", local, session, now: 1_731_400_000_000 });
const cookie = A.ATTR_COOKIE + "=" + A.landingCookieValue(state);
ok(cookie.indexOf("IwAR0SECRET") < 0, "the click id VALUE never enters the cookie");
const back = A.landingFromCookieHeader(cookie);
ok(back.landing_content === "120253875276390067" && back.landing_term === "120253753342090067", `ad id + ad set id survive the cookie (got ${JSON.stringify(back)})`);
ok(back.landing_campaign === "120253753342110067" && back.landing_click_type === "fbclid", "campaign id + click type survive");
const ctaProps = A.landingProps(state);
ok(ctaProps.landing_content === "120253875276390067" && ctaProps.landing_term === "120253753342090067", "the client click event carries them too");
const serverEvt = K.commercePayload("provider_redirect_started", { provider: "viator", click_id: "wf-1", ...back });
ok(serverEvt.landing_content === "120253875276390067" && serverEvt.landing_term === "120253753342090067", "the redirect event whitelist keeps ad id + ad set id");
const cardEvt = K.commercePayload("card_impression", { provider: "viator", ...back });
ok(!("landing_content" in cardEvt), "control: non-landing events still drop them");


// ── 7: consent gate, QA lane, delivery hardening, suppression ────────────
const TOKEN = "EAAB_SECRET_TOKEN_do_not_leak_123";
const LIVE = { META_CAPI_ACCESS_TOKEN: TOKEN, META_CAPI_CONSENT_POLICY: "us_no_gpc", VERCEL_ENV: "production" };
const QA_SECRET = "qa-secret-0123456789-abcdefghij";
const QA_ENV = { META_CAPI_ACCESS_TOKEN: TOKEN, VERCEL_ENV: "production", META_CAPI_TEST_EVENT_CODE: "TEST98765", META_CAPI_QA_SECRET: QA_SECRET };
const okBody = (n = 1) => JSON.stringify({ events_received: n, messages: [], fbtrace_id: "Tr4ceId_01" });
const mkFetch = (impl) => { const calls = []; const f = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return impl(calls.length, init); }; f.calls = calls; return f; };
const resp = (status, text) => ({ ok: status >= 200 && status < 300, status, text: async () => text });
const relay = (props, hdrs, env, fetchImpl, extra = {}) => C.relayPartnerHandoff({ event: "provider_redirect_started", properties: props, headers: hdrs, env, fetchImpl, argv: [], ...extra });
const H = (cookie = `_fbp=${FBP}`, extra = {}) => headers(cookie, extra);

// consent policy: default blocked, even with a token and Meta cookies
for (const [label, e] of [["unset", {}], ["empty", { META_CAPI_CONSENT_POLICY: "" }], ["garbage", { META_CAPI_CONSENT_POLICY: "yes" }], ["upper-case near miss", { META_CAPI_CONSENT_POLICY: "us-no-gpc" }], ["all", { META_CAPI_CONSENT_POLICY: "all" }]]) {
  const f = mkFetch(async () => resp(200, okBody()));
  const r = await relay(humanProps, H(), { ...LIVE, ...e, META_CAPI_CONSENT_POLICY: e.META_CAPI_CONSENT_POLICY }, f);
  ok(r.sent === false && r.reason === "policy_blocked" && f.calls.length === 0, `policy ${label} => blocked, no fetch even with token + _fbp (got ${JSON.stringify(r)})`);
}
ok(M.consentPolicy({}) === "blocked" && M.consentPolicy({ META_CAPI_CONSENT_POLICY: "us_no_gpc" }) === "us_no_gpc", "policy resolver: default blocked, only the exact known value enables");

// us_no_gpc matrix
{
  const f = mkFetch(async () => resp(200, okBody()));
  const r = await relay(humanProps, H(), LIVE, f);
  const e0 = f.calls[0] && f.calls[0].body.data[0];
  ok(r.sent === true && r.outcome === "accepted" && r.lane === "live" && r.events_received === 1 && r.fbtrace_id === "Tr4ceId_01", `us_no_gpc + US + no GPC sends (got ${JSON.stringify(r)})`);
  ok(e0 && e0.data_processing_options[0] === "LDU" && e0.data_processing_options_country === 0 && e0.data_processing_options_state === 0, "the live send carries LDU 0/0");
  ok(!("test_event_code" in f.calls[0].body), "the live send carries no test_event_code");
  ok(r.consent_basis === "eligible_us_no_gpc", "the basis string is eligible_us_no_gpc");
}
const blockedCase = async (label, hdrs, wantReason) => {
  const f = mkFetch(async () => resp(200, okBody()));
  const r = await relay(humanProps, hdrs, LIVE, f);
  ok(r.sent === false && r.reason === wantReason && f.calls.length === 0, `${label} => ${wantReason}, no fetch (got ${JSON.stringify(r)})`);
};
await blockedCase("GPC with _fbp + _fbc cookies present", H(`_fbp=${FBP}; _fbc=${FBC}`, { "sec-gpc": "1" }), "gpc_opt_out");
await blockedCase("non-US country", H(`_fbp=${FBP}`, { "x-vercel-ip-country": "DE" }), "non_us");
await blockedCase("Canada (not US)", H(`_fbp=${FBP}`, { "x-vercel-ip-country": "CA" }), "non_us");
await blockedCase("missing country", H(`_fbp=${FBP}`, { "x-vercel-ip-country": "" }), "unknown_region");
await blockedCase("malformed country", H(`_fbp=${FBP}`, { "x-vercel-ip-country": "USA" }), "unknown_region");
await blockedCase("malformed spaced country", H(`_fbp=${FBP}`, { "x-vercel-ip-country": "u s" }), "unknown_region");
const denyCookie = "wf_ad_ctx=" + Buffer.from(JSON.stringify({ v: 1, aud: "DENIED", ap: "UNKNOWN" })).toString("base64url");
await blockedCase("a stored ad consent denial", H(`_fbp=${FBP}; ${denyCookie}`), "consent_denied");
{
  const f = mkFetch(async () => resp(200, okBody()));
  const r = await relay(humanProps, H(`_fbp=${FBP}`, { "sec-gpc": "0" }), LIVE, f);
  ok(r.sent === true, "Sec-GPC: 0 is not an opt-out signal");
}

// QA lane: all three conditions
const qaProps = { ...humanProps, is_test: true };
const qaH = (secret = QA_SECRET) => H(`_fbp=${FBP}; wf_meta_qa=${secret}`);
{
  const f = mkFetch(async () => resp(200, okBody()));
  const r = await relay(qaProps, qaH(), QA_ENV, f);
  ok(r.sent === true && r.lane === "qa" && f.calls[0].body.test_event_code === "TEST98765", `QA lane with all three conditions sends with test_event_code (got ${JSON.stringify(r)})`);
  ok(f.calls[0].body.data[0].event_id === "wf_ph_wf-abc123def456", "QA event has the same event_id shape");
  const f2 = mkFetch(async () => resp(200, okBody()));
  const r2 = await relay({ ...humanProps, is_test: undefined, wf_test: "qa1" }, qaH(), QA_ENV, f2);
  ok(r2.sent === true && f2.calls[0].body.test_event_code === "TEST98765", "a wf_test label alone marks the session as test");
  const f3 = mkFetch(async () => resp(200, okBody()));
  const r3 = await relay({ ...humanProps, is_test: "true" }, qaH(), QA_ENV, f3);
  ok(r3.sent === true && f3.calls[0].body.test_event_code === "TEST98765", 'is_test "true" marks the session as test');
}
const qaDenied = async (label, props, hdrs, env) => {
  const f = mkFetch(async () => resp(200, okBody()));
  const r = await relay(props, hdrs, env, f);
  ok(r.sent === false && f.calls.length === 0, `QA lane refused: ${label} (got ${JSON.stringify(r)})`);
};
await qaDenied("session not marked test is NOT the QA lane (and policy blocked)", humanProps, qaH(), QA_ENV);
await qaDenied("wrong cookie", qaProps, qaH("wrong-secret-0123456789-abcdefghij"), QA_ENV);
await qaDenied("missing cookie", qaProps, H(), QA_ENV);
await qaDenied("secret shorter than 24", qaProps, qaH("short"), { ...QA_ENV, META_CAPI_QA_SECRET: "short" });
await qaDenied("secret unset", qaProps, qaH(""), { ...QA_ENV, META_CAPI_QA_SECRET: "" });
await qaDenied("test code unset", qaProps, qaH(), { ...QA_ENV, META_CAPI_TEST_EVENT_CODE: "" });
await qaDenied("test code not TEST-shaped", qaProps, qaH(), { ...QA_ENV, META_CAPI_TEST_EVENT_CODE: "prod123" });
await qaDenied("QA lane still needs a human", { ...qaProps, traffic_class: "automation" }, qaH(), QA_ENV);
await qaDenied("QA lane still needs _fbp/_fbc", qaProps, H(`wf_meta_qa=${QA_SECRET}`), QA_ENV);
await qaDenied("QA lane still needs valid ids", { ...qaProps, click_id: "a@b.co" }, qaH(), QA_ENV);
await qaDenied("a client-supplied test code in the properties is not trusted", { ...humanProps, is_test: true, test_event_code: "TESTCLIENT1", wf_meta_test: "TESTCLIENT1" }, H(), { ...QA_ENV, META_CAPI_QA_SECRET: "" });
{
  // test traffic outside the QA lane is test_traffic, a real-lane request never carries a code
  ok(skip(qaProps, H(), LIVE) === "test_traffic", "test traffic outside the QA lane is skipped (test_traffic)");
  const live = C.buildPartnerHandoff({ event: "provider_redirect_started", properties: humanProps, headers: H(), env: { ...LIVE, ...QA_ENV } });
  ok(live.lane === "live" && !("test_event_code" in live.payload), "with the test code configured, a real visitor still gets NO test_event_code");
  ok(M.safeEqual("abc", "abc") && !M.safeEqual("abc", "abd") && !M.safeEqual("abc", "abcd") && !M.safeEqual("", ""), "safeEqual: equal-length constant-time compare, empty never matches");
}

// suppression: same as captureServer
for (const [label, hdrs, e] of [
  ["WF_SUPPRESS_ANALYTICS=1", H(), { ...LIVE, WF_SUPPRESS_ANALYTICS: "1" }],
  ["synthetic monitor UA", H(`_fbp=${FBP}`, { "user-agent": "WayfindSyntheticMonitor/1.0 (+https://gowayfind.com)" }), LIVE],
  ["x-wf-synthetic header", H(`_fbp=${FBP}`, { "x-wf-synthetic": "1" }), LIVE],
  ["x-wayfind-qa header", H(`_fbp=${FBP}`, { "x-wayfind-qa": "1" }), LIVE],
  ["verifier UA", H(`_fbp=${FBP}`, { "user-agent": "Mozilla/5.0 WayfindVerify" }), LIVE],
  ["wf_synthetic cookie", H(`_fbp=${FBP}; wf_synthetic=1`), LIVE],
  ["Vercel preview", H(), { ...LIVE, VERCEL_ENV: "preview" }],
  ["Vercel development", H(), { ...LIVE, VERCEL_ENV: "development" }],
  ["no Vercel identity (local / CI)", H(), { ...LIVE, VERCEL_ENV: "" }],
  ["prebuild phase", H(), { ...LIVE, npm_lifecycle_event: "prebuild" }],
  ["guard suite env", H(), { ...LIVE, WF_GUARD_SUITE: "1" }],
]) {
  const f = mkFetch(async () => resp(200, okBody()));
  const r = await relay(humanProps, hdrs, e, f);
  ok(r.sent === false && r.reason === "suppressed" && f.calls.length === 0, `suppressed (${label}) => no fetch (got ${JSON.stringify(r)})`);
}
ok(M.serverEmitRefusal({ headers: H(), env: { VERCEL_ENV: "production" }, strict: true, argv: [] }) === null, "control: the shared predicate allows a clean production request");
ok(M.serverEmitRefusal({ headers: H(), env: { WF_SUPPRESS_ANALYTICS: "1" } }) === "analytics_suppressed", "the shared predicate covers WF_SUPPRESS_ANALYTICS (PostHog parity, non-strict)");

// malformed inputs never throw
for (const bad of [undefined, null, 5, "x", [], {}]) {
  const r = await C.relayPartnerHandoff({ event: "provider_redirect_started", properties: bad, headers: bad, env: LIVE, fetchImpl: mkFetch(async () => resp(200, okBody())), argv: [] });
  ok(r && r.sent === false, `malformed input ${JSON.stringify(bad)} resolves sent:false`);
}
ok((await C.relayPartnerHandoff()).sent === false, "no args resolves, never throws");

// delivery hardening
{
  const t0 = Date.now();
  const hang = mkFetch(() => new Promise(() => {}));
  const r = await C.sendCapi({ built: C.buildPartnerHandoff({ event: "provider_redirect_started", properties: humanProps, headers: H(), env: LIVE }), token: TOKEN, fetchImpl: hang, timeoutMs: 60 });
  ok(r.sent === false && r.reason === "timeout" && Date.now() - t0 < 1500, `a fetch that never resolves times out within bound (took ${Date.now() - t0}ms, ${JSON.stringify(r.reason)})`);
  ok(r.attempts === 2 && hang.calls.length === 2, "a timeout is retried exactly once");
  ok(hang.calls[0].init.body === hang.calls[1].init.body, "the retry re-sends the IDENTICAL payload (same event_id and event_time)");
  ok(hang.calls[0].body.data[0].event_id === hang.calls[1].body.data[0].event_id && hang.calls[0].body.data[0].event_time === hang.calls[1].body.data[0].event_time, "event_id and event_time unchanged on retry");
}
const built0 = () => C.buildPartnerHandoff({ event: "provider_redirect_started", properties: humanProps, headers: H(), env: LIVE, now: 1_731_400_000_000 });
const send = (f, extra = {}) => C.sendCapi({ built: built0(), token: TOKEN, fetchImpl: f, timeoutMs: 200, ...extra });
{
  let r = await send(mkFetch(async () => resp(200, JSON.stringify({ error: { code: 100, message: "Invalid parameter", fbtrace_id: "ErrTrace1" } }))));
  ok(r.sent === false && r.reason === "graph_error_100" && r.attempts === 1 && r.fbtrace_id === "ErrTrace1", `Graph error body on HTTP 200 => graph_error_100, no retry (got ${JSON.stringify(r)})`);
  r = await send(mkFetch(async () => resp(200, okBody(0))));
  ok(r.sent === false && r.reason === "zero_received" && r.events_received === 0, "events_received 0 is NOT success even on HTTP 200");
  r = await send(mkFetch(async () => resp(200, "{}")));
  ok(r.sent === false && r.reason === "zero_received", "HTTP 200 with no events_received is not success");
  r = await send(mkFetch(async () => resp(200, "not json")));
  ok(r.sent === false && r.reason === "bad_json", "unparseable 200 body => bad_json");
  r = await send(mkFetch(async () => resp(200, "")));
  ok(r.sent === false && r.reason === "bad_json", "empty 200 body => bad_json");
  let f = mkFetch(async () => resp(400, JSON.stringify({ error: { code: 190, message: "token" } })));
  r = await send(f);
  ok(r.reason === "graph_error_190" && f.calls.length === 1, "auth error 190 never retries");
  f = mkFetch(async () => resp(401, "")); r = await send(f);
  ok(r.reason === "http_401" && f.calls.length === 1, "HTTP 401 never retries");
  f = mkFetch(async () => resp(403, JSON.stringify({ error: { code: 10 } }))); r = await send(f);
  ok(r.reason === "graph_error_10" && f.calls.length === 1, "HTTP 403 never retries");
  f = mkFetch(async () => resp(400, "oops")); r = await send(f);
  ok(r.reason === "http_400" && f.calls.length === 1, "plain 4xx is classified http_400 and not retried");
  f = mkFetch(async (n) => (n === 1 ? resp(503, "") : resp(200, okBody()))); r = await send(f);
  ok(r.sent === true && r.attempts === 2 && f.calls.length === 2 && f.calls[0].init.body === f.calls[1].init.body, "5xx then success: one retry with the identical body");
  f = mkFetch(async () => resp(503, "")); r = await send(f);
  ok(r.sent === false && r.reason === "http_503" && f.calls.length === 2, "5xx twice: at most ONE retry");
  f = mkFetch(async (n) => { if (n === 1) throw new Error("ECONNRESET https://graph.facebook.com/?access_token=" + TOKEN); return resp(200, okBody()); }); r = await send(f);
  ok(r.sent === true && r.attempts === 2, "a network error is retried once");
  f = mkFetch(async () => { throw new Error("down " + TOKEN); }); r = await send(f);
  ok(r.sent === false && r.reason === "network" && f.calls.length === 2, "a persistent network error => network, two attempts");
  r = await C.sendCapi({ built: built0(), token: TOKEN, fetchImpl: mkFetch(async () => resp(200, okBody())), env: { META_GRAPH_VERSION: "v99.9" } });
  const u = (r, f2) => f2.calls[0].url;
  const fv = mkFetch(async () => resp(200, okBody()));
  await C.sendCapi({ built: built0(), token: TOKEN, fetchImpl: fv, env: { META_GRAPH_VERSION: "v22.0" } });
  ok(/\/v22\.0\//.test(fv.calls[0].url), "META_GRAPH_VERSION overrides the version when valid");
  const fv2 = mkFetch(async () => resp(200, okBody()));
  await C.sendCapi({ built: built0(), token: TOKEN, fetchImpl: fv2, env: { META_GRAPH_VERSION: "22" } });
  ok(fv2.calls[0].url.indexOf("/" + C.CAPI_VERSION + "/") > 0, "an invalid META_GRAPH_VERSION falls back to the default constant");
  ok(fv.calls[0].init.signal !== undefined, "the Graph POST carries an AbortSignal");
}

// distinct clicks -> distinct event ids; same click -> same
{
  const mk = (cid) => C.buildPartnerHandoff({ event: "provider_redirect_started", properties: { ...humanProps, click_id: cid }, headers: H(), env: LIVE }).payload.data[0].event_id;
  ok(mk("wf-click-0001") !== mk("wf-click-0002") && mk("wf-click-0001") === mk("wf-click-0001"), "distinct click_ids => distinct event_ids; same click_id => same event_id");
}

// sensitive-value guard with real id shapes from the codebase
for (const good of ["12345P1", "ice-gaylord", "gulf-coast-world-series-week-2026:rays-home", "ChIJN1t_tDeuEmsRUsoyG83frY4", "Z7r9jZ1A7eFQ_", "evt-1", "hotel-search"]) {
  ok(C.safeToken(good, "id") === good, `real content id shape passes: ${good}`);
}
for (const bad of ["a@b.co", "x?email=a@b.co", "9415551234", "941-555-1234", "a=b", "a%40b", "tel 9415551234", "orlando tour", "1234567", "https://x.co/a", ""]) {
  ok(C.safeToken(bad, "id") === "", `sensitive or free-text content id is dropped: ${JSON.stringify(bad)}`);
}
ok(C.safeToken("christmas_tickets") === "christmas_tickets" && C.safeToken("viator") === "viator", "normal provider / surface pass");
ok(C.safeToken("surface12345678") === "" && C.safeToken("a@b.co") === "", "a 7+ digit run in a provider/surface word is dropped");
ok(C.safeLandingPath("/christmas-in-florida") === "/christmas-in-florida" && C.safeLandingPath("/x/a@b.co") === "/" && C.safeLandingPath("/p/9415551234") === "/" && C.safeLandingPath("/a?b=1") === "/", "landing path: path only, '@' or 7+ digits fall back to /");

// token never appears in any result or console output
{
  const results = [];
  const fs_ = [
    mkFetch(async () => resp(200, okBody())),
    mkFetch(async () => resp(200, JSON.stringify({ error: { code: 190, message: "bad token " + TOKEN, fbtrace_id: "T" } }))),
    mkFetch(async () => { throw new Error("boom " + TOKEN); }),
    mkFetch(() => new Promise(() => {})),
  ];
  for (const f of fs_) results.push(await C.sendCapi({ built: built0(), token: TOKEN, fetchImpl: f, timeoutMs: 40 }));
  for (const e of [LIVE, QA_ENV]) results.push(await relay(e === QA_ENV ? qaProps : humanProps, e === QA_ENV ? qaH() : H(), e, mkFetch(async () => resp(200, okBody()))));
  ok(JSON.stringify(results).indexOf(TOKEN) < 0, "no returned object contains the access token");
  ok(logs.filter((l) => l.indexOf("[meta-capi]") === 0).length >= 8, "attempts log with the fixed [meta-capi] prefix");
  ok(logs.join("\n").indexOf(TOKEN) < 0 && logs.join("\n").indexOf("EAAB") < 0, "console output never contains the access token");
  const metaLines = logs.filter((l) => l.indexOf("[meta-capi]") === 0).join("\n");
  for (const needle of ["203.0.113.7", "Mozilla", FBP, FBC, "wf-abc123def456", "wf_ph_", "fbclid"]) ok(metaLines.indexOf(needle) < 0, `log lines never contain ${needle}`);
  ok(/outcome=\w+ reason=\S+ lane=(live|qa) provider=\S+ surface=\S+ http=\S+ received=\S+ fbtrace=\S+ attempt=\d/.test(metaLines.split("\n")[0]), "log lines have the fixed safe field set");
  // onResult carries the same safe summary
  const seen = [];
  await relay(humanProps, H(), LIVE, mkFetch(async () => resp(200, okBody())), { onResult: (x) => seen.push(x) });
  await relay(humanProps, H(), { ...LIVE, META_CAPI_CONSENT_POLICY: "" }, mkFetch(async () => resp(200, okBody())), { onResult: (x) => seen.push(x) });
  ok(seen.length === 2 && seen[0].outcome === "accepted" && seen[1].outcome === "skipped" && seen[1].consent_basis === "policy_blocked", "onResult reports accepted attempts and consent skips");
  const flat = JSON.stringify(seen);
  ok(flat.indexOf("wf-abc123def456") < 0 && flat.indexOf("203.0.113.7") < 0 && flat.indexOf(TOKEN) < 0 && flat.indexOf("Mozilla") < 0, "the recorded result carries no click id, IP, UA or token");
}

// Lead stays retired for every affiliate tap
{
  const P = await import("../lib/metaPixel.js");
  const N = await import("../lib/analytics.js");
  for (const e of N.AFFILIATE_EVENTS) ok(P.metaEventFor(e, {}) === null, `metaEventFor(${e}) is null (no browser Lead/conversion for an unverified tap)`);
  ok(P.metaEventFor("detail_open", {}).name === "ViewContent" && P.metaEventFor("save", {}).name === "AddToWishlist" && P.metaEventFor("signup_completed", {}).name === "CompleteRegistration", "ViewContent / AddToWishlist / CompleteRegistration unchanged");
}

for (const k of ["log", "warn", "info"]) console[k] = k === "log" ? realLog : console[k];

realLog(`test-meta-partner-handoff: OK — ${pass} assertions (consent policy default blocked + us_no_gpc matrix with LDU; QA lane triple condition; suppression parity; delivery: timeout, events_received, classified failures, one identical retry; token and identifiers never logged; PartnerHandoff only for human non-test handoffs from Meta-known browsers; closed key set; 5 partner routes reach the relay; Lead retired; ad + ad set ids survive landing -> cookie -> redirect event)`);
