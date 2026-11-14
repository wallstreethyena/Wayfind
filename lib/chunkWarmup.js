// warmChunksInSequence — fetch the homepage's lazily split screen and sheet
// chunks ONE AT A TIME, in idle slices, after the first screen has had the
// network to itself.
//
// WHY (measured 2026-11-13, local production build, 390x844 DPR3, 4x CPU,
// 1.6Mbps/150ms, 6 runs each): app/home.js used to call all 17 screen/sheet
// loaders inside ONE requestIdleCallback, which fires ~0.7s after hydration:
// the moment the first screen's own data goes out (/api/rails,
// /api/places/search, /api/fsq/search, /api/experiences, /api/weather). Result:
// 33 lazy chunks, 391.8KB gz, all on the wire during the first-screen data
// burst, up to 30 downloads at once, each evaluated on the main thread while
// the feed was rendering. With this module only the 9 chunks the first screen
// actually renders (88.7KB gz, at most 7 at once) share that window; the
// ~303KB gz of warm-up follows one chunk at a time.

// Warming changes WHEN, never WHETHER: every loader still runs, so the first tap
// on Saved, Map, Events, a place card... still finds its chunk warm. A loader
// that has not run yet is not a broken tap either: next/dynamic loads the same
// chunk on demand and shows its Loader, exactly as it did before idle fired.
//
// Save-Data and 2g connections skip the warm-up entirely: those users asked
// for less data, and on-demand loading still serves every screen they open.

export const WARM_START_DELAY_MS = 4000;
const IDLE_TIMEOUT_MS = 3000;

export function warmupAllowed(nav) {
  const c = nav && nav.connection;
  if (!c) return true;
  if (c.saveData === true) return false;
  return !/(^|-)2g$/.test(String(c.effectiveType || ""));
}

export function warmChunksInSequence(loaders, env) {
  const opts = env || {};
  const w = opts.win || (typeof window !== "undefined" ? window : null);
  const list = Array.isArray(loaders) ? loaders.filter((l) => typeof l === "function") : [];
  if (!w || list.length === 0) return () => {};
  if (!warmupAllowed(opts.nav || w.navigator)) return () => {};

  const hasRic = typeof w.requestIdleCallback === "function";
  const idle = (f) => (hasRic ? w.requestIdleCallback(f, { timeout: IDLE_TIMEOUT_MS }) : w.setTimeout(f, 200));
  const cancelIdle = (h) => { try { if (hasRic) w.cancelIdleCallback(h); else w.clearTimeout(h); } catch (e) {} };

  let cancelled = false;
  let timer = null;
  let idleHandle = null;
  let i = 0;

  const next = () => {
    if (cancelled || i >= list.length) return;
    idleHandle = idle(() => {
      idleHandle = null;
      if (cancelled) return;
      const load = list[i++];
      let p;
      try { p = load(); } catch (e) { p = null; }
      // The next chunk waits for this one to settle (success OR failure), so at
      // most one warm-up chunk is ever on the wire or evaluating at a time.
      Promise.resolve(p).catch(() => {}).then(next);
    });
  };

  const delay = typeof opts.delayMs === "number" ? opts.delayMs : WARM_START_DELAY_MS;
  timer = w.setTimeout(() => { timer = null; next(); }, delay);

  return () => {
    cancelled = true;
    if (timer != null) { try { w.clearTimeout(timer); } catch (e) {} timer = null; }
    if (idleHandle != null) { cancelIdle(idleHandle); idleHandle = null; }
  };
}
