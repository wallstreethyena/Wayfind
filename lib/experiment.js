// lib/experiment.js — stable 50/50 assignment + exposure, for real A/B reads.
//
// WHY IT IS BUILT THIS WAY
// ------------------------
// The experiment measures whether a decision bridge on static content pages
// converts readers into product users. The primary outcome is:
//
//     detail_open attributable to the STATIC ENTRY PAGE, within the session
//
// That outcome is earned on a DIFFERENT page than the one that fires it: the
// visitor is assigned on /guides/x, then activates inside the app at "/". So
// assignment and entry context must survive a full navigation, or every
// activation lands in "unknown variant" and the experiment reads nothing.
//
//   - assignment  -> localStorage. Sticky ACROSS sessions on purpose: a
//                    returning visitor must stay in the same arm, or both arms
//                    are contaminated.
//   - entry context -> keyed to the POSTHOG SESSION ID, not to the tab.
//
// THE SESSION TRAP (the defect this file was rewritten to fix)
// ------------------------------------------------------------
// sessionStorage lives for the lifetime of a TAB. A PostHog session ends after
// 30 minutes idle (24h max). They are independent clocks, so tab-scoped state
// silently outlives the analytics session it was meant to describe:
//
//   1. Visitor reads /guides/x, idles 45 min in the same tab, comes back and
//      opens a place. PostHog has started a NEW session. The old "already
//      exposed" flag suppresses a fresh exposure, so the converting session has
//      NO exposure event -> it lands in the numerator with no denominator, and
//      the ratio inflates.
//   2. entry_page survives the boundary, so that place-open is attributed to a
//      guide read in a PREVIOUS session — violating the "within the same
//      session" definition of the primary metric.
//
// Neither bias is symmetric: whichever arm holds attention longer accumulates
// more of it, which is the arm we hope wins. So it biases toward a false
// positive. Both are fixed by stamping the context with posthog.get_session_id()
// (verified present in posthog-js 1.407.2) and treating a changed session id as
// a new exposure with expired entry attribution.
//
// Assignment is a deterministic hash of (anonymous id + experiment key). No
// server, no flicker, no network dependency — and the same visitor always lands
// in the same arm even if storage is read before PostHog finishes loading.

// Versioned. Bump the suffix to hard-restart: every visitor is re-bucketed
// under the new key and old assignments/exposures go inert. That is the only
// correct response to a change in treatment or measurement semantics — reusing
// a key across such a change silently mixes two experiments into one number.
export const EXPERIMENT_KEY = "explore-bridge-v1";
export const VARIANTS = ["control", "treatment"];

// Share of traffic receiving the treatment, 0-100.
//   50  -> the A/B test
//   100 -> ship-to-everyone (no control arm; pre/post reading only)
// Changing this does NOT move already-assigned visitors — assignment is sticky
// — so a mid-flight change applies to NEW visitors only and makes the arms
// non-comparable. Only ever change it together with an EXPERIMENT_KEY bump.
export const TREATMENT_PCT = 50;

const K_ID = "wf_exp_id";
const K_ASSIGN = "wf_exp_" + EXPERIMENT_KEY;
const K_CTX = "wf_exp_ctx_" + EXPERIMENT_KEY;
const K_EXPOSED = "wf_exp_exposed_" + EXPERIMENT_KEY;

// PostHog's own convention for flag-based analysis — posthog-js 1.407.2
// prefixes flag properties with "$feature/". Registered as a SUPER property so
// autocaptured events we never touch ($pageview, web_vitals, $rageclick,
// $dead_click) also carry the variant. That is the only way to compare CLS or
// bounce by arm, which failure mode 4 requires.
export const FEATURE_PROP = "$feature/" + EXPERIMENT_KEY;

function ls() { if (typeof window === "undefined") return null; try { return window.localStorage; } catch (e) { return null; } }
function ss() { if (typeof window === "undefined") return null; try { return window.sessionStorage; } catch (e) { return null; } }

// FNV-1a followed by a murmur3 avalanche finalizer.
//
// The finalizer is NOT optional. Raw FNV-1a's LOW BIT is simply the parity of
// the input bytes' low bits (the prime is odd, so multiplication preserves bit
// 0, and each step only XORs a byte into it). Bucketing on `% 2` therefore made
// assignment a pure parity function: two different experiment keys came out
// perfectly ANTI-correlated — 0% overlap across 2,000 ids — so a second
// experiment would have been a mirror of this one on every visitor. The
// prebuild test caught exactly that. The avalanche mixes high bits down so all
// 32 bits are usable, and bucketing happens on a percentile rather than bit 0.
export function hashString(s) {
  let h = 0x811c9dc5;
  const str = String(s || "");
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** 0-99 bucket. Exposed so a future experiment can split other than 50/50. */
export function bucketForId(id, key) {
  return hashString(String(id) + "|" + String(key || EXPERIMENT_KEY)) % 100;
}

/** Pure: which arm this id belongs to. Deterministic and testable. */
export function variantForId(id, key, treatmentPct) {
  const pct = typeof treatmentPct === "number" ? treatmentPct : TREATMENT_PCT;
  return bucketForId(id, key) < pct ? "treatment" : "control";
}

// Failure mode 6: a weak id source skews assignment. crypto.randomUUID is the
// primary path; getRandomValues the fallback. The final branch is Date+Math
// .random, which is NOT uniform enough to trust — so it tags itself, letting
// the SRM check see whether any meaningful share of visitors landed there.
export function randomId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const a = new Uint32Array(4); crypto.getRandomValues(a);
      return Array.from(a).map((n) => n.toString(16).padStart(8, "0")).join("");
    }
  } catch (e) {}
  return "weak-" + String(Date.now()) + "-" + String(Math.floor(Math.random() * 1e9));
}

/**
 * Failure mode 5: automated traffic should never enter either arm. It cannot
 * bias the comparison (it is symmetric), but it dilutes both denominators and
 * makes the SRM check noisier. Cheap client-side signals only — the
 * authoritative bot flag is applied server-side at analysis time.
 */
export function looksAutomated(nav) {
  const n = nav || (typeof navigator !== "undefined" ? navigator : null);
  if (!n) return false;
  try {
    if (n.webdriver === true) return true;
    return /bot|crawler|spider|crawling|headless|phantom|puppeteer|playwright|lighthouse/i.test(String(n.userAgent || ""));
  } catch (e) { return false; }
}

/** The current PostHog analytics session id, or null if the SDK is not up. */
export function currentSessionId(ph) {
  const p = ph || (typeof window !== "undefined" ? window.posthog : null);
  if (!p || typeof p.get_session_id !== "function") return null;
  try { const id = p.get_session_id(); return id ? String(id) : null; } catch (e) { return null; }
}

/** The persistent anonymous id used for assignment. Created once, then reused. */
export function experimentId() {
  const s = ls();
  if (!s) return null;
  try {
    let id = s.getItem(K_ID);
    if (!id) { id = randomId(); s.setItem(K_ID, id); }
    return id;
  } catch (e) { return null; }
}

/**
 * The visitor's arm. Sticky: once written it is never recomputed, so changing
 * the hash or the id later cannot move someone mid-experiment.
 */
export function getVariant() {
  const s = ls();
  if (!s) return null; // SSR — caller must render the control markup
  try {
    const existing = s.getItem(K_ASSIGN);
    if (existing === "control" || existing === "treatment") return existing;
    const id = experimentId();
    if (!id) return null;
    const v = variantForId(id, EXPERIMENT_KEY);
    s.setItem(K_ASSIGN, v);
    return v;
  } catch (e) { return null; }
}

/**
 * Record where this visit entered, STAMPED WITH THE ANALYTICS SESSION ID.
 * The stamp is what makes entry attribution expire on a PostHog session
 * rollover instead of living as long as the browser tab.
 */
export function setEntryContext(ctx, sessionId) {
  const s = ss();
  if (!s || !ctx) return;
  try {
    const sid = sessionId || currentSessionId();
    const prev = readCtxRaw();
    // First entry of a given analytics session wins; a NEW session overwrites,
    // so a later visit never inherits the previous session's entry page.
    if (prev && prev.session_id && sid && prev.session_id === sid) return;
    s.setItem(K_CTX, JSON.stringify({
      session_id: sid || null,
      entry_page: String(ctx.entry_page || "").slice(0, 120) || null,
      page_type: String(ctx.page_type || "").slice(0, 40) || null,
      city: ctx.city ? String(ctx.city).slice(0, 60) : null,
    }));
  } catch (e) {}
}

function readCtxRaw() {
  const s = ss();
  if (!s) return null;
  try {
    const raw = s.getItem(K_CTX);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? o : null;
  } catch (e) { return null; }
}

/**
 * Pure decision helper: is the stored entry context still valid for the
 * session we are currently in? Exported so the semantics are testable.
 */
export function contextIsCurrent(stored, sessionId) {
  if (!stored) return false;
  // Unknown session on either side => refuse to claim entry attribution. A
  // wrong attribution is worse than a missing one.
  if (!stored.session_id || !sessionId) return false;
  return stored.session_id === sessionId;
}

/**
 * The entry context, but ONLY if it belongs to the analytics session we are in
 * right now. A stale context (tab outlived its PostHog session) reads as empty,
 * so a later conversion is never attributed to an earlier session's guide.
 */
export function getEntryContext(sessionId) {
  const stored = readCtxRaw();
  const sid = sessionId !== undefined ? sessionId : currentSessionId();
  if (!contextIsCurrent(stored, sid)) return {};
  return { entry_page: stored.entry_page || null, page_type: stored.page_type || null, city: stored.city || null };
}

/**
 * The properties attached to EXISTING product events so any of them can be
 * sliced by arm. Returns {} when the visitor was never exposed — events outside
 * the experiment stay completely unchanged.
 *
 * `variant` is reported whenever the visitor has been exposed at any point
 * (assignment is legitimately cross-session sticky). Entry attribution is
 * reported ONLY for the session it was captured in.
 */
export function experimentProps(sessionId) {
  const s = ss();
  if (!s) return {};
  let exposed = false;
  try { exposed = !!s.getItem(K_EXPOSED); } catch (e) { return {}; }
  if (!exposed) return {};
  const variant = (() => { const l = ls(); try { return l && l.getItem(K_ASSIGN); } catch (e) { return null; } })();
  if (!variant) return {};
  const ctx = getEntryContext(sessionId);
  const out = { experiment: EXPERIMENT_KEY, variant };
  out[FEATURE_PROP] = variant; // PostHog's flag-analysis convention
  if (ctx.entry_page) out.entry_page = ctx.entry_page;
  if (ctx.page_type) out.page_type = ctx.page_type;
  if (ctx.city) out.city = ctx.city;
  return out;
}

/**
 * Record exposure — once per ANALYTICS SESSION, before any interaction.
 *
 * Keyed on posthog.get_session_id() rather than on the tab. When PostHog rolls
 * the session (30 min idle) the visitor is exposed again, so every session that
 * can convert also has a denominator entry. Fires for BOTH arms.
 *
 * Also registers the variant as a PostHog SUPER property, which is what makes
 * autocaptured events ($pageview, web_vitals, $rageclick, $dead_click) carry
 * the arm — required to compare CLS and bounce between variants.
 *
 * @returns {string|null} the variant, or null if not assignable (SSR / bot)
 */
export function recordExposure(ctx, capture, opts) {
  const o = opts || {};
  // Failure mode 5: automation never enters either arm.
  if (o.skipAutomationCheck !== true && looksAutomated(o.navigator)) return null;

  const variant = getVariant();
  if (!variant) return null;

  const sid = o.sessionId !== undefined ? o.sessionId : currentSessionId();
  setEntryContext(ctx, sid);

  const s = ss();
  let prevExposedSid = null;
  try { prevExposedSid = s && s.getItem(K_EXPOSED); } catch (e) {}
  // Mark BEFORE emitting so experimentProps() is populated for anything fired
  // in the same tick, and so a throw cannot cause a double-fire.
  try { if (s) s.setItem(K_EXPOSED, sid || "1"); } catch (e) {}

  // Attach the variant to every future event, including ones we never call.
  const ph = o.posthog || (typeof window !== "undefined" ? window.posthog : null);
  if (ph && typeof ph.register === "function") {
    try { ph.register({ [FEATURE_PROP]: variant, experiment: EXPERIMENT_KEY, variant }); } catch (e) {}
  }

  // Already exposed in THIS analytics session -> nothing more to emit.
  if (prevExposedSid && sid && prevExposedSid === sid) return variant;
  // Unknown session id on both sides: fall back to once-per-tab rather than
  // re-firing on every mount.
  if (prevExposedSid && !sid) return variant;

  const emit = capture || ((name, props) => {
    try { if (ph) ph.capture(name, props); } catch (e) {}
  });
  const c = getEntryContext(sid);
  emit("$feature_flag_called", {
    $feature_flag: EXPERIMENT_KEY,
    $feature_flag_response: variant,
    entry_page: c.entry_page || null,
    page_type: c.page_type || null,
    city: c.city || null,
  });
  return variant;
}

/** Test seam. */
export function _reset() {
  const l = ls(), s = ss();
  try { if (l) { l.removeItem(K_ID); l.removeItem(K_ASSIGN); } } catch (e) {}
  try { if (s) { s.removeItem(K_CTX); s.removeItem(K_EXPOSED); } } catch (e) {}
}
