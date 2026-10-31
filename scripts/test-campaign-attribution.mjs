#!/usr/bin/env node
/**
 * test-campaign-attribution — CALLS the attribution / test-marker / Meta custom
 * event / CAPI dedupe code (2026-10-29). No regex over source.
 *   1. capture: allow-list, PII refusal, first touch kept (90 d), session overwritten
 *   2. test marker (?wf_test) tags events; verifier UAs excluded, real UAs not
 *   3. commerce_cta_clicked payload shape + single fire per activation
 *   4. Meta OutboundTicketClick: custom event, eventID, gating
 *   5. CAPI: same event_name + event_id as the browser call, test_event_code, mock fetch
 */
const fail = [];
let pass = 0;
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };

const A = await import("../lib/campaignAttribution.js");
const B = await import("../lib/browserAnalytics.js");
const C = await import("../lib/commerce.js");
const K = await import("../lib/metaCapi.js");
const P = await import("../lib/partnerClick.js");
const DAY = 86400000;
const T0 = Date.UTC(2026, 9, 29);

// 1. capture ---------------------------------------------------------------
const p = A.parseCampaign("?utm_source=ig&utm_medium=paid&utm_campaign=halloween&utm_content=reel1&utm_term=boo&fbclid=IwAR1&gclid=g1&ttclid=t1&email=a%40b.com&q=secret&utm_x=1");
ok(Object.keys(p).sort().join() === "fbclid,gclid,ttclid,utm_campaign,utm_content,utm_medium,utm_source,utm_term", "parseCampaign keeps exactly the 8 allow-listed params: " + Object.keys(p));
ok(!("email" in p) && !("q" in p), "unlisted params (email, q) never captured");
ok(Object.keys(A.parseCampaign("?utm_source=a%40b.com&utm_campaign=" + "x".repeat(201))).length === 0, "email-shaped and over-long values refused");

const local = mem(); const session = mem();
let st = A.captureLanding({ search: "?utm_source=ig&utm_campaign=halloween&fbclid=F1&secret=1", pathname: "/halloween-in-florida", referrer: "https://l.instagram.com/?u=x&token=zzz", local, session, now: T0 });
ok(st.ft.p.utm_campaign === "halloween" && !("fbclid" in st.ft.p) && st.ft.ct === "fbclid", "first touch stored: campaign kept, click-id VALUE dropped, only its type (fbclid) kept");
ok(!/F1/.test(local._m.get(A.FIRST_TOUCH_KEY)) && /F1/.test(session._m.get(A.SESSION_KEY)), "the 90-day localStorage record never holds a click-id value; the tab session may");
ok(st.ft.lp === "/halloween-in-florida" && st.ft.rd === "l.instagram.com", "landing path (no query) and referrer HOST only");
const raw = local._m.get(A.FIRST_TOUCH_KEY) + session._m.get(A.SESSION_KEY);
ok(!/token|zzz|secret|\?/.test(raw), "stored JSON holds no query string, referrer token, or unlisted param");
st = A.captureLanding({ search: "?utm_source=tiktok&utm_campaign=other&ttclid=T9", pathname: "/guides/x", referrer: "", local, session, now: T0 + DAY });
ok(st.ft.p.utm_campaign === "halloween" && st.ft.ct === "fbclid" && !st.ft.p.ttclid, "first touch KEPT after a later campaign landing");
ok(st.sess.p.utm_campaign === "other" && st.sess.p.ttclid === "T9" && st.sess.lp === "/guides/x", "session attribution overwritten by the later landing");
st = A.captureLanding({ search: "", pathname: "/p/abc", local, session, now: T0 + 2 * DAY });
ok(st.sess.p.utm_campaign === "other", "param-less navigation does not erase session attribution");
const freshSession = mem();
st = A.captureLanding({ search: "", pathname: "/", local, session: freshSession, now: T0 + 3 * DAY });
ok(st.sess && !st.sess.p.utm_campaign && st.ft.p.utm_campaign === "halloween", "new session starts clean while first touch persists");
st = A.captureLanding({ search: "?utm_campaign=late", pathname: "/", local: Object.assign(mem(), { _m: new Map(local._m) }), session: mem(), now: T0 + 91 * DAY });
ok(st.ft.p.utm_campaign === "late", "first touch expires after 90 days and is replaced");
const l2 = mem(); A.captureLanding({ search: "", pathname: "/", local: l2, session: mem(), now: T0 });
st = A.captureLanding({ search: "?utm_campaign=paid1", pathname: "/", local: l2, session: mem(), now: T0 + DAY });
ok(st.ft.p.utm_campaign === "paid1", "a no-campaign first visit never blocks the first CAMPAIGN touch");
st = A.captureLanding({ search: "?utm_campaign=paid2", pathname: "/", local: l2, session: mem(), now: T0 + 2 * DAY });
ok(st.ft.p.utm_campaign === "paid1", "once a campaign first touch exists it is immutable");
const props = A.attributionProps(A.readState({ local, session, now: T0 + 3 * DAY }));
ok(props.wf_ft_utm_source === "ig" && !("wf_ft_fbclid" in props) && props.wf_ft_click_type === "fbclid" && props.wf_ft_landing_path === "/halloween-in-florida" && props.wf_sess_utm_source === "tiktok", "wf_ft_* (no click-id values) and wf_sess_* flat props");
{
  // returning direct visitor: first touch from an old campaign, empty session => landing_* empty, first_touch_* set
  const lr = mem(); A.captureLanding({ search: "?utm_source=ig&utm_campaign=old_reel", pathname: "/", local: lr, session: mem(), now: T0 });
  const st2 = A.captureLanding({ search: "", pathname: "/halloween-in-florida", local: lr, session: mem(), now: T0 + 5 * DAY });
  const lp2 = A.landingProps(st2);
  ok(!("landing_campaign" in lp2) && !("landing_source" in lp2) && lp2.first_touch_campaign === "old_reel" && lp2.first_touch_source === "ig" && lp2.landing_path === "/halloween-in-florida", "a returning direct visit is NOT labelled with the old campaign as its landing: " + JSON.stringify(lp2));
  // OutboundTicketClick only for ticket sellers
  const calls = []; const winT = { fbq: (...a) => calls.push(a) };
  const tix = A.fireOutboundTicketClick({ win: winT, payload: { provider: "viator", surface: "halloween_haunts", content_id: "x1", click_id: "cid-tix-1" }, state: {} });
  const coupon = A.fireOutboundTicketClick({ win: winT, payload: { provider: "clipp", surface: "guide_deals", content_id: "c1", click_id: "cid-cp-1" }, state: {} });
  const stay = A.fireOutboundTicketClick({ win: winT, payload: { provider: "stay22", surface: "hotel_booking", click_id: "cid-st-1" }, state: {} });
  ok(tix.fired && !coupon.fired && coupon.skipped === "not_ticket" && !stay.fired && calls.length === 1, "OutboundTicketClick fires for a ticket seller only, never for a coupon or a stay");
}
ok(Object.keys(A.attributionProps(st, "ft")).every((k) => k.startsWith("wf_ft_")) && Object.keys(A.attributionProps(st, "sess")).every((k) => k.startsWith("wf_sess_")), "which=ft|sess split");

// 2. test marker + checker exclusion ------------------------------------------
const ts = mem();
st = A.captureLanding({ search: "?wf_test=qa-oct29&wf_meta_test=TEST12345", pathname: "/", local: mem(), session: ts, now: T0 });
ok(st.test === "qa-oct29" && st.metaTest === "TEST12345", "wf_test and wf_meta_test stored for the session");
const tp = A.testProps(st);
ok(tp.is_test === true && tp.wf_test === "qa-oct29", "testProps => is_test=true, wf_test=<label>");
globalThis.sessionStorage = ts;
const san = B.sanitizeAnalyticsProperties({ $current_url: "https://www.gowayfind.com/halloween-in-florida?utm_source=ig&fbclid=F1", x: 1 });
ok(san.is_test === true && san.wf_test === "qa-oct29" && san.x === 1, "sanitize_properties tags EVERY event with is_test + wf_test");
ok(san.$current_url === "https://www.gowayfind.com/halloween-in-florida", "sanitize still strips the query from $current_url");
A.captureLanding({ search: "?wf_test=off", pathname: "/", local: mem(), session: ts, now: T0 });
ok(!("is_test" in B.sanitizeAnalyticsProperties({ a: 1 })), "wf_test=off clears the marker");
ts.setItem("wf_test_v1", "bad label <x>");
ok(!("is_test" in B.sanitizeAnalyticsProperties({ a: 1 })), "malformed label is ignored");
globalThis.sessionStorage = mem();
ok(!("is_test" in B.sanitizeAnalyticsProperties({ a: 1 })), "no marker => untagged (legit visitors untouched)");
const chrome = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const desk = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
ok(B.analyticsSuppressionReason({ storage: mem(), userAgent: "Mozilla/5.0 WayfindVerify" }) === "internal", "WayfindVerify UA excluded browser side");
ok(B.analyticsSuppressionReason({ storage: mem(), userAgent: "node" }) === "internal", "bare node UA excluded browser side");
ok(B.analyticsSuppressionReason({ storage: mem(), userAgent: chrome }) === null && B.analyticsSuppressionReason({ storage: mem(), userAgent: desk }) === null, "real iPhone Safari and desktop Chrome UAs NOT excluded");
ok(B.analyticsSuppressionReason({ storage: mem(), userAgent: "Mozilla/5.0 nodejs-tools Chrome/130" }) === null && B.isInternalVerifierUA("Mozilla/5.0 Node/22 Chrome") === false, "no substring match on 'node' (explicit marker only)");

// 3. payload shape + single fire --------------------------------------------------
const caps = []; const fbq = [];
const mkWin = (extra = {}) => {
  const w = { posthog: { capture: (e, pr) => caps.push([e, pr]) }, fbq: (...a) => fbq.push(a), localStorage: mem(), sessionStorage: mem(), navigator: { userAgent: desk }, location: { pathname: "/halloween-in-florida" }, ...extra };
  return w;
};
const win = mkWin();
A.captureLanding({ search: "?utm_source=ig&utm_medium=paid&utm_campaign=halloween&fbclid=F1", pathname: "/halloween-in-florida", local: win.localStorage, session: win.sessionStorage, now: Date.now() });
A.installBridge(win);
const card = { getAttribute: (k) => (k === "data-rank" ? "3" : null), closest: () => null };
const link = { closest: (sel) => (sel.startsWith("a[href]") ? { closest: (s) => (s === "[data-rank]" ? card : null) } : null) };
win.event = { target: link };
global.window = win; global.document = {};
const ctx = { surface: "halloween_haunts", provider: "organizer", merchant: "hauntedevents.example", content_id: "haunt-1", offer_id: "haunt-1", click_id: "11111111-2222-3333-4444-555555555555" };
ok(C.emitCommerce("commerce_cta_clicked", ctx) === true, "first activation captured");
ok(C.emitCommerce("commerce_cta_clicked", { ...ctx, click_id: "99999999-2222-3333-4444-555555555555" }) === false, "double activation (new click_id, same offer, <1s) dropped");
ok(caps.length === 1, "exactly ONE commerce_cta_clicked for one activation, got " + caps.length);
const ev = caps[0] && caps[0][1];
ok(ev && ev.surface === "halloween_haunts" && ev.provider === "organizer" && ev.merchant === "hauntedevents.example" && ev.content_id === "haunt-1", "payload: surface, seller (provider/merchant), event id");
ok(ev && ev.landing_campaign === "halloween" && ev.landing_source === "ig" && ev.landing_medium === "paid" && ev.landing_click_type === "fbclid" && ev.landing_path === "/halloween-in-florida", "payload: landing campaign + path");
ok(ev && ev.position === 3, "payload: placement position from data-rank");
ok(ev && !("fbclid" in ev) && !JSON.stringify(ev).includes("F1"), "payload never carries the raw click id value");
console.log("  sample payload:", JSON.stringify(ev));
ok(C.emitCommerce("commerce_cta_clicked", { ...ctx, offer_id: "haunt-2", content_id: "haunt-2" }) === true && caps.length === 2, "a different offer inside the window is its own activation");
// 4. Meta -------------------------------------------------------------------------
const meta = fbq.filter((a) => a[1] === "OutboundTicketClick");
ok(meta.length === 2, "one OutboundTicketClick per accepted activation (2 offers), got " + meta.length);
const m0 = meta[0];
ok(m0[0] === "trackCustom" && m0[1] === "OutboundTicketClick", "custom event name via trackCustom");
ok(JSON.stringify(m0[2]) === JSON.stringify({ content_type: "event", surface: "halloween_haunts", seller: "hauntedevents.example", content_ids: ["haunt-1"] }), "custom_data {content_ids,content_type,seller,surface}: " + JSON.stringify(m0[2]));
ok(m0[3] && m0[3].eventID === "wf_otc_11111111-2222-3333-4444-555555555555", "eventID derived from click_id");
ok(!fbq.some((a) => a[0] === "track" || "value" in (a[2] || {}) || "currency" in (a[2] || {})), "never a standard event (Purchase/Lead), never value/currency");
// gating
const wT = mkWin(); wT.fbq = (...a) => fbq.push(a);
const sT = { test: "qa", metaTest: null };
const before = fbq.length;
ok(A.fireOutboundTicketClick({ win: wT, payload: ctx, state: sT }).skipped === "test_traffic" && fbq.length === before, "test-marked traffic without a Meta test code never fires");
const rel = [];
const rT = A.fireOutboundTicketClick({ win: wT, payload: { ...ctx, click_id: "abcdefgh-1" }, state: { test: "qa", metaTest: "TEST12345" }, relay: (b) => rel.push(b) });
ok(rT.fired && rel.length === 1 && rel[0].test_event_code === "TEST12345" && rel[0].event_id === rT.eventID, "test + wf_meta_test fires and relays test_event_code with the same event_id");
const rT2 = A.fireOutboundTicketClick({ win: wT, payload: { ...ctx, click_id: "abcdefgh-1" }, state: {} });
ok(rT2.fired && rT2.eventID === rT.eventID + "_1", "a later click reusing a click_id gets its own eventID (counted, not deduped away)");
ok(A.fireOutboundTicketClick({ win: { }, payload: ctx, state: {} }).skipped === "no_fbq", "no fbq => skipped, no throw");
// suppressed session emits nothing, so no Meta either
const wS = mkWin(); wS.navigator = { userAgent: "node" }; wS.__WF_ATTR = undefined;
A.installBridge(wS); global.window = wS; const capsBefore = caps.length; const fbqBefore = fbq.length; wS.fbq = (...a) => fbq.push(a);
ok(C.emitCommerce("commerce_cta_clicked", { ...ctx, offer_id: "x9", content_id: "x9" }) === false && caps.length === capsBefore && fbq.length === fbqBefore, "verifier UA: no PostHog capture and no Meta event");
global.window = win;

// 5. CAPI ---------------------------------------------------------------------------
const calls = [];
const mockFetch = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return { ok: true, status: 200 }; };
const built = K.buildCapiPayload({ body: rel[0], ip: "203.0.113.5", userAgent: desk, fbp: "fb.1.1700000000.123", fbc: "fb.1.1700000000.AbC-1", sourceUrl: "https://www.gowayfind.com/halloween-in-florida", now: T0 });
const res = await K.sendCapi({ built, token: "TOKEN", fetchImpl: mockFetch });
const sent = calls[0] && calls[0].body;
ok(res.sent && calls.length === 1 && /graph\.facebook\.com\/v[\d.]+\/1424559705968711\/events$/.test(calls[0].url), "CAPI posts to the pixel's /events endpoint");
ok(sent.data[0].event_name === "OutboundTicketClick", "CAPI event_name === browser event name");
ok(sent.data[0].event_id === rel[0].event_id && rel[0].event_id === rT.eventID, "CAPI event_id === browser eventID (Meta dedupes on name + id)");
ok(sent.test_event_code === "TEST12345", "wf_meta_test forwarded as test_event_code");
ok(!("value" in sent.data[0].custom_data) && !("currency" in sent.data[0].custom_data) && sent.data[0].action_source === "website", "no value/currency, action_source website");
ok(Object.keys(sent.data[0].user_data).sort().join() === "client_ip_address,client_user_agent,fbc,fbp", "user_data limited to ip, ua, fbp, fbc (no email/hash)");
ok(K.buildCapiPayload({ body: { ...rel[0], event_name: "Purchase" } }) === null && K.buildCapiPayload({ body: { event_name: "OutboundTicketClick", event_id: "x" } }) === null, "relay refuses any other event name / bad event_id");
const calls0 = calls.length;
ok((await K.sendCapi({ built, token: "", fetchImpl: mockFetch })).reason === "capi_not_configured" && calls.length === calls0, "no token => nothing sent (dormant)");

// env-gated branches exercised with the flag ON and OFF (CLAUDE.md revenue rule 1)
{
  const route = await import("../app/api/meta/capi/route.js");
  const mkReq = (ua) => new Request("https://www.gowayfind.com/api/meta/capi", { method: "POST", headers: { "user-agent": ua, "content-type": "application/json", cookie: "_fbp=fb.1.1700000000.123", "x-forwarded-for": "203.0.113.9" }, body: JSON.stringify({ ...rel[0], source_path: "/halloween-in-florida" }) });
  const realFetch = globalThis.fetch; const hits = [];
  globalThis.fetch = async (u, i) => { hits.push({ u, body: JSON.parse(i.body) }); return { ok: true, status: 200 }; };
  delete process.env.META_CAPI_ACCESS_TOKEN;
  ok((await route.POST(mkReq(desk))).status === 204 && hits.length === 0, "route: no token => 204, nothing sent");
  process.env.META_CAPI_ACCESS_TOKEN = "T";
  const r1 = await route.POST(mkReq(desk));
  ok(r1.status === 200 && hits.length === 1 && hits[0].body.data[0].event_id === rel[0].event_id && hits[0].body.test_event_code === "TEST12345" && hits[0].body.data[0].user_data.fbp === "fb.1.1700000000.123", "route: token ON => one Graph call, same event_id, test_event_code, fbp from cookie");
  ok((await route.POST(mkReq("node"))).status === 204 && (await route.POST(mkReq("Mozilla/5.0 WayfindVerify"))).status === 204 && hits.length === 1, "route: verifier UAs never relayed");
  delete process.env.META_CAPI_ACCESS_TOKEN; globalThis.fetch = realFetch;
  const posted = [];
  const wR = mkWin(); wR.fetch = (u, i) => { posted.push({ u, body: JSON.parse(i.body) }); return Promise.resolve({}); };
  const bOn = A.installBridge(wR, { relayEnabled: true }); wR.event = null;
  bOn.afterClick("commerce_cta_clicked", { ...ctx, click_id: "relay-click-1" });
  ok(posted.length === 1 && posted[0].u === "/api/meta/capi" && posted[0].body.event_id === "wf_otc_relay-click-1", "client relay ON posts the same eventID to /api/meta/capi");
  const wO = mkWin(); wO.fetch = () => { posted.push("off"); return Promise.resolve({}); };
  A.installBridge(wO, { relayEnabled: false }).afterClick("commerce_cta_clicked", { ...ctx, click_id: "relay-click-2" });
  ok(posted.length === 1, "client relay OFF posts nothing (browser only)");
}

// organizer plan (event detail off-site link)
const po = P.planOrganizerClick({ href: "https://tickets.example.org/e/1?utm=x", locationHost: "www.gowayfind.com", surface: "florida_event_page", contentId: "slug-1", mint: () => "wf-abc12345" });
ok(po && po.ctx.provider === "organizer" && po.ctx.merchant === "tickets.example.org" && po.ctx.content_id === "slug-1", "planOrganizerClick shape");
ok(P.planOrganizerClick({ href: "/api/commerce/go?x=1", locationHost: "www.gowayfind.com", mint: () => "wf-abc12345" }) === null && P.planOrganizerClick({ href: "javascript:alert(1)", locationHost: "x.com", mint: () => "a" }) === null, "own-host and non-http links are not organizer clicks");

// structural: the event-detail page mounts the beacon once (and never beside CrownOutbound's own emitter)
{
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../app/florida-events/[slug]/page.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
  ok((src.match(/<CommerceClickBeacon[\s/>]/g) || []).length === 1, "florida-events/[slug] mounts CommerceClickBeacon exactly once");
  ok(/crownTracked \? <CrownOutbound slug=\{params\.slug\} \/> : <CommerceClickBeacon surface="florida_event_page" \/>/.test(src), "beacon and CrownOutbound are mutually exclusive (no double emitter on a Crown page)");
  ok(/"data-wf-outbound-ticket": "organizer"/.test(src), "organizer ticket link opts in to the beacon");
}

// 6. landing cookie -> SERVER redirect event (the event that always fires) -----
{
  const lc = mem(); const sc = mem();
  const st = A.captureLanding({ search: "?utm_source=instagram&utm_medium=paid_social&utm_campaign=hw.fl-2026&fbclid=IwAR9&wf_test=qa_1", pathname: "/halloween-in-florida", referrer: "https://l.instagram.com/", local: lc, session: sc, now: T0 });
  const v = A.landingCookieValue(st);
  ok(v && v.indexOf("IwAR9") < 0, "cookie never carries the click id VALUE: " + v);
  const doc = { cookie: "" };
  A.writeLandingCookie(doc, st, true);
  ok(/^wf_attr=[^;]+; Path=\/; SameSite=Lax; Secure$/.test(doc.cookie), "session cookie, Path=/, Lax, Secure: " + doc.cookie);
  const back = A.landingFromCookieHeader("_ga=1; " + doc.cookie.split(";")[0] + "; other=2");
  ok(back.landing_campaign === "hw.fl-2026" && back.landing_source === "instagram" && back.landing_medium === "paid_social" && back.landing_click_type === "fbclid" && back.landing_path === "/halloween-in-florida", "cookie round-trips campaign, source, medium, click type, path: " + JSON.stringify(back));
  ok(back.is_test === true && back.wf_test === "qa_1", "wf_test label rides to the server event as is_test");
  const evil = A.landingFromCookieHeader("wf_attr=c~a%40b.com|p~https%3A%2F%2Fevil|zz~1|s~" + encodeURIComponent("<script>"));
  ok(Object.keys(evil).length === 0, "email, non-path, unknown key and markup refused server side: " + JSON.stringify(evil));
  ok(Object.keys(A.landingFromCookieHeader("")).length === 0 && Object.keys(A.landingFromCookieHeader(null)).length === 0, "no cookie => no props");
  const clear = { cookie: "" }; A.writeLandingCookie(clear, { ft: null, sess: null, test: null }, true);
  ok(/Max-Age=0/.test(clear.cookie), "nothing to store => cookie cleared");
  const red = C.commercePayload("provider_redirect_started", { provider: "viator", surface: "halloween_haunts", click_id: "wf-1", traffic_class: "human", ...back });
  ok(red.landing_campaign === "hw.fl-2026" && red.landing_click_type === "fbclid" && red.is_test === true && red.traffic_class === "human", "commercePayload keeps landing fields on provider_redirect_started");
  const imp = C.commercePayload("commerce_impression", { provider: "viator", surface: "x", ...back });
  ok(!("landing_campaign" in imp) && !("is_test" in imp), "landing fields stay off impressions");
  const bad = C.commercePayload("provider_redirect_started", { provider: "viator", fbclid: "IwAR9", utm_source: "x", email: "a@b.com" });
  ok(!("fbclid" in bad) && !("utm_source" in bad) && !("email" in bad), "raw click ids / unlisted fields still dropped");
}

// 7. every go route on disk stamps the landing cookie onto its redirect events
{
  const { readFileSync, readdirSync, existsSync } = await import("node:fs");
  const apiDir = new URL("../app/api/", import.meta.url);
  const routes = [];
  for (const d of readdirSync(apiDir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const f = new URL(d.name + "/go/route.js", apiDir);
    if (existsSync(f)) routes.push(d.name);
  }
  ok(routes.length >= 4, "found the go routes (positive control): " + routes.join(","));
  for (const r of routes) {
    const src = readFileSync(new URL(r + "/go/route.js", apiDir), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
    const n = (src.match(/commercePayload\(event, \{[^}]*\.\.\.landingFromCookieHeader\(req\.headers\.get\("cookie"\)\)/g) || []).length;
    ok(n === 1, "/api/" + r + "/go emit() stamps landingFromCookieHeader exactly once (found " + n + ")");
    ok(/import \{ landingFromCookieHeader \} from "..\/..\/..\/..\/lib\/campaignAttribution\.js"/.test(src), "/api/" + r + "/go imports landingFromCookieHeader");
  }
}

if (fail.length) { console.error(`✗ test-campaign-attribution: ${fail.length} failure(s)`); for (const f of fail) console.error("  - " + f); process.exit(1); }
console.log(`✓ test-campaign-attribution: ${pass} assertions (capture, first touch/session, test marker, verifier exclusion, payload, single fire, Meta custom event, CAPI dedupe via mock fetch)`);
