// lib/reengageOrchestrate.js — SERVER-ONLY. Turns facts about a visitor into queue
// rows, and stops queued messages when the visitor has already done the thing.
//
//   handleSignal           POST /api/reengage/signal: record the signal, queue push
//   suppressOnConversion   an outbound partner click: stop pending rows, queue a drop
//   enqueuePush            one push row, idempotent (ignore-duplicates on the anon key)
//   hasActivePushSub       is there a live subscription for this anonymous id
//   cancelScheduledResendEmail   belt: cancel a Resend email that was scheduled
//   pushMessageFor         the ONE place a push title, body, url and tag are made
//   withUtm                the ONE writer of utm_* on a message link
//
// RULES THIS FILE KEEPS
//   * Every message string is made here from server data. Nothing the browser sent
//     (a path is matched against an allow list, a planRef is looked up server side)
//     becomes text. No offer id, no query, no place name from the browser.
//   * No message link points at /api/<provider>/go. withUtm refuses any /api/ path
//     except the two reengage ones, so a partner redirect can never ride in a push
//     or an email. The conversion seam never touches a redirect.
//   * The address never appears here. Push endpoints are never opened here.
//   * Every function takes its stores and fetch as arguments and never throws.
import { sbEnv, cget } from "./serverCache.js";
import { noDashes } from "./newsletter.js";
import { SITE_URL } from "./site.js";
import { siteTodayStr } from "./siteTime.js";
import {
  ANON_ID_RX, PLAN_REF_RX, planSnapshotKey, reengageConfigured, sanitizePlan,
} from "./reengageServer.js";

export const T_QUEUE = "wf_reengage_queue";
export const T_SIGNALS = "wf_reengage_signals";
export const T_PUSH_SUBS = "wf_reengage_push_subs";
export const T_CONTACTS = "wf_reengage_contacts";
export const T_SUPPRESS = "wf_reengage_suppressions";

export const SIGNAL_KINDS = Object.freeze(["itinerary_generated", "hub_view", "return_visit"]);
export const PATH_RX = /^\/[A-Za-z0-9/_-]{0,119}$/;
export const HUB_PATH_RX = /^\/(christmas-in-florida(\/[a-z0-9-]+)?|guides\/[a-z0-9-]+)$/;
export const ANON_COOKIE = "wf_anon_id";
const ANON_CONFLICT = "anon_id,contact_id,trigger_type,channel,step,dedupe_key";
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const OPEN_API_PATHS = new Set(["/api/reengage/open", "/api/reengage/unsubscribe"]);
const PUSH_DELAY_MS = Object.freeze({ itinerary_abandoned: 30 * MIN, affiliate_drop: 24 * HOUR, hub_browse: 24 * HOUR });
export const RETURN_GRACE_MS = 30 * MIN;

/** One PostgREST call. `cache: "no-store"` always: two identical writes must both reach the server. */
export function sbRest(sb, path, init = {}, fetchImpl = fetch) {
  return fetchImpl(`${sb.url}/rest/v1/${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
    ...init,
    headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

/** The wf_anon_id cookie value when it is a well formed id, else null. Reads nothing else. */
export function anonIdFromCookieHeader(header) {
  const m = /(?:^|;\s*)wf_anon_id=([^;\s]*)/.exec(String(header || ""));
  return m && ANON_ID_RX.test(m[1]) ? m[1] : null;
}

// ── links ───────────────────────────────────────────────────────────────────

const CHANNEL_UTM = Object.freeze({
  push: { utm_source: "webpush", utm_medium: "push" },
  email: { utm_source: "resend_lifecycle", utm_medium: "email" },
});

/**
 * The single UTM writer. Returns "<path>?utm_source=..&utm_medium=..&utm_campaign=<flow>" or null.
 * Null for a non path, a protocol relative path, an unknown channel or flow, and ANY
 * path under /api/ except the two reengage ones (so no /api/<provider>/go link can be built).
 */
export function withUtm(path, flow, channel) {
  try {
    const utm = CHANNEL_UTM[channel];
    if (!utm || typeof flow !== "string" || !/^[a-z][a-z_]{0,39}$/.test(flow)) return null;
    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;
    const u = new URL(path, "https://link.invalid");
    if (u.origin !== "https://link.invalid") return null;
    if (u.pathname.startsWith("/api/") && !OPEN_API_PATHS.has(u.pathname)) return null;
    for (const [k, v] of Object.entries({ ...utm, utm_campaign: flow })) u.searchParams.set(k, v);
    return u.pathname + u.search;
  } catch { return null; }
}

/** A page path the browser or a Referer may name: the 3.3 rule, never an API path. */
export function landingPath(p) {
  return typeof p === "string" && PATH_RX.test(p) && !p.startsWith("/api/") ? p : null;
}

function refererPath(referer) {
  try {
    const ref = new URL(String(referer || ""));
    const site = new URL(SITE_URL);
    const ours = new Set([site.hostname, "gowayfind.com", "www.gowayfind.com"]);
    return ours.has(ref.hostname) ? landingPath(ref.pathname) : null;
  } catch { return null; }
}

// ── message content (server strings only) ───────────────────────────────────

const flowOf = (trigger) => (trigger === "affiliate_drop" ? "affiliate_drop" : trigger === "hub_browse" ? "hub_browse" : "itinerary_abandoned");
const cleanName = (v) => {
  const t = noDashes(typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) : "");
  return t.includes("@") ? "" : t;
};

/**
 * Pure. { title, body, url, tag } for a queue row, or null when the row cannot make a valid
 * message. `tag` is always `wf-reengage-<flow>` (so the service worker never falls back to the
 * daily pick tag). `url` is a same origin path plus UTM. No @ ever appears in any field.
 */
export function pushMessageFor(row) {
  try {
    const trigger = row && row.trigger_type;
    const p = (row && row.payload) || {};
    const flow = flowOf(trigger);
    let title; let body; let path;
    if (trigger === "itinerary_abandoned") {
      const name = cleanName(p.areaName);
      const stops = Number.isInteger(p.stops) && p.stops >= 1 && p.stops <= 30 ? p.stops : null;
      if (!stops) return null;
      title = name ? `Your ${name} plan is saved` : "Your Wayfind plan is saved";
      body = `${stops} ${stops === 1 ? "stop" : "stops"} with directions. Tap to pick up where you left off.`;
      path = "/plan-my-day";
    } else if (trigger === "affiliate_drop") {
      title = "Still planning your trip?";
      body = "Your picks are saved. Pick up where you left off.";
      path = landingPath(p.path) || "/";
    } else if (trigger === "hub_browse") {
      const hubPath = typeof p.path === "string" && p.path.length <= 100 && HUB_PATH_RX.test(p.path) ? p.path : null;
      if (!hubPath || (p.hub !== "christmas" && p.hub !== "guide")) return null;
      title = p.hub === "christmas" ? "Still planning Christmas in Florida?" : "Pick up the guide you were reading";
      body = "Dates and directions are one tap away.";
      path = hubPath;
    } else return null;
    const url = withUtm(path, flow, "push");
    if (!url) return null;
    const msg = { title, body, url, tag: `wf-reengage-${flow}` };
    return JSON.stringify(msg).includes("@") ? null : msg;
  } catch { return null; }
}

/** The three follow up email steps: subject and intro (campaign is the flow). Pure. */
export function emailStepFor(step, areaName) {
  const where = cleanName(areaName);
  const s = Number(step);
  if (s === 1) return { campaign: "itinerary_abandoned", subject: where ? `Directions for your ${where} plan` : "Directions for your Wayfind plan", intro: "Your stops and directions are saved. Open any stop when you are ready to go." };
  if (s === 2) return { campaign: "itinerary_abandoned", subject: where ? `Still going to ${where}? Your plan is one tap away` : "Still going? Your plan is one tap away", intro: "Your plan is one tap away. Directions are ready for every stop." };
  if (s === 3) return { campaign: "itinerary_abandoned", subject: where ? `Last note about your ${where} plan` : "Last note about your Wayfind plan", intro: "This is the last note about this plan. It stays saved if you want to pick it up." };
  return null;
}

// ── queue writes ────────────────────────────────────────────────────────────

/** { ok, active }: an active push subscription (revoked_at is null) exists for the anon id. Fails closed. */
export async function hasActivePushSub(anonId, { sb = sbEnv(), fetchImpl = fetch } = {}) {
  try {
    if (!sb || !ANON_ID_RX.test(String(anonId || ""))) return { ok: false, active: false };
    const r = await sbRest(sb, `${T_PUSH_SUBS}?anon_id=eq.${anonId}&revoked_at=is.null&select=id&limit=1`, {}, fetchImpl);
    if (!r.ok) return { ok: false, active: false };
    const rows = await r.json().catch(() => null);
    return Array.isArray(rows) ? { ok: true, active: rows.length > 0 } : { ok: false, active: false };
  } catch { return { ok: false, active: false }; }
}

/** One push row, step 0. Idempotent on the anon key. Returns { ok }. Never throws. */
export async function enqueuePush({ anonId, trigger, dedupeKey, payload, now = Date.now() }, { sb = sbEnv(), fetchImpl = fetch } = {}) {
  try {
    if (!sb || !ANON_ID_RX.test(String(anonId || "")) || !Object.hasOwn(PUSH_DELAY_MS, trigger)) return { ok: false };
    const key = String(dedupeKey || "");
    if (!key || key.length > 120) return { ok: false };
    const row = {
      anon_id: anonId, contact_id: null, trigger_type: trigger, channel: "push", step: 0, dedupe_key: key,
      payload: { v: 1, flow: flowOf(trigger), ...payload }, scheduled_for: new Date(now + PUSH_DELAY_MS[trigger]).toISOString(), status: "pending",
    };
    if (!pushMessageFor(row)) return { ok: false };
    const r = await sbRest(sb, `${T_QUEUE}?on_conflict=${ANON_CONFLICT}`, {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(row),
    }, fetchImpl);
    return { ok: r.ok };
  } catch { return { ok: false }; }
}

/** Insert one wf_reengage_signals row. meta is `{ planRef }` or `{}`. */
export async function recordSignal(anonId, kind, path, meta, { sb = sbEnv(), fetchImpl = fetch } = {}) {
  try {
    if (!sb || !ANON_ID_RX.test(String(anonId || "")) || !(SIGNAL_KINDS.includes(kind) || kind === "out_click")) return { ok: false };
    const r = await sbRest(sb, T_SIGNALS, {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ anon_id: anonId, kind, path: landingPath(path), meta: meta && PLAN_REF_RX.test(String(meta.planRef || "")) ? { planRef: meta.planRef } : {} }),
    }, fetchImpl);
    return { ok: r.ok };
  } catch { return { ok: false }; }
}

/** Belt (decision D2): cancel a Resend email that was scheduled. Never throws. */
export async function cancelScheduledResendEmail(emailId, { env = process.env, fetchImpl = fetch } = {}) {
  try {
    const key = String(env.RESEND_API_KEY || "").trim();
    if (!key || !/^[A-Za-z0-9-]{1,120}$/.test(String(emailId || ""))) return { ok: false };
    const r = await fetchImpl(`https://api.resend.com/emails/${emailId}/cancel`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    });
    return { ok: !!(r && r.ok) };
  } catch { return { ok: false }; }
}

/**
 * The visitor made an outbound partner click (a human provider_redirect_started). A no-op
 * returning before any call when re-engagement is not configured. Never throws.
 *  1 stop every pending row EXCEPT the affiliate_drop (the drop is queued by step 4)
 *  2 belt: cancel any of them that holds a Resend email id
 *  3 record the out_click signal
 *  4 queue the affiliate_drop push, only for a visitor with an active subscription
 */
export async function suppressOnConversion(anonId, { referer = "", sb = sbEnv(), env = process.env, fetchImpl = fetch, now = Date.now() } = {}) {
  try {
    if (!reengageConfigured({ env, sb }) || !ANON_ID_RX.test(String(anonId || ""))) return { ok: false, skipped: true };
    const out = { ok: true, suppressed: 0 };
    try {
      const r = await sbRest(sb, `${T_QUEUE}?anon_id=eq.${anonId}&status=eq.pending&trigger_type=neq.affiliate_drop&select=id,channel,resend_email_id`, {
        method: "PATCH", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ status: "suppressed_converted", cancelled_reason: "converted" }),
      }, fetchImpl);
      const rows = r.ok ? await r.json().catch(() => null) : null;
      if (Array.isArray(rows)) {
        out.suppressed = rows.length;
        for (const row of rows) if (row && row.resend_email_id) await cancelScheduledResendEmail(row.resend_email_id, { env, fetchImpl });
      }
    } catch { out.ok = false; }
    await recordSignal(anonId, "out_click", null, {}, { sb, fetchImpl });
    const sub = await hasActivePushSub(anonId, { sb, fetchImpl });
    if (sub.ok && sub.active) {
      await enqueuePush({ anonId, trigger: "affiliate_drop", dedupeKey: siteTodayStr(new Date(now)), payload: { path: refererPath(referer) || "/" }, now }, { sb, fetchImpl });
    }
    return out;
  } catch { return { ok: false }; }
}

/**
 * One client signal. The route has already validated the cookie, kind and shapes; this
 * records it and queues what it implies. Never throws, never reveals what was queued.
 */
export async function handleSignal({ anonId, kind, path = null, planRef = null }, { sb = sbEnv(), env = process.env, fetchImpl = fetch, now = Date.now(), cgetImpl = cget } = {}) {
  try {
    if (!reengageConfigured({ env, sb }) || !ANON_ID_RX.test(String(anonId || "")) || !SIGNAL_KINDS.includes(kind)) return { ok: false };
    const ref = kind === "itinerary_generated" && PLAN_REF_RX.test(String(planRef || "")) ? planRef : null;
    await recordSignal(anonId, kind, path, ref ? { planRef: ref } : {}, { sb, fetchImpl });
    if (kind === "itinerary_generated" && ref) {
      const hit = await cgetImpl(planSnapshotKey(ref)).catch(() => null);
      const plan = sanitizePlan(hit && hit.v);
      if (!plan) return { ok: true };
      const sub = await hasActivePushSub(anonId, { sb, fetchImpl });
      if (!sub.ok || !sub.active) return { ok: true };
      const stops = plan.days.reduce((n, d) => n + d.stops.length, 0);
      await enqueuePush({ anonId, trigger: "itinerary_abandoned", dedupeKey: ref, payload: { path: "/plan-my-day", planRef: ref, areaName: plan.areaName, stops, when: plan.when }, now }, { sb, fetchImpl });
    } else if (kind === "hub_view") {
      const p = typeof path === "string" && path.length <= 100 && HUB_PATH_RX.test(path) ? path : null;
      if (!p) return { ok: true };
      const sub = await hasActivePushSub(anonId, { sb, fetchImpl });
      if (!sub.ok || !sub.active) return { ok: true };
      await enqueuePush({ anonId, trigger: "hub_browse", dedupeKey: siteTodayStr(new Date(now)).slice(0, 7) + ":" + p, payload: { path: p, hub: p.startsWith("/guides/") ? "guide" : "christmas" }, now }, { sb, fetchImpl });
    } else if (kind === "return_visit") {
      // Only rows older than the grace window: a second hub view is usually ALSO a return visit and
      // boot sends both, in either order. A fresh row must survive its own page load.
      const before = encodeURIComponent(new Date(now - RETURN_GRACE_MS).toISOString());
      await sbRest(sb, `${T_QUEUE}?anon_id=eq.${anonId}&status=eq.pending&trigger_type=in.(affiliate_drop,hub_browse)&created_at=lt.${before}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "cancelled", cancelled_reason: "returned" }),
      }, fetchImpl);
    }
    return { ok: true };
  } catch { return { ok: false }; }
}
