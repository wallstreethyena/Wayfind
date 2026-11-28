// test-lifecycle-keeps-click-id: a paid visitor (gclid, utm_campaign=wf_fl_search)
// who later lands from Wayfind's OWN push or lifecycle email link
// (utm_source=webpush / resend_lifecycle, no click id) keeps the gclid in the
// wf_ad_ctx cookie the /api/*/go routes read, while the session record still
// says webpush so the re-engagement flow can be measured. Every other UTM
// landing still replaces attribution as a complete snapshot (unchanged).
//
// CALL-BASED: drives EVERY writer production runs on a full page load
// (captureLanding + writeLandingCookie + syncAdClickCookieFromWindow from
// PostHogProvider, then captureAttribution + syncAdClickCookieFromWindow from
// GoogleTags) against a fake window, then reads the cookie back with the real
// readAdClickContextFromCookieHeader.
import { captureLanding, writeLandingCookie } from "../lib/campaignAttribution.js";
import { syncAdClickCookieFromWindow, readAdClickContextFromCookieHeader } from "../lib/adClickCookie.js";
import { captureAttribution, isOwnLifecycleTouch, OWN_LIFECYCLE_SOURCES } from "../lib/attribution.js";

let passed = 0;
const fails = [];
const ok = (c, m) => { if (c) passed++; else fails.push(m); };

const mkStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
function mkWin(local, session, jar, consent) {
  const win = { localStorage: local, sessionStorage: session, location: { protocol: "https:", search: "", pathname: "/" },
    crypto: { randomUUID: () => "11111111-2222-3333-4444-555555555555" }, document: { referrer: "" } };
  if (consent) win.__WF_CONSENT__ = consent;
  Object.defineProperty(win.document, "cookie", {
    get: () => [...jar].map(([k, v]) => k + "=" + v).join("; "),
    set: (s) => { const [kv] = s.split(";"); const i = kv.indexOf("="); const k = kv.slice(0, i).trim(); const v = kv.slice(i + 1); if (/Max-Age=0/.test(s)) jar.delete(k); else jar.set(k, v); },
  });
  return win;
}
// One full page load, every production writer, in production order.
function land(win, search) {
  win.location.search = search;
  const landed = captureLanding({ search, pathname: "/", referrer: "", local: win.localStorage, session: win.sessionStorage });
  writeLandingCookie(win.document, landed, true);
  syncAdClickCookieFromWindow(win);
  globalThis.window = win;
  try { captureAttribution(search); syncAdClickCookieFromWindow(win); } finally { delete globalThis.window; }
}
const ctxOf = (win) => readAdClickContextFromCookieHeader(win.document.cookie);
const sessSource = (win) => { try { const r = JSON.parse(win.sessionStorage.getItem("wf_sess_attr_v1") || "null"); return r && ((r.params && r.params.utm_source) || r.utm_source || r.source) || JSON.stringify(r); } catch (e) { return null; } };

const PAID = "?gclid=TESTGCLID123&utm_source=google&utm_medium=cpc&utm_campaign=wf_fl_search";
function run(second, opts = {}) {
  const local = mkStore(); const jar = new Map(); let session = mkStore();
  let win = mkWin(local, session, jar, opts.consent);
  if (!opts.organicFirst) land(win, PAID);
  const first = ctxOf(win);
  if (opts.freshSession) { session = mkStore(); win = mkWin(local, session, jar, opts.consent); }
  land(win, second);
  return { first, ctx: ctxOf(win), win, legacy: JSON.parse(local.getItem("wf_attribution") || "null") };
}

for (const fresh of [false, true]) {
  const tag = fresh ? " (new tab session)" : " (same session)";
  // positive control: the first landing put the gclid in the cookie
  const push = run("?utm_source=webpush&utm_medium=push&utm_campaign=itinerary_abandoned", { freshSession: fresh });
  ok(push.first && push.first.gclid === "TESTGCLID123", "positive control: the paid landing did not put the gclid in wf_ad_ctx" + tag);
  ok(push.ctx && push.ctx.gclid === "TESTGCLID123", "a webpush landing dropped the paid gclid from wf_ad_ctx" + tag + ": " + JSON.stringify(push.ctx));
  ok(push.legacy && push.legacy.gclid === "TESTGCLID123" && push.legacy.utm_campaign === "wf_fl_search", "a webpush landing rewrote the paid attribution record" + tag + ": " + JSON.stringify(push.legacy));
  ok(/webpush/.test(String(sessSource(push.win))), "the session record no longer says webpush, so the flow cannot be measured" + tag + ": " + sessSource(push.win));

  const mail = run("?utm_source=resend_lifecycle&utm_medium=email&utm_campaign=itinerary_email", { freshSession: fresh });
  ok(mail.ctx && mail.ctx.gclid === "TESTGCLID123", "a resend_lifecycle landing dropped the paid gclid" + tag);

  // negative controls: unchanged last-touch behaviour for every other source
  const other = run("?utm_source=newsletter&utm_medium=email&utm_campaign=weekly", { freshSession: fresh });
  ok(other.ctx && !other.ctx.gclid && other.legacy && other.legacy.utm_source === "newsletter", "a non-lifecycle UTM landing no longer replaces attribution (behaviour must be unchanged)" + tag + ": " + JSON.stringify(other.ctx));
  const newer = run("?gclid=NEWERGCLID456&utm_source=google&utm_medium=cpc&utm_campaign=other", { freshSession: fresh });
  ok(newer.ctx && newer.ctx.gclid === "NEWERGCLID456", "a newer paid click did not replace the older gclid" + tag);
  const pushWithClick = run("?gclid=PUSHGCLID789&utm_source=webpush&utm_medium=push&utm_campaign=x", { freshSession: fresh });
  ok(pushWithClick.ctx && pushWithClick.ctx.gclid === "PUSHGCLID789", "a webpush landing carrying its own click id did not replace the older one" + tag);
}
// an organic visitor whose first touch is our push: the record stores webpush normally
{
  const r = run("?utm_source=webpush&utm_medium=push&utm_campaign=itinerary_abandoned", { organicFirst: true });
  ok(r.legacy && r.legacy.utm_source === "webpush" && !(r.ctx && r.ctx.gclid), "an organic visitor's first webpush landing was not recorded: " + JSON.stringify(r.legacy));
}
// consent is read at write time, never carried: a now-denied visitor's cookie says denied
{
  const r = run("?utm_source=webpush&utm_medium=push&utm_campaign=itinerary_abandoned", { consent: { ad_user_data: "DENIED", ad_personalization: "DENIED" } });
  ok(r.ctx && r.ctx.consent_ad_user_data === "DENIED" && r.ctx.consent_ad_personalization === "DENIED", "the cookie did not reflect the visitor's current denied consent: " + JSON.stringify(r.ctx && { u: r.ctx.consent_ad_user_data, p: r.ctx.consent_ad_personalization }));
}
// the predicate itself
ok(OWN_LIFECYCLE_SOURCES.length === 2 && OWN_LIFECYCLE_SOURCES.includes("webpush") && OWN_LIFECYCLE_SOURCES.includes("resend_lifecycle"), "OWN_LIFECYCLE_SOURCES changed");
ok(isOwnLifecycleTouch({ utm_source: "webpush" }) && isOwnLifecycleTouch({ utm_source: "Resend_Lifecycle" }), "isOwnLifecycleTouch missed an own source");
ok(!isOwnLifecycleTouch({ utm_source: "webpush", gclid: "x" }) && !isOwnLifecycleTouch({ utm_source: "google" }) && !isOwnLifecycleTouch({}) && !isOwnLifecycleTouch(null), "isOwnLifecycleTouch accepted a non-lifecycle record");

if (fails.length) { console.log("test-lifecycle-keeps-click-id: FAIL\n  - " + fails.join("\n  - ")); process.exit(1); }
console.log(`test-lifecycle-keeps-click-id: OK, ${passed} assertions (every production landing writer CALLED on a fake window, cookie read back by the real reader; webpush/resend_lifecycle keep a paid gclid, every other UTM and any newer click id still replace it)`);
