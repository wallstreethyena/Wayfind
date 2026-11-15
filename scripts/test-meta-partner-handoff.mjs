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

const C = await import("../lib/metaCapi.js");
const A = await import("../lib/campaignAttribution.js");
const K = await import("../lib/commerce.js");

const FBP = "fb.1.1731400000000.123456789";
const FBC = "fb.1.1731400000000.IwAR0abcDEF_ghi-123";
const headers = (cookie, extra = {}) => {
  const h = { cookie, "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "x-forwarded-for": "203.0.113.7, 10.0.0.1", ...extra };
  return { get: (k) => h[k.toLowerCase()] ?? null };
};
const humanProps = {
  provider: "viator", surface: "christmas_tickets", content_id: "ice-gaylord", offer_id: "12345P1",
  click_id: "wf-abc123def456", traffic_class: "human", landing_path: "/christmas-in-florida",
  landing_campaign: "120253753342110067", landing_content: "120253875276390067", landing_term: "120253753342090067",
  landing_source: "meta", landing_click_type: "fbclid",
};

// ── 1 + 2 + 3: the happy path, exact shape ───────────────────────────────
const env = {};
let b = C.buildPartnerHandoff({ event: "provider_redirect_started", properties: humanProps, headers: headers(`_fbp=${FBP}; _fbc=${FBC}; ph_x=1`), env, now: 1_731_400_000_000 });
ok(b && !b.skip && b.payload && b.pixelId === "1424559705968711", `builds for a human handoff (got ${JSON.stringify(b && b.skip)})`);
const ev = b.payload.data[0];
ok(ev.event_name === "PartnerHandoff", "event name is PartnerHandoff");
ok(ev.event_id === "wf_ph_wf-abc123def456", "event_id is wf_ph_<click_id>");
ok(ev.action_source === "website" && ev.event_time === 1_731_400_000, "website action, seconds timestamp");
ok(ev.event_source_url === "https://www.gowayfind.com/christmas-in-florida", "source url = our host + landing PATH only");
const sameKeys = (o, want) => JSON.stringify(Object.keys(o).sort()) === JSON.stringify(want.slice().sort());
ok(sameKeys(ev, ["event_name", "event_time", "event_id", "action_source", "event_source_url", "user_data", "custom_data"]), "event carries exactly the 7 documented keys");
ok(sameKeys(ev.user_data, ["fbp", "fbc", "client_ip_address", "client_user_agent"]), `user_data is exactly fbp/fbc/ip/ua (got ${Object.keys(ev.user_data)})`);
ok(ev.user_data.client_ip_address === "203.0.113.7", "first forwarded IP only");
ok(sameKeys(ev.custom_data, ["content_type", "provider", "content_ids", "surface"]), `custom_data is exactly content_type/provider/content_ids/surface (got ${Object.keys(ev.custom_data)})`);
ok(!("value" in ev.custom_data) && !("currency" in ev.custom_data), "no value / currency: intent, not revenue");
ok(!("test_event_code" in b.payload), "no test code unless the env sets one");
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
const bt = C.buildPartnerHandoff({ event: "provider_redirect_started", properties: humanProps, headers: headers(`_fbp=${FBP}`), env: { META_CAPI_TEST_EVENT_CODE: "TEST12345" } });
ok(bt.payload.test_event_code === "TEST12345", "META_CAPI_TEST_EVENT_CODE routes to Events Manager test events");

// ── 4: the relay, executed with a mock fetch ─────────────────────────────
const posts = [];
const fetchImpl = async (url, init) => { posts.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200 }; };
let r = await C.relayPartnerHandoff({ event: "provider_redirect_started", properties: humanProps, headers: headers(`_fbp=${FBP}`), env: {}, fetchImpl });
ok(r.sent === false && r.reason === "capi_not_configured" && posts.length === 0, "dormant without a token: no request at all");
r = await C.relayPartnerHandoff({ event: "provider_redirect_started", properties: humanProps, headers: headers(`_fbp=${FBP}`), env: { META_CAPI_ACCESS_TOKEN: "tok_abc" }, fetchImpl });
ok(r.sent === true && posts.length === 1, `sends once with a token (got ${JSON.stringify(r)})`);
ok(/^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/1424559705968711\/events$/.test(posts[0].url), "posts to the live dataset's /events");
ok(posts[0].body.access_token === "tok_abc" && posts[0].body.data[0].event_name === "PartnerHandoff", "token in body, PartnerHandoff in data");
r = await C.relayPartnerHandoff({ event: "provider_redirect_started", properties: { ...humanProps, traffic_class: "automation" }, headers: headers(`_fbp=${FBP}`), env: { META_CAPI_ACCESS_TOKEN: "tok_abc" }, fetchImpl });
ok(r.sent === false && posts.length === 1, "a skipped event makes no request even with a token");
r = await C.relayPartnerHandoff({ event: "provider_redirect_started", properties: humanProps, headers: headers(`_fbp=${FBP}`), env: { META_CAPI_ACCESS_TOKEN: "tok" }, fetchImpl: async () => { throw new Error("down"); } });
ok(r.sent === false, "a network failure resolves, never throws");

// ── 5: every partner route reaches the relay ─────────────────────────────
const se = strip(read("lib/serverEvents.js"));
const bg = se.slice(se.indexOf("export function captureServerInBackground"));
ok(/relayPartnerHandoff\(\{\s*event,\s*properties:\s*o\.properties,\s*headers:\s*o\.headers\s*\}\)/.test(bg), "captureServerInBackground calls relayPartnerHandoff with the whitelisted properties + headers");
ok(/event === "provider_redirect_started" && !analyticsSuppressed\(\) && !isSyntheticMonitor\(/.test(bg), "the hook is limited to provider_redirect_started and honours the same suppression as PostHog");
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

console.log(`test-meta-partner-handoff: OK — ${pass} assertions (PartnerHandoff built only for human non-test handoffs from Meta-known browsers; exact 7/4/4 key shape; ${8} PII/label needles absent; dormant without token; 5 partner routes reach the relay; ad + ad set ids survive landing -> cookie -> redirect event)`);
