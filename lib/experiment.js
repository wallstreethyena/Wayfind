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
//   - assignment  -> localStorage (persists across sessions, so a returning
//                    visitor stays in the same arm; re-randomizing them would
//                    contaminate both arms)
//   - entry context -> sessionStorage (entry_page/page_type/city belong to THIS
//                    visit; carrying them across sessions would misattribute a
//                    later direct visit to a guide read last week)
//
// Assignment is a deterministic hash of (anonymous id + experiment key). No
// server, no flicker, no network dependency — and the same visitor always lands
// in the same arm even if storage is read before PostHog finishes loading.
//
// Exposure is recorded BEFORE any interaction, using PostHog's native
// `$feature_flag_called` event so the experiment shows up in PostHog's own
// tooling without renaming a single product event.

export const EXPERIMENT_KEY = "explore-bridge";
export const VARIANTS = ["control", "treatment"];

const K_ID = "wf_exp_id";
const K_ASSIGN = "wf_exp_" + EXPERIMENT_KEY;
const K_CTX = "wf_exp_ctx";
const K_EXPOSED = "wf_exp_exposed_" + EXPERIMENT_KEY;

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
export function variantForId(id, key) {
  return bucketForId(id, key) < 50 ? "control" : "treatment";
}

function randomId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const a = new Uint32Array(4); crypto.getRandomValues(a);
      return Array.from(a).map((n) => n.toString(16)).join("");
    }
  } catch (e) {}
  // Last resort only; never reached in a browser that supports the app.
  return "x" + String(Date.now()) + String(Math.floor(Math.random() * 1e9));
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
 * Record where this visit entered. Stored per-session so in-app events fired
 * after the navigation can still be attributed to the static entry page.
 */
export function setEntryContext(ctx) {
  const s = ss();
  if (!s || !ctx) return;
  try {
    if (s.getItem(K_CTX)) return; // first entry of the session wins
    s.setItem(K_CTX, JSON.stringify({
      entry_page: String(ctx.entry_page || "").slice(0, 120) || null,
      page_type: String(ctx.page_type || "").slice(0, 40) || null,
      city: ctx.city ? String(ctx.city).slice(0, 60) : null,
    }));
  } catch (e) {}
}

export function getEntryContext() {
  const s = ss();
  if (!s) return {};
  try {
    const raw = s.getItem(K_CTX);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? o : {};
  } catch (e) { return {}; }
}

/**
 * The properties attached to EXISTING product events so any of them can be
 * sliced by arm. Returns {} when the visitor was never exposed — events outside
 * the experiment stay completely unchanged.
 */
export function experimentProps() {
  const s = ss();
  if (!s) return {};
  let exposed = false;
  try { exposed = !!s.getItem(K_EXPOSED); } catch (e) { return {}; }
  if (!exposed) return {};
  const variant = (() => { const l = ls(); try { return l && l.getItem(K_ASSIGN); } catch (e) { return null; } })();
  if (!variant) return {};
  const ctx = getEntryContext();
  const out = { experiment: EXPERIMENT_KEY, variant };
  if (ctx.entry_page) out.entry_page = ctx.entry_page;
  if (ctx.page_type) out.page_type = ctx.page_type;
  if (ctx.city) out.city = ctx.city;
  return out;
}

/**
 * Fire the exposure event — once per session, BEFORE any interaction.
 * Uses PostHog's native `$feature_flag_called` so the experiment is visible in
 * PostHog's feature-flag tooling without touching product event names.
 *
 * @returns {string|null} the variant the visitor was exposed to
 */
export function recordExposure(ctx, capture) {
  const variant = getVariant();
  if (!variant) return null;
  setEntryContext(ctx);
  const s = ss();
  let already = false;
  try { already = !!(s && s.getItem(K_EXPOSED)); } catch (e) {}
  // Mark exposed BEFORE emitting so experimentProps() is populated for any
  // event fired in the same tick, and so a throw cannot cause a double-fire.
  try { if (s) s.setItem(K_EXPOSED, "1"); } catch (e) {}
  if (already) return variant;

  const emit = capture || ((name, props) => {
    try { if (typeof window !== "undefined" && window.posthog) window.posthog.capture(name, props); } catch (e) {}
  });
  const c = getEntryContext();
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
