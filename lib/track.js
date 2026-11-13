// lib/track.js — the one-call tracker for surfaces OUTSIDE the app shell.
//
// app/home.js has its own logEvent (PostHog + the Supabase events table + the
// Google bridge). Standalone pages like the paid landing route have no Supabase
// client and no logEvent in scope, so they use this instead.
//
// The contract that matters: ONE call here produces AT MOST one PostHog capture
// and one Google forward. Never call this and logEvent for the same action —
// that is precisely the double-count this indirection exists to prevent.
import { forwardToGoogle } from "./analytics";
import { forwardToMeta } from "./metaPixel";
import { attributionParams } from "./attribution";
import { noteSessionProgress } from "./activation";
import { experimentProps } from "./experiment";
import { analyticsSuppressionReason, captureOrQueue } from "./browserAnalytics";

const RECIPIENT_KEY = "wf_invite_recipient_v1";
const SENT_KEY = "wf_invite_sent_v1";
const RECIPIENT_TTL_MS = 14 * 86400000;
const RECIPIENT_ACTIVATION_EVENTS = new Set([
  "detail_open",
  "save",
  "itinerary_stop_added",
  "ask_invite_itinerary_saved",
  "ask_invite_planner_opened",
  "ask_invite_created",
  "partner_click",
  "commerce_cta_clicked",
]);

function readSentInviteKeys() {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(SENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter(
      (entry) =>
        entry &&
        typeof entry.k === "string" &&
        entry.k &&
        Number.isFinite(entry.ts) &&
        now - entry.ts <= RECIPIENT_TTL_MS
    );
  } catch (e) {
    return [];
  }
}

export function recordInviteSent(key) {
  if (typeof window === "undefined" || !window.localStorage) return false;
  const k = typeof key === "string" ? key.trim().slice(0, 16) : "";
  if (!k) return false;
  try {
    const now = Date.now();
    const list = readSentInviteKeys().filter((entry) => entry.k !== k);
    list.push({ k, ts: now });
    window.localStorage.setItem(SENT_KEY, JSON.stringify(list.slice(-50)));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Persist a privacy-safe first-party marker when an invite recipient opens `/ask`.
 * Never stores personal names, notes, or raw message payloads.
 */
export function recordInviteRecipient(inv) {
  if (typeof window === "undefined" || !window.localStorage) return null;
  if (!inv || typeof inv !== "object") return null;
  try {
    const k = typeof inv.key === "string" ? inv.key.trim() : "";
    if (k && readSentInviteKeys().some((entry) => entry.k === k)) {
      return null;
    }
    const surface = String(inv.surface || "direct").slice(0, 24);
    const city = String(inv.city || "").slice(0, 32);
    const existing = readInviteRecipient();
    const next = {
      ts: Date.now(),
      surface: surface || (existing && existing.surface) || "direct",
      city: city || (existing && existing.city) || "",
      activated: Boolean(existing && existing.activated),
    };
    window.localStorage.setItem(RECIPIENT_KEY, JSON.stringify(next));
    return next;
  } catch (e) {
    return null;
  }
}

export function readInviteRecipient() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RECIPIENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Number.isFinite(parsed.ts)) return null;
    if (Date.now() - parsed.ts > RECIPIENT_TTL_MS) {
      window.localStorage.removeItem(RECIPIENT_KEY);
      return null;
    }
    return parsed;
  } catch (e) {
    return null;
  }
}

export function track(event, params) {
  if (typeof window === "undefined") return { posthog: false, google: null, session: [] }; // SSR no-op
  try {
    if (window.__WF_ANALYTICS_SUPPRESSED || analyticsSuppressionReason({ storage: window.localStorage, userAgent: window.navigator.userAgent, webdriver: window.navigator.webdriver })) {
      return { posthog: false, google: null, session: [] };
    }
  } catch {}
  const name = typeof event === "string" ? event.trim() : "";
  if (!name) return { posthog: false, google: null, session: [] };
  const attrib = (() => { try { return attributionParams(); } catch (e) { return {}; } })();
  // Experiment slice (empty object when the visitor was never exposed, so
  // events outside the experiment are byte-identical to before).
  const exp = (() => { try { return experimentProps(); } catch (e) { return {}; } })();
  const rec = readInviteRecipient();
  const recProps = rec ? { from_ask_invite: true, invite_surface: rec.surface || "direct" } : {};
  const payload = Object.assign({}, recProps, params || {}, attrib, exp);

  let captured = false;
  // Pre-ready queue: a landing-page event fired before the idle-booted SDK
  // exists is held and delivered on init, instead of silently dropped.
  try { captured = !!captureOrQueue(window, name, payload); } catch (e) {}

  if (rec && !rec.activated && RECIPIENT_ACTIVATION_EVENTS.has(name)) {
    try {
      rec.activated = true;
      window.localStorage.setItem(RECIPIENT_KEY, JSON.stringify(rec));
      captureOrQueue(window, "ask_recipient_activated", {
        invite_surface: rec.surface || "direct",
        trigger: name,
        city: rec.city || payload.city || "",
      });
    } catch (e) {}
  }

  let google = null;
  try { google = forwardToGoogle(name, payload); } catch (e) {}
  // Meta pixel mirror: partner_click (the verified affiliate handoff) is sent
  // ONLY through this path, so it must forward here as well as in home.js.
  try { forwardToMeta(name, payload); } catch (e) {}

  // Session-scoped milestones (first_intent / session_activated). Additive and
  // once-only — they never replace or duplicate the action event above.
  let session = [];
  try { session = noteSessionProgress(name, payload); } catch (e) {}

  return { posthog: captured, google, session };
}
