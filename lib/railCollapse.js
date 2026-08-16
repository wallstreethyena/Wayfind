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

import { setLocal } from "./localStore";

export const RAILS_COLLAPSED_KEY = "wf_rails_collapsed";

// Experiment default (owner handoff, 2026-08-10): show ONE answer immediately
// and leave every path beneath it optional. A reader's stored choice still
// wins; this list is used only when the key has never been written.
// "best" LEFT THIS LIST on 2026-08-16, and it had to. Until that day the one
// section a new reader landed on already open was Exploding Trends Near You.
// That section was removed (it could only ever render its own error — no trend
// snapshot has ever been imported), and with it gone every remaining id was in
// this list, so the phone default became a page of nothing but closed headers.
// "The Best Around You" inherits the open slot: it is the answer section, it
// needs no third-party data, and it fills in every metro.
export const DEFAULT_COLLAPSED_RAILS = ["eat", "quickbite", "todo", "gems", "creators", "tonight", "drive", "budget", "events", "trends"];

// THE DESKTOP DEFAULT (v7.29, owner 2026-08-12: "can we make the desktop
// version of wayfind fit nice").
//
// The list above is a PHONE decision and it is the right one there: one answer,
// every other path optional, because a phone screen can hold one rail of cards
// and a thumb has to travel past everything it does not want. A desktop window
// is ~860px tall with a pointer, and the same default turns the entire first
// screen into a table of contents — eleven headings, no photograph, no price,
// no booking control anywhere above the fold. The reader is asked to pick a
// section before being shown a single thing the site actually found.
//
// So desktop opens the head of the feed and leaves the tail closed. DERIVED,
// not a second hand-maintained list: a rail added to the phone default is
// automatically in the desktop default too, unless it is named below.
// "best" is no longer here because it is no longer COLLAPSED anywhere — this
// list may only name rails the phone default closes, or it stops being a
// derivation of the phone list and becomes a second hand-kept one.
export const RAILS_OPEN_ON_DESKTOP = ["eat"];
export const DEFAULT_COLLAPSED_RAILS_DESKTOP = DEFAULT_COLLAPSED_RAILS.filter((id) => RAILS_OPEN_ON_DESKTOP.indexOf(id) === -1);

// Must equal WF_DESKTOP_BP in app/components/css.js. It is restated rather than
// imported because css.js already imports RAIL_IDS from this file and the other
// direction would close the cycle; scripts/test-layout-shift.mjs asserts the two
// numbers agree so the restatement cannot drift.
export const RAILS_DESKTOP_MQ = "(min-width:900px)";

export function defaultCollapsedFor(desktop) {
  return (desktop ? DEFAULT_COLLAPSED_RAILS_DESKTOP : DEFAULT_COLLAPSED_RAILS).slice();
}

// Browser-only, fails soft to the phone default — the narrower answer is the
// safe one, since it can only ever leave a section closed that could have been
// open, never the reverse.
export function prefersDesktopRails() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try { return !!window.matchMedia(RAILS_DESKTOP_MQ).matches; } catch (e) { return false; }
}

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
  // The SERVER answer stays the phone default and must: "/" is ISR-cached, so
  // one HTML document is served to every screen. The pre-paint script in
  // app/layout.js is what re-decides at the real width, before anything paints.
  if (typeof window === "undefined") return DEFAULT_COLLAPSED_RAILS.slice();
  try {
    const raw = window.localStorage.getItem(RAILS_COLLAPSED_KEY);
    return raw == null ? defaultCollapsedFor(prefersDesktopRails()) : parseCollapsed(raw);
  } catch (e) { return defaultCollapsedFor(prefersDesktopRails()); }
}

export function writeCollapsed(list) {
  if (typeof window === "undefined") return;
  const clean = parseCollapsed(JSON.stringify(Array.isArray(list) ? list : []));
  // v7.08 — setLocal, not setItem. Measured on the owner's phone: the store
  // was five characters under its 5MB quota, so this write threw
  // QuotaExceededError and the bare catch swallowed it. React updated, the
  // section closed, <html> got the attribute, and the preference was never
  // stored — which is exactly what "the menus were not like I left them"
  // looks like from the outside. setLocal evicts CACHE and retries, so a
  // refetchable query result can no longer outrank a reader's choice.
  setLocal(RAILS_COLLAPSED_KEY, JSON.stringify(clean));
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
export const RAIL_IDS = ["exploding", "best", "eat", "quickbite", "todo", "gems", "creators", "tonight", "drive", "budget", "events", "trends"];

// THE OTHER HALF OF THE PRE-PAINT, AND A BUG THAT WAS ALREADY THERE (v7.29).
//
// The attribute above can only CLOSE a section. Opening one has always been an
// inline style written by React (BestNearby's SectionShell), and an inline style
// beats a stylesheet — so for any reader whose stored set is SMALLER than
// DEFAULT_COLLAPSED_RAILS, the server HTML painted that section closed and it
// stayed closed until an effect ran and re-opened it. That is the same flash the
// closed direction was fixed for in v7.08, in the opposite direction, and it has
// been shipping ever since. Nobody caught it because the owner's own stored set
// is every section closed, which is the one case where it cannot happen.
//
// Expanding two rails by default on desktop would have made that flash universal
// on desktop, so it is fixed here rather than worked around: css.js emits an
// !important OPEN rule for a section the attribute does not name, scoped to
// html:not([data-wf-rails-ready]) — i.e. it applies from first paint until
// BestNearby has committed the real state, and then gets out of the way so the
// accordion's own max-height transition still animates.
//
// The attribute is therefore ALWAYS set, empty string included: "no section is
// closed" and "we have not decided yet" have to be distinguishable, and
// removeAttribute made them identical.
export const RAILS_READY_ATTR = "data-wf-rails-ready";

export function applyCollapsedAttr(list) {
  if (typeof document === "undefined" || !document.documentElement) return;
  try {
    const clean = parseCollapsed(JSON.stringify(Array.isArray(list) ? list : []));
    document.documentElement.setAttribute(RAILS_COLLAPSED_ATTR, clean.join(" "));
  } catch (e) {}
}

// Called by BestNearby only AFTER the commit that applied the real collapsed
// set, never in the same tick it is computed — the whole point of the marker is
// that it means "the inline styles are now correct".
export function markRailsReady() {
  if (typeof document === "undefined" || !document.documentElement) return;
  try { document.documentElement.setAttribute(RAILS_READY_ATTR, ""); } catch (e) {}
}
