// lib/railCollapse.js — which home-feed rails the reader chose to CLOSE.
//
// THE RULE (owner, 2026-08-09): every rail on the home feed arrives EXPANDED,
// and the reader may close the ones they do not want so the ones they do are
// one scroll apart instead of nine. "keep only the menus they want expanded…
// that way they can research it faster." That is a preference about their own
// screen, so it has to outlive the page view.
//
// THE CLOSED SET IS WHAT IS STORED, never the open set. A rail shipped next
// month is therefore open by default for every existing reader; storing the
// open set would have hidden every future rail from everyone who ever loaded
// this page, silently and forever. Same reason the app stores dislikes rather
// than a whitelist of likes.
//
// Pure functions plus two guarded browser calls, so the rule can be EXECUTED
// by a guard rather than grepped for. Everything here is total over garbage:
// localStorage is user-writable and another tab, an extension, or a half-
// finished write can leave anything at all in that key.

export const RAILS_COLLAPSED_KEY = "wf_rails_collapsed";

// A rail id is short and ours. Anything else in the stored array is dropped
// rather than trusted — an id of unbounded length would let a corrupted value
// grow without limit across writes.
const MAX_ID = 40;
const MAX_IDS = 40;

export function parseCollapsed(raw) {
  try {
    const v = JSON.parse(String(raw == null ? "" : raw));
    if (!Array.isArray(v)) return [];
    const out = [];
    for (const x of v) {
      if (typeof x !== "string") continue;
      const id = x.trim();
      if (!id || id.length > MAX_ID) continue;
      if (out.indexOf(id) === -1) out.push(id);
      if (out.length >= MAX_IDS) break;
    }
    return out;
  } catch (e) {
    return [];
  }
}

export function isCollapsed(list, id) {
  return !!id && Array.isArray(list) && list.indexOf(id) > -1;
}

// Returns a NEW array — callers hand the result straight to writeCollapsed and
// to setState, and mutating the array they were given would make a re-render
// with the old reference show the wrong chevron.
export function nextCollapsed(list, id, collapsed) {
  const out = parseCollapsed(JSON.stringify(Array.isArray(list) ? list : []));
  if (!id) return out;
  const at = out.indexOf(id);
  if (collapsed) { if (at === -1) out.push(id); }
  else if (at > -1) out.splice(at, 1);
  return out;
}

// Browser-only, fails soft. Called from effects, never from a render body:
// app/components is server-rendered first (and mounted by
// scripts/test-home-rails-render-smoke.mjs in plain node), where `window` does
// not exist at all.
export function readCollapsed() {
  if (typeof window === "undefined") return [];
  try { return parseCollapsed(window.localStorage.getItem(RAILS_COLLAPSED_KEY)); } catch (e) { return []; }
}

export function writeCollapsed(list) {
  if (typeof window === "undefined") return;
  const clean = parseCollapsed(JSON.stringify(Array.isArray(list) ? list : []));
  try { window.localStorage.setItem(RAILS_COLLAPSED_KEY, JSON.stringify(clean)); } catch (e) {}
  // Mirrored to a cookie so the preference survives a localStorage clear, and
  // so a future server-rendered home can read it without a round-trip. Nothing
  // reads it yet — "/" is ISR-cached (revalidate 3600) and reading cookies
  // there would make every visitor a dynamic render, which is a real TTFB and
  // cache cost for a preference we can apply before paint for free.
  try { document.cookie = RAILS_COLLAPSED_KEY + "=" + encodeURIComponent(clean.join(" ")) + ";path=/;max-age=31536000;samesite=lax"; } catch (e) {}
  applyCollapsedAttr(clean);
}

// ─── THE PRE-PAINT ATTRIBUTE ────────────────────────────────────────────────
// THE BUG THIS EXISTS FOR (owner, 2026-08-09): "after having collapsed all of
// the menus the way I wanted, when I went back or when I clicked the home page
// the menu was fully open again."
//
// The preference was never lost — localStorage had it the whole time. What the
// reader was seeing is that "/" is ISR-cached (app/page.js, revalidate 3600),
// so the HTML every visitor receives has all nine sections OPEN, and the state
// only becomes correct after React hydrates and an effect reads storage. On a
// phone that is long enough to see, scroll through, and disbelieve.
//
// So the preference is applied to <html> by a blocking script in app/layout.js
// BEFORE the first paint, and CSS keyed off that attribute renders the closed
// sections closed immediately. React then hydrates to the same state and the
// two agree. This is the same technique a dark-mode flash fix uses, and the
// reason it beats the cookie the owner suggested: it costs no dynamic render.
//
// Kept in sync on every write above, so expanding a section releases the
// !important rule in the same tick the React state changes.
export const RAILS_COLLAPSED_ATTR = "data-wf-rails";

// The section ids the home menu can collapse. Declared here, next to the
// storage, because app/components/css.js has to emit one rule per id and both
// have to agree — an id in one and not the other is a section that flashes.
export const RAIL_IDS = ["best", "eat", "todo", "gems", "creators", "tonight", "drive", "budget", "events", "trends"];

export function applyCollapsedAttr(list) {
  if (typeof document === "undefined" || !document.documentElement) return;
  try {
    const clean = parseCollapsed(JSON.stringify(Array.isArray(list) ? list : []));
    if (clean.length) document.documentElement.setAttribute(RAILS_COLLAPSED_ATTR, clean.join(" "));
    else document.documentElement.removeAttribute(RAILS_COLLAPSED_ATTR);
  } catch (e) {}
}
