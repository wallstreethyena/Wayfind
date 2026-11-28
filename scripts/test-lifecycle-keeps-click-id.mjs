// test-lifecycle-keeps-click-id: a paid visitor (gclid, utm_campaign=wf_fl_search)
// who later lands from Wayfind's OWN push or lifecycle email link
// (utm_source=webpush / resend_lifecycle, no click id) keeps the click id in the
// wf_ad_ctx cookie the /api/*/go routes read, for clicks up to 30 days old,
// while the session snapshot describes ONLY the email/push visit. Every other
// UTM landing still replaces attribution as a complete snapshot (unchanged).
//
// CALL-BASED: drives every writer a full page load runs (GoogleTags:
// captureAttribution + syncAdClickCookieFromWindow; PostHogProvider:
// captureLanding + writeLandingCookie + syncAdClickCookieFromWindow; the
// link-decorating callers use captureAttribution's RETURN value) against a fake
// window, in BOTH orders (React runs the two sibling effects in tree order; the
// result must not depend on it), then reads the cookie back with the real
// readAdClickContextFromCookieHeader.
import { captureLanding, writeLandingCookie } from "../lib/campaignAttribution.js";
import { syncAdClickCookieFromWindow, readAdClickContextFromCookieHeader, encodeAdClickCookie } from "../lib/adClickCookie.js";
import { captureAttribution, isOwnLifecycleTouch, OWN_LIFECYCLE_SOURCES, LIFECYCLE_RETAIN_MAX_AGE_MS } from "../lib/attribution.js";

let passed = 0;
const fails = [];
const ok = (c, m) => { if (c) passed++; else fails.push(m); };

const mkStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
function mkWin(local, session, jar) {
  const win = { localStorage: local, sessionStorage: session, location: { protocol: "https:", search: "", pathname: "/" },
    crypto: { randomUUID: () => "11111111-2222-3333-4444-555555555555" }, document: { referrer: "" } };
  Object.defineProperty(win.document, "cookie", {
    get: () => [...jar].map(([k, v]) => k + "=" + v).join("; "),
    set: (s) => { const [kv] = s.split(";"); const i = kv.indexOf("="); const k = kv.slice(0, i).trim(); const v = kv.slice(i + 1); if (/Max-Age=0/.test(s)) jar.delete(k); else jar.set(k, v); },
  });
  return win;
}
// One full page load, every production writer. Returns captureAttribution's
// return value (what ExploreBridge / PaidLanding append to internal links).
function land(win, search, { order = "google-first", now, consent } = {}) {
  win.location.search = search;
  if (consent) win.__WF_CONSENT__ = consent; else delete win.__WF_CONSENT__;
  let returned = null;
  const google = () => { globalThis.window = win; try { returned = captureAttribution(search, now ? { now } : undefined); syncAdClickCookieFromWindow(win); } finally { delete globalThis.window; } };
  const posthog = () => { const landed = captureLanding({ search, pathname: "/", referrer: "", local: win.localStorage, session: win.sessionStorage }); writeLandingCookie(win.document, landed, true); syncAdClickCookieFromWindow(win); };
  if (order === "google-first") { google(); posthog(); } else { posthog(); google(); }
  return returned;
}
const ctxOf = (win) => readAdClickContextFromCookieHeader(win.document.cookie);
const sessRec = (win) => { try { return JSON.parse(win.sessionStorage.getItem("wf_sess_attr_v1") || "null"); } catch (e) { return null; } };

const PAID = "?gclid=TESTGCLID123&utm_source=google&utm_medium=cpc&utm_campaign=wf_fl_search&utm_term=orlando_tickets&utm_content=ad42";
const PUSH = "?utm_source=webpush&utm_medium=push&utm_campaign=itinerary_abandoned";
const MAIL = "?utm_source=resend_lifecycle&utm_medium=email&utm_campaign=itinerary_email";
const T0 = "2026-11-01T12:00:00.000Z";
const T1 = "2026-11-20T12:00:00.000Z"; // 19 days later
function run(first, second, opts = {}) {
  const local = mkStore(); const jar = new Map(); let session = mkStore();
  let win = mkWin(local, session, jar);
  if (first) land(win, first, { order: opts.order, now: opts.t0 || T0, consent: opts.consent1 });
  const firstCtx = ctxOf(win);
  if (opts.freshSession) { session = mkStore(); win = mkWin(local, session, jar); }
  const returned = land(win, second, { order: opts.order, now: opts.t1 || T1, consent: opts.consent2 });
  return { firstCtx, ctx: ctxOf(win), win, returned, legacy: JSON.parse(local.getItem("wf_attribution") || "null"), sess: sessRec(win) };
}

for (const order of ["google-first", "posthog-first"]) for (const fresh of [false, true]) {
  const tag = ` (${order}, ${fresh ? "new tab session" : "same session"})`;
  const push = run(PAID, PUSH, { freshSession: fresh, order });
  ok(push.firstCtx && push.firstCtx.gclid === "TESTGCLID123", "positive control: the paid landing did not put the gclid in wf_ad_ctx" + tag);
  ok(push.ctx && push.ctx.gclid === "TESTGCLID123", "a webpush landing dropped the paid gclid from wf_ad_ctx" + tag + ": " + JSON.stringify(push.ctx));
  ok(push.legacy && push.legacy.gclid === "TESTGCLID123" && push.legacy.utm_campaign === "wf_fl_search", "a webpush landing rewrote the paid attribution record" + tag + ": " + JSON.stringify(push.legacy));
  ok(push.sess && push.sess.p && push.sess.p.utm_source === "webpush", "the session record no longer says webpush" + tag + ": " + JSON.stringify(push.sess));
  // the cookie's session snapshot is the push visit only: no paid UTMs back-filled, no click type stamped
  const sa = push.ctx && push.ctx.session_attribution;
  ok(sa && sa.utm_source === "webpush" && sa.utm_campaign === "itinerary_abandoned" && !sa.utm_term && !sa.utm_content && !sa.ct, "the cookie's session snapshot mixed the old paid visit into the push visit" + tag + ": " + JSON.stringify(sa));
  // link decorators get THIS landing's params, never the old paid ones
  ok(push.returned && push.returned.utm_source === "webpush" && !push.returned.gclid && push.returned.utm_campaign === "itinerary_abandoned", "captureAttribution returned the old paid params, so internal links would re-emit them" + tag + ": " + JSON.stringify(push.returned));

  const mail = run(PAID, MAIL, { freshSession: fresh, order });
  ok(mail.ctx && mail.ctx.gclid === "TESTGCLID123", "a resend_lifecycle landing dropped the paid gclid" + tag);

  // negative controls: unchanged last-touch behaviour
  const other = run(PAID, "?utm_source=newsletter&utm_medium=email&utm_campaign=weekly", { freshSession: fresh, order });
  ok(other.ctx && !other.ctx.gclid && other.legacy && other.legacy.utm_source === "newsletter", "a non-lifecycle UTM landing no longer replaces attribution" + tag + ": " + JSON.stringify(other.ctx));
  const newer = run(PAID, "?gclid=NEWERGCLID456&utm_source=google&utm_medium=cpc&utm_campaign=other", { freshSession: fresh, order });
  ok(newer.ctx && newer.ctx.gclid === "NEWERGCLID456", "a newer paid click did not replace the older gclid" + tag);
  const pushWithClick = run(PAID, "?gclid=PUSHGCLID789&utm_source=webpush&utm_medium=push&utm_campaign=x", { freshSession: fresh, order });
  ok(pushWithClick.ctx && pushWithClick.ctx.gclid === "PUSHGCLID789", "a webpush landing carrying its own click id did not replace the older one" + tag);
}
// gbraid-only and wbraid-only paid records are kept the same way
for (const k of ["gbraid", "wbraid"]) {
  const r = run(`?${k}=BRAID${k}&utm_source=google&utm_medium=cpc&utm_campaign=wf_fl_search`, MAIL);
  ok(r.ctx && r.ctx[k] === "BRAID" + k && !r.ctx.gclid, `a ${k}-only paid record was not kept: ` + JSON.stringify(r.ctx && { g: r.ctx.gclid, v: r.ctx[k] }));
}
// age bound: a click older than 30 days is replaced exactly as before; 30 days exactly is kept
{
  const old = run(PAID, MAIL, { t0: "2026-09-09T12:00:00.000Z", t1: "2026-11-28T12:00:00.000Z" });
  ok(old.ctx && !old.ctx.gclid && old.legacy && old.legacy.utm_source === "resend_lifecycle", "an 80 day old click id was retained past the 30 day bound: " + JSON.stringify(old.legacy));
  const edgeT1 = new Date(Date.parse(T0) + LIFECYCLE_RETAIN_MAX_AGE_MS).toISOString();
  const edge = run(PAID, MAIL, { t1: edgeT1 });
  ok(edge.ctx && edge.ctx.gclid === "TESTGCLID123", "a click exactly 30 days old was not retained");
  const over = run(PAID, MAIL, { t1: new Date(Date.parse(T0) + LIFECYCLE_RETAIN_MAX_AGE_MS + 60000).toISOString() });
  ok(over.ctx && !over.ctx.gclid, "a click 30 days and one minute old was retained");
}
// an organic visitor whose first touch is our push records webpush normally
{
  const r = run(null, PUSH);
  ok(r.legacy && r.legacy.utm_source === "webpush" && !(r.ctx && r.ctx.gclid), "an organic visitor's first webpush landing was not recorded: " + JSON.stringify(r.legacy));
}
// consent is read at write time, never carried: GRANTED on the paid landing, DENIED (or absent) on the return
for (const second of [{ ad_user_data: "DENIED", ad_personalization: "DENIED" }, undefined]) {
  const r = run(PAID, PUSH, { consent1: { ad_user_data: "GRANTED", ad_personalization: "GRANTED" }, consent2: second });
  ok(r.firstCtx && r.firstCtx.consent_ad_user_data === "GRANTED", "positive control: the paid landing's GRANTED consent was not written");
  const want = second ? "DENIED" : "UNKNOWN";
  ok(r.ctx && r.ctx.gclid === "TESTGCLID123" && r.ctx.consent_ad_user_data === want && r.ctx.consent_ad_personalization === want, `consent was carried from the paid landing instead of read now (want ${want}): ` + JSON.stringify(r.ctx && { u: r.ctx.consent_ad_user_data, p: r.ctx.consent_ad_personalization }));
}
// the predicate, and the encoder's own copy of the source list behaves identically (adClickCookie runs server side and imports nothing)
ok(OWN_LIFECYCLE_SOURCES.length === 2 && OWN_LIFECYCLE_SOURCES.includes("webpush") && OWN_LIFECYCLE_SOURCES.includes("resend_lifecycle"), "OWN_LIFECYCLE_SOURCES changed");
ok(isOwnLifecycleTouch({ utm_source: "webpush" }) && isOwnLifecycleTouch({ utm_source: "Resend_Lifecycle" }), "isOwnLifecycleTouch missed an own source");
ok(!isOwnLifecycleTouch({ utm_source: "webpush", gclid: "x" }) && !isOwnLifecycleTouch({ utm_source: "google" }) && !isOwnLifecycleTouch({}) && !isOwnLifecycleTouch(null), "isOwnLifecycleTouch accepted a non-lifecycle record");
for (const src of [...OWN_LIFECYCLE_SOURCES, "Resend_Lifecycle", "newsletter"]) {
  const enc = encodeAdClickCookie({ sessionRecord: { v: 1, at: T1, p: { utm_source: src, utm_medium: "email" } }, legacyRecord: { gclid: "G9", utm_source: "google", utm_term: "t9", landed_at: T0 }, visitorNonce: "v_11111111222233334444555555555555" });
  const d = readAdClickContextFromCookieHeader("wf_ad_ctx=" + enc);
  const own = isOwnLifecycleTouch({ utm_source: src });
  ok(d && Boolean(d.session_attribution && d.session_attribution.utm_term) === !own, `encoder and isOwnLifecycleTouch disagree on "${src}": ` + JSON.stringify(d && d.session_attribution));
}

if (fails.length) { console.log("test-lifecycle-keeps-click-id: FAIL\n  - " + fails.join("\n  - ")); process.exit(1); }
console.log(`test-lifecycle-keeps-click-id: OK, ${passed} assertions (every landing writer CALLED in both effect orders on a fake window, cookie read back by the real reader; webpush/resend_lifecycle keep a paid click id up to 30 days with a clean session snapshot and own-param link decoration; every other UTM, any newer click id and any older click still replace it; consent read at write time)`);
