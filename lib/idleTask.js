// onIdle — run non-critical work after the browser has finished the work the
// user can actually see.
//
// Why this exists: the homepage fired 17 metered third-party searches on load
// (11 Google Places + 6 Foursquare, measured live 2026-07-28). Several were not
// feeding the feed at all — they were fetching a DECORATIVE hero photo for a
// card that already has owned artwork as its fallback, and each one then
// chained into a vision-model /api/image-score call. That work competed with
// the first screen for both network and main thread, and cost money doing it.
//
// Deferring changes WHEN, never WHETHER: the hero still upgrades, just after
// the visible feed has had the network to itself. The card is never empty in
// the meantime because the art fallback is what renders until then.
//
// Returns a cancel function so a React effect's cleanup can abort work that is
// still queued when the user navigates away — otherwise a deferred fetch
// outlives its component and calls setState on an unmounted tree.

const DEFAULT_TIMEOUT_MS = 2500;

export function onIdle(fn, opts) {
  const timeout = (opts && opts.timeout) || DEFAULT_TIMEOUT_MS;

  // SSR / non-browser: run synchronously. There is no paint to protect, and
  // silently skipping would make server and client render different things.
  if (typeof window === "undefined") {
    try { fn(); } catch (e) {}
    return () => {};
  }

  let cancelled = false;
  const guarded = () => { if (!cancelled) { try { fn(); } catch (e) {} } };

  // requestIdleCallback is absent on Safari <17, which is a meaningful share of
  // this audience (iOS). The setTimeout fallback is not equivalent, but it does
  // the one thing that matters: it yields, so the deferred work lands after the
  // current render and the first wave of critical fetches.
  if (typeof window.requestIdleCallback === "function") {
    // The `timeout` cap matters: without it, a page that never goes idle (a map
    // animating, a long scroll) would defer this forever and the hero would
    // never upgrade at all.
    const id = window.requestIdleCallback(guarded, { timeout });
    return () => {
      cancelled = true;
      try { window.cancelIdleCallback(id); } catch (e) {}
    };
  }

  const id = setTimeout(guarded, 1);
  return () => { cancelled = true; clearTimeout(id); };
}

export default onIdle;
