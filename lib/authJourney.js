// Signup journey: ONE place decides when an account sign-in counts as a
// signup_completed or a login_completed. Before this, the only real signup
// path (web Google OAuth, a full-page redirect) emitted nothing but the
// generic auth_event, and the per-path emissions (password, native) missed
// signup_completed for Apple/Google. See docs/proposals/claude-signup-journey-findings.md.
//
// Contract: completion is emitted from the Supabase onAuthStateChange handler
// ONLY, through runAuthTransition(). No other code path may log
// signup_completed or login_completed (locked by scripts/test-auth-journey.mjs).

export const NEW_ACCOUNT_WINDOW_MS = 10 * 60 * 1000;
export const SEEN_PREFIX = "wf_auth_seen_";
export const ATTEMPT_KEY = "wf_auth_attempt";
export const LOGIN_DONE_PREFIX = "wf_auth_login_";

function ms(v) {
  const t = typeof v === "string" || typeof v === "number" ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : NaN;
}

// A provider name for the event. Supabase says "email" for password accounts;
// the old per-path emission said "password", so keep that spelling.
export function authMethodOf(user) {
  const p = user && user.app_metadata && user.app_metadata.provider;
  if (!p) return "unknown";
  return p === "email" ? "password" : String(p);
}

function isNewAccount(user, now) {
  const t = Number.isFinite(now) ? now : Date.now();
  // created_at covers OAuth and password signups that sign in at once. The
  // confirmation time covers an email signup confirmed from the link later.
  return [user.created_at, user.email_confirmed_at, user.confirmed_at].some((v) => {
    const at = ms(v);
    return Number.isFinite(at) && t - at >= -60000 && t - at <= NEW_ACCOUNT_WINDOW_MS;
  });
}

/**
 * Pure classification. Returns "signup", "login", or null.
 *   event          Supabase auth event name
 *   user           session.user (or null)
 *   now            epoch ms
 *   seen           true when this device already counted this user (marker wf_auth_seen_<uid>)
 *   attempted      true when this tab started a sign-in (auth_method_clicked set the flag)
 *   loginCounted   true when a login was already counted for this uid in this tab session
 * INITIAL_SESSION, TOKEN_REFRESHED, SIGNED_OUT and the rest never complete anything.
 * A returning user's silent SIGNED_IN (tab focus re-validation) is not a login:
 * a login needs an attempt started in this tab.
 */
export function classifyAuthTransition({ event, user, now, seen, attempted, loginCounted } = {}) {
  if (event !== "SIGNED_IN") return null;
  if (!user || !user.id) return null;
  if (!seen && isNewAccount(user, now)) return "signup";
  if (seen && !attempted) return null;
  if (loginCounted) return null;
  return attempted ? "login" : null;
}

function safeGet(store, k) { try { return store ? store.getItem(k) : null; } catch (e) { return null; } }
function safeSet(store, k, v) { try { if (store) store.setItem(k, v); } catch (e) {} }
function safeDel(store, k) { try { if (store) store.removeItem(k); } catch (e) {} }

/** Record that this tab started a sign-in (before an OAuth redirect or a submit). */
export function markAuthAttempt(sessionStore, method) {
  safeSet(sessionStore, ATTEMPT_KEY, String(method || "1"));
}

/**
 * Impure wrapper used by home.js. Reads/writes the markers, then calls
 * log(name, null, {method}) at most once. Returns the event name emitted or null.
 * The marker is written BEFORE log() so a re-entrant or StrictMode-doubled
 * handler cannot emit twice.
 */
export function runAuthTransition({ event, session, now, local, sess, log }) {
  const user = session && session.user;
  if (event !== "SIGNED_IN" || !user || !user.id) return null;
  const seenKey = SEEN_PREFIX + user.id;
  const loginKey = LOGIN_DONE_PREFIX + user.id;
  const kind = classifyAuthTransition({
    event, user, now: Number.isFinite(now) ? now : Date.now(),
    seen: !!safeGet(local, seenKey),
    attempted: !!safeGet(sess, ATTEMPT_KEY),
    loginCounted: !!safeGet(sess, loginKey),
  });
  if (!kind) return null;
  const stamp = String(Number.isFinite(now) ? now : Date.now());
  safeSet(local, seenKey, stamp);
  safeDel(sess, ATTEMPT_KEY);
  if (kind === "login") safeSet(sess, loginKey, stamp);
  const name = kind === "signup" ? "signup_completed" : "login_completed";
  try { if (typeof log === "function") log(name, null, { method: authMethodOf(user) }); } catch (e) {}
  return name;
}
