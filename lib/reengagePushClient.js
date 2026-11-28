// lib/reengagePushClient.js: the browser half of re-engagement PUSH. LAZY ONLY.
//
// First load JS budget (scripts/check-bundle.mjs has about 2 KB of headroom):
// nothing in app/layout.js, ReengageMount.js or lib/reengageClient.js may import
// this file. app/components/reengageBoot.js loads it with import(), and only when
// this build was cut with NEXT_PUBLIC_WF_REENGAGE_PUSH=1 as well as
// NEXT_PUBLIC_WF_REENGAGE=1. With the push flag unset, none of this runs and no
// new request is ever made.
//
// What it does:
//   shouldOfferPush  pure truth table: may the soft ask show right now?
//   pushMode         "push" (this browser can take Web Push), "a2hs" (an iPhone or
//                    iPad browser tab, where push needs Add to Home Screen first)
//                    or null
//   enableReengagePush  the Yes path: permission, subscribe, POST, flag, signal
//   sendSignal       tells the server one of three facts (never an address, never
//                    free text): itinerary_generated, hub_view, return_visit
//
// What it never holds: the endpoint and keys go to the server in one POST body and
// nowhere else. The browser keeps two booleans (wf_reengage_flags) and a day stamp.
// Opted out visitors (Global Privacy Control, analytics suppression) get nothing.
import {
  PLAN_REF_RX, PUSH_ASK_COOLDOWN_MS, freshDraft, markPushAsked, optedOut, reengageEnabled, reengageEvent, setFlag,
} from "./reengageClient.js";
import { base64UrlToUint8Array, webPushSupported } from "./webPushClient.js";
import { canAlert, deviceTimeZone, readAlertLedger, recordAlert, writeAlertLedger } from "./alertPolicy.js";

export const HUB_PATH_RX = /^\/(christmas-in-florida(\/[a-z0-9-]+)?|guides\/[a-z0-9-]+)$/;
export const SIGNAL_PATH_RX = /^\/[A-Za-z0-9/_-]{0,119}$/;
export const SIGNAL_KINDS = Object.freeze(["itinerary_generated", "hub_view", "return_visit"]);
export const PLATFORMS = Object.freeze(["desktop", "android", "ios_pwa", "other"]);
export const SW_URL = "/wf-push-sw.js";
export const PROMPT_CTX_KEY = "__WF_REENGAGE_PUSH_CTX";

const finite = (n) => (typeof n === "number" && Number.isFinite(n) ? n : null);

/** The push half is dark unless this build was cut with NEXT_PUBLIC_WF_REENGAGE_PUSH=1. */
export function pushFlagEnabled() {
  try { return process.env.NEXT_PUBLIC_WF_REENGAGE_PUSH === "1"; } catch (e) { return false; }
}

function vapidPublicKey() {
  try { return String(process.env.NEXT_PUBLIC_WF_VAPID_PUBLIC_KEY || ""); } catch (e) { return ""; }
}

export function nativePlatform(win) {
  try { return !!(win && win.Capacitor && win.Capacitor.isNativePlatform && win.Capacitor.isNativePlatform()); } catch (e) { return true; }
}

function isIos(nav) {
  const ua = String((nav && nav.userAgent) || "");
  return /iPhone|iPad|iPod/.test(ua) || (nav && nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
}

function standalone(win) {
  try {
    if (win.navigator && win.navigator.standalone === true) return true;
    return !!(typeof win.matchMedia === "function" && win.matchMedia("(display-mode: standalone)").matches);
  } catch (e) { return false; }
}

/** An iPhone or iPad browser TAB (Safari, not Chrome, Firefox or an in app browser), not an installed web app. */
export function iosSafariNonStandalone(win) {
  try {
    const nav = (win && win.navigator) || {};
    if (!isIos(nav)) return false;
    if (/CriOS|FxiOS|FBAN|Instagram/.test(String(nav.userAgent || ""))) return false;
    return !standalone(win);
  } catch (e) { return false; }
}

/** "push" | "a2hs" | null. The iOS helper needs a configured push key, or it would promise something this site cannot send. */
export function pushMode(win) {
  try {
    if (!win || nativePlatform(win)) return null;
    if (webPushSupported(win)) return "push";
    return vapidPublicKey() && iosSafariNonStandalone(win) ? "a2hs" : null;
  } catch (e) { return null; }
}

/** What the server stores next to the subscription. An installed iOS web app is "ios_pwa". */
export function platformOf(win) {
  try {
    const nav = (win && win.navigator) || {};
    const ua = String(nav.userAgent || "");
    if (isIos(nav)) return standalone(win) ? "ios_pwa" : "other";
    if (/Android/i.test(ua)) return "android";
    return /Mobile|Tablet/i.test(ua) ? "other" : "desktop";
  } catch (e) { return "other"; }
}

/**
 * May the soft ask show right now? Pure: every input is in the arguments, so a
 * test can flip each condition alone. Nine conditions, all must hold:
 *   1 not opted out            ctx.optedOut === false
 *   2 both build flags         ctx.reengageOn and ctx.pushOn
 *   3 no push opt in yet       flags.hasPushOptIn is not true
 *   4 a trigger                a fresh draft plus ctx.itinerarySeen, or a hub path with hubViews >= 2
 *   5 permission not denied    ctx.permission
 *   6 no ask in 21 days        state.pushAskedAt
 *   7 the shared alert rules   canAlert(ctx.ledger, { now, tz }): quiet hours and one alert a day
 *   8 return banner not shown  ctx.bannerShown === false
 *   9 not the native app       ctx.native === false
 * Anything missing fails closed.
 */
export function shouldOfferPush(state, flags, ctx) {
  const c = ctx || {};
  if (!state || !flags || typeof c.now !== "number" || !Number.isFinite(c.now)) return false;
  if (c.optedOut !== false) return false;
  if (c.reengageOn !== true || c.pushOn !== true) return false;
  if (flags.hasPushOptIn === true) return false;
  if (!offerKind(state, c)) return false;
  if (c.permission === "denied") return false;
  if (finite(state.pushAskedAt) !== null && c.now - state.pushAskedAt < PUSH_ASK_COOLDOWN_MS) return false;
  if (!canAlert(c.ledger, { now: c.now, tz: c.tz }).ok) return false;
  if (c.bannerShown !== false) return false;
  if (c.native !== false) return false;
  return true;
}

/** "itinerary" when a fresh plan was just built, "hub" on a hub page from the second view, else null. */
export function offerKind(state, ctx) {
  const c = ctx || {};
  if (!state || typeof c.now !== "number") return null;
  if (c.itinerarySeen === true && freshDraft(state, c.now)) return "itinerary";
  if (typeof c.path === "string" && HUB_PATH_RX.test(c.path) && (finite(state.hubViews) || 0) >= 2) return "hub";
  return null;
}

function permissionOf(win) {
  try { return win && win.Notification ? String(win.Notification.permission) : "unsupported"; } catch (e) { return "unsupported"; }
}

function storageOf(win) {
  try { return (win && win.localStorage) || null; } catch (e) { return null; }
}

/** Every input shouldOfferPush needs, read from the window. `extra` overrides (itinerarySeen, bannerShown, now). */
export function pushContext(win, extra) {
  return {
    now: Date.now(),
    tz: deviceTimeZone(),
    optedOut: optedOut(win),
    reengageOn: reengageEnabled(),
    pushOn: pushFlagEnabled(),
    permission: permissionOf(win),
    ledger: readAlertLedger(storageOf(win)),
    native: nativePlatform(win),
    path: String((win && win.location && win.location.pathname) || "/"),
    bannerShown: false,
    itinerarySeen: false,
    ...(extra || {}),
  };
}

/**
 * The whole offer decision in one call: { kind, mode, trigger } or null. `trigger`
 * is what the prompt needs and nothing else: { planRef } for a plan, { path } for a hub.
 */
export function offerFor(win, state, flags, extra) {
  const ctx = pushContext(win, extra);
  if (!shouldOfferPush(state, flags, ctx)) return null;
  const mode = pushMode(win);
  if (!mode) return null;
  const kind = offerKind(state, ctx);
  const trigger = kind === "itinerary" ? { planRef: state.draft.planRef } : { path: ctx.path };
  return { kind, mode, trigger };
}

/** Showing the ask counts as an alert (shared daily cap) and as the one ask in 21 days. */
export function noteAskShown(win, now = Date.now()) {
  if (!win || optedOut(win)) return false;
  const st = storageOf(win);
  writeAlertLedger(recordAlert(readAlertLedger(st), { now, tz: deviceTimeZone() }), st);
  markPushAsked(win, now);
  return true;
}

/** One fact for the server. The three kinds only; a plan reference only on itinerary_generated; a path only when it is a plain path. */
export function sendSignal(win, kind, extra) {
  try {
    if (!pushFlagEnabled() || !reengageEnabled()) return false;
    if (!win || typeof win.fetch !== "function" || optedOut(win) || !SIGNAL_KINDS.includes(kind)) return false;
    const e = extra || {};
    const body = { kind };
    if (typeof e.path === "string" && SIGNAL_PATH_RX.test(e.path)) body.path = e.path;
    if (kind === "itinerary_generated") {
      if (typeof e.planRef !== "string" || !PLAN_REF_RX.test(e.planRef)) return false;
      body.planRef = e.planRef;
    }
    const p = win.fetch("/api/reengage/signal", {
      method: "POST", keepalive: true, credentials: "same-origin",
      headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    if (p && typeof p.catch === "function") p.catch(() => {});
    return true;
  } catch (err) { return false; }
}

const fail = (code) => ({ ok: false, code });

/**
 * The Yes path, called from a real click. Order matters and is locked by a test:
 * service worker, existing subscription, permission (only when it is still
 * "default"), subscribe (only when there is none), POST, flag, signal resend.
 * A subscription this call created is removed again if the server refuses it; one
 * that was already there (a member's daily picks) is never touched.
 * deps: { kind: "itinerary" | "hub", trigger: { planRef } | { path }, vapidKey }
 */
export async function enableReengagePush(win, deps) {
  const d = deps || {};
  const kind = d.kind === "hub" ? "hub" : "itinerary";
  let created = null;
  try {
    if (!pushFlagEnabled() || !reengageEnabled() || !win || optedOut(win)) return fail("unavailable");
    if (pushMode(win) !== "push") return fail("unsupported");
    const key = String(d.vapidKey || vapidPublicKey());
    if (!key) return fail("unsupported");
    const sw = win.navigator.serviceWorker;
    const reg = await sw.register(SW_URL, { scope: "/" });
    try { await sw.ready; } catch (e) { /* the registration is enough to subscribe */ }
    const existing = await reg.pushManager.getSubscription();
    if (permissionOf(win) === "default") {
      const perm = await win.Notification.requestPermission();
      if (perm !== "granted") {
        reengageEvent(win, "reengage_push_denied", { kind, surface: "push" });
        return fail(perm === "denied" ? "denied" : "dismissed");
      }
    } else if (permissionOf(win) !== "granted") {
      reengageEvent(win, "reengage_push_denied", { kind, surface: "push" });
      return fail("denied");
    }
    let sub = existing;
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(key) });
      created = sub;
    }
    const res = await win.fetch("/api/reengage/push", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON(), tz: deviceTimeZone() || "America/New_York", platform: platformOf(win) }),
    });
    if (!res || !res.ok) {
      if (created) { try { await created.unsubscribe(); } catch (e) { /* best effort */ } }
      return fail("server");
    }
    setFlag("hasPushOptIn", true, win);
    reengageEvent(win, "reengage_push_granted", { kind, surface: "push" });
    const t = d.trigger || {};
    if (typeof t.planRef === "string") sendSignal(win, "itinerary_generated", { planRef: t.planRef });
    else if (typeof t.path === "string") sendSignal(win, "hub_view", { path: t.path });
    return { ok: true, code: "enabled" };
  } catch (err) {
    if (created) { try { await created.unsubscribe(); } catch (e) { /* best effort */ } }
    return fail("error");
  }
}
