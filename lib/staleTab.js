// lib/staleTab.js — the pure half of the stale-tab watch.
//
// app/components/VersionWatch.js owns the WIRING (listeners, fetch, reload);
// this file owns the two DECISIONS, so they can be asserted in Node
// (scripts/test-stale-tab.mjs) instead of reasoned about. Every previous
// version of this mechanism was argued into existence and never measured,
// and both times it was wrong in a way a five-line test would have caught.
//
// THE 2026-08-27 INCIDENT. The owner asked for the fall place card to be
// fixed. It was fixed, merged, deployed, and verified live on the server —
// and his phone kept showing the bug until he pulled down to refresh. His
// question afterwards is the reason this file exists: "a lot of people don't
// know how to refresh." They don't. A user who never learns the gesture never
// sees the fix, and every bug we close stays open for them forever.
//
// Why VersionWatch missed it: it deliberately did NOT check on first mount,
// on the theory that "a tab that just loaded IS the current build." That is
// only true when the document came off the NETWORK. It routinely doesn't:
// iOS Safari serves a back/forward navigation straight out of its cache
// without revalidating, no matter what Cache-Control says, and Wayfind's
// place-card CSS is INLINED INTO THE DOCUMENT — so a cached document is
// cached CSS, which is exactly the bug he was still looking at.

// How long the page must be untouched before an unprompted reload is polite.
// Twenty seconds is longer than a scroll flick and shorter than reading a
// place card, which is the line we actually care about.
export const IDLE_MS = 20000;

// Did THIS document come off a cache shelf rather than the wire?
// `nav` is a PerformanceNavigationTiming entry (or null on browsers/contexts
// that don't give us one — in which case we say no and fall back to the
// event triggers, never guessing our way into a reload).
export function documentMayBeStale(nav) {
  if (!nav) return false;
  // A history navigation is ALLOWED to skip revalidation entirely, so the
  // document can predate the deploy by any amount. This is the iOS path.
  if (nav.type === "back_forward" || nav.type === "prerender") return true;
  // Zero bytes crossed the wire for a same-origin document: the browser
  // answered from its own cache without asking us. (A 304 revalidation still
  // transfers headers, so it lands above zero and is correctly treated as
  // fresh — the server did get a say.)
  if (typeof nav.transferSize === "number" && nav.transferSize === 0) return true;
  return false;
}

// What, right now, would a reload destroy? Returns the reasons rather than a
// boolean so the caller can decide (reload / defer / stay quiet) and so a
// failing test names the thing it caught.
export function reloadBlockers(env) {
  const e = env || {};
  const out = [];
  // Offline: a reload here does not deliver a fix, it delivers the error page.
  if (e.online === false) out.push("offline");
  // A sheet, dialog or menu is open — they are mid-decision, possibly mid-tap
  // on an affiliate booking. Never yank that away.
  if (e.hasOpenDialog) out.push("dialog");
  // Typing into search or the auth form. A reload eats the text.
  if (e.editing) out.push("editing");
  // A creator video is playing. Reloading mid-video is the rudest thing here.
  if (e.playingMedia) out.push("media");
  // They touched the page a moment ago, so they are reading or scrolling.
  if (typeof e.msSinceInteraction === "number" && e.msSinceInteraction < IDLE_MS) out.push("busy");
  return out;
}
