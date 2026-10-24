// lib/searchShareUrl.js — the shareable search URL, and its app handoff.
//
// Search itself lives in the app shell: app/home.js already restores a
// search from /?q=<text> (plus the guide companions intent=place and
// near=<City, FL>) and runs it through submitSearch once the center is
// known. /search?q=... is the public, shareable spelling of that same
// state — a thin bridge route (app/search/page.js) that hands off to the
// /?q= form, exactly the way /events hands off to /?go=events. There is
// no second search engine and no new state: the query, the optional
// place intent, and the optional near market are the whole supported
// set, because those are the only search inputs the shell reads from a
// URL. The reader's own center (wf_center, then GPS) still decides
// "near" when near= is absent — a shared link never carries the sender's
// coordinates.
//
// Length caps mirror the consumers: /api/search slices q at 160 and
// home.js slices the guide near= at 160, so the bridge never forwards
// more than the search would accept anyway.

export const SEARCH_QUERY_MAX = 160;
export const SEARCH_NEAR_MAX = 160;
export const SEARCH_INTENT_MAX = 160;

function clean(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function first(searchParams, key) {
  if (!searchParams) return "";
  if (typeof searchParams.get === "function") {
    try { return searchParams.get(key) || ""; } catch (e) { return ""; }
  }
  const v = searchParams[key];
  return Array.isArray(v) ? v[0] || "" : v || "";
}

/**
 * The supported search state in a URL, normalized. Empty fields are
 * absent, never empty strings, so callers can test presence directly.
 */
export function searchShareState(searchParams) {
  const q = clean(first(searchParams, "q"), SEARCH_QUERY_MAX);
  const intent = clean(first(searchParams, "intent"), SEARCH_INTENT_MAX);
  const near = clean(first(searchParams, "near"), SEARCH_NEAR_MAX);
  const state = {};
  if (q) state.q = q;
  if (intent) state.intent = intent;
  // near= only steers a search the URL actually runs (home.js reads it
  // solely as the companion of q/intent), so it never travels alone.
  if (near && (q || intent)) state.near = near;
  return state;
}

/** The shareable URL itself: /search?q=... — what a reader copies. */
export function searchSharePath(searchParams) {
  const state = searchShareState(searchParams);
  const sp = new URLSearchParams();
  if (state.q) sp.set("q", state.q);
  if (state.intent) sp.set("intent", state.intent);
  if (state.near) sp.set("near", state.near);
  const qs = sp.toString();
  return "/search" + (qs ? "?" + qs : "");
}

/**
 * Where the bridge lands: the /?q= form app/home.js already consumes.
 * A /search with no query is just the homepage — no empty search runs.
 */
export function searchAppTarget(searchParams) {
  const state = searchShareState(searchParams);
  const sp = new URLSearchParams();
  if (state.q) sp.set("q", state.q);
  if (state.intent) sp.set("intent", state.intent);
  if (state.near) sp.set("near", state.near);
  const qs = sp.toString();
  return "/" + (qs ? "?" + qs : "");
}
